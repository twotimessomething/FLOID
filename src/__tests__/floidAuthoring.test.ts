import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { AUTHORING_EXAMPLE, AUTHORING_SPEC, buildAuthoringPrompt } from '../data/authoringSpec';
import { extractJson, readAuthoringDocument } from '../utils/floidAuthoring';
import type { AuthoredPlan } from '../utils/floidAuthoring';

function read(doc: unknown): AuthoredPlan {
  const result = readAuthoringDocument(doc);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.plan;
}

function errorsOf(doc: unknown): readonly string[] {
  const result = readAuthoringDocument(doc);
  if (result.ok) throw new Error('expected the document to be refused');
  return result.errors;
}

const doc = (items: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: 'floid-authoring',
  schedules: [{ name: 'Design', items }],
  ...extra,
});

describe('readAuthoringDocument', () => {
  it('reads the spec’s own example', () => {
    const plan = read(AUTHORING_EXAMPLE);
    expect(plan.projectName).toBe('Aurora Speaker');
    expect(plan.sections.map((s) => s.name)).toEqual([
      'Product Development',
      'Industrial Design',
      'Engineering',
    ]);
    expect(plan.pinnedIndex).toBe(0);
    expect(plan.dependencies).toHaveLength(3);
  });

  it('stores a bar’s inclusive last day as the edge after it', () => {
    const [section] = read(
      doc([{ kind: 'bar', name: 'Sketch', start: '2027-01-11', end: '2027-01-15' }])
    ).sections;
    expect(section.items[0]).toMatchObject({ start: '2027-01-11', end: '2027-01-16' });
    // The window spans the work when none is given
    expect(section).toMatchObject({ startDate: '2027-01-11', endDate: '2027-01-16' });
  });

  it('places milestones and tasks on one day and nests children', () => {
    const [section] = read(
      doc([
        {
          kind: 'bar',
          name: 'Concept',
          start: '2027-01-11',
          end: '2027-02-19',
          children: [
            { kind: 'task', name: 'Review', date: '2027-02-19', done: true },
            { kind: 'milestone', name: 'Gate', date: '2027-02-19' },
          ],
        },
      ])
    ).sections;
    const [task, gate] = section.items[0].children;
    expect(task).toMatchObject({
      kind: 'task',
      start: '2027-02-19',
      end: '2027-02-19',
      isDone: true,
    });
    expect(gate).toMatchObject({ kind: 'milestone', start: '2027-02-19', end: '2027-02-19' });
    expect(gate.isDone).toBeUndefined();
  });

  it('infers a missing kind from the shape', () => {
    const [section] = read(
      doc([
        { name: 'Span', start: '2027-01-11', end: '2027-01-12' },
        { name: 'Point', date: '2027-01-13' },
      ])
    ).sections;
    expect(section.items.map((i) => i.kind)).toEqual(['bar', 'milestone']);
  });

  it('accepts palette names and hex colours, and picks a schedule colour when none is given', () => {
    const plan = read({
      format: 'floid-authoring',
      schedules: [
        { name: 'A', color: 'Teal', items: [{ name: 'x', date: '2027-01-11', color: '#3264b3' }] },
        { name: 'B', items: [{ name: 'y', date: '2027-01-11' }] },
      ],
    });
    expect(plan.sections[0].color).toBe('#5BB5A9');
    expect(plan.sections[0].items[0].color).toBe('#3264B3');
    expect(plan.sections[1].color).toMatch(/^#/);
  });

  it('turns link types into anchor pairs, by id or by unique name', () => {
    const plan = read(
      doc(
        [
          { id: 'a', name: 'Alpha', start: '2027-01-11', end: '2027-01-12' },
          { name: 'Beta', start: '2027-01-13', end: '2027-01-14' },
        ],
        {
          dependencies: [
            { from: 'a', to: 'Beta' },
            { from: 'a', to: 'beta', type: 'start-to-start' },
            { from: 'a', to: 'Beta', type: 'finish-to-finish' },
            { from: 'a', to: 'Beta' },
          ],
        }
      )
    );
    expect(plan.dependencies.map((e) => `${e.fromAnchor}>${e.toAnchor}`)).toEqual([
      'end>start',
      'start>start',
      'end>end',
    ]);
    const [alpha, beta] = plan.sections[0].items;
    expect(plan.dependencies[0]).toMatchObject({ from: alpha.id, to: beta.id });
  });

  it('mints fresh ids and never keeps the author’s', () => {
    const [section] = read(doc([{ id: 'concept', name: 'Concept', date: '2027-01-11' }])).sections;
    expect(section.items[0].id).not.toBe('concept');
  });

  it('collects every problem, each naming its item', () => {
    const errors = errorsOf(
      doc(
        [
          { kind: 'bar', name: 'Backwards', start: '2027-02-01', end: '2027-01-01' },
          { kind: 'milestone', name: 'Gate', date: '2027-13-01' },
          {
            kind: 'milestone',
            name: 'Parent',
            date: '2027-01-01',
            children: [{ name: 'x', date: '2027-01-01' }],
          },
          { kind: 'phase', name: 'Odd' },
          {
            kind: 'bar',
            name: 'Painted',
            start: '2027-01-01',
            end: '2027-01-02',
            color: 'chartreuse',
          },
        ],
        {
          dependencies: [
            { from: 'Backwards', to: 'Nowhere' },
            { from: 'Gate', to: 'Painted', type: 'start-to-finish' },
          ],
        }
      )
    );
    expect(errors).toEqual([
      expect.stringContaining('“Backwards” ends (2027-01-01) before it starts'),
      expect.stringContaining('“Gate” is a milestone and needs a "date"'),
      expect.stringContaining('“Parent” is a milestone, so it cannot have "children"'),
      expect.stringContaining('“Odd” has "kind": "phase"'),
      expect.stringContaining('“Painted” has "color": "chartreuse"'),
      expect.stringContaining('no item has the id or name "Nowhere"'),
      expect.stringContaining('start-to-finish'),
    ]);
  });

  it('refuses a link into a bar the item sits inside', () => {
    const errors = errorsOf(
      doc(
        [
          {
            id: 'p',
            name: 'Parent',
            start: '2027-01-11',
            end: '2027-01-29',
            children: [{ id: 'c', name: 'Child', start: '2027-01-11', end: '2027-01-15' }],
          },
        ],
        { dependencies: [{ from: 'c', to: 'p' }] }
      )
    );
    expect(errors[0]).toContain('sits inside');
  });

  it('refuses ambiguous names and duplicate ids', () => {
    const errors = errorsOf(
      doc(
        [
          { id: 'x', name: 'Review', date: '2027-01-11' },
          { id: 'x', name: 'Review', date: '2027-01-12' },
        ],
        { dependencies: [{ from: 'Review', to: 'Review' }] }
      )
    );
    expect(errors[0]).toContain('reuses the id "x"');
    expect(errors.some((e) => e.includes('names 2 items'))).toBe(true);
  });

  it('links to an item already in the project by name, below its schedules', () => {
    const existing = read(
      doc([{ id: 'tooling', name: 'Tooling', start: '2027-01-04', end: '2027-03-26' }])
    ).sections;
    const result = readAuthoringDocument(
      {
        format: 'floid-authoring',
        schedules: [
          {
            name: 'Validation',
            items: [{ id: 'dvt', name: 'DVT', start: '2027-03-29', end: '2027-04-30' }],
          },
        ],
        dependencies: [{ from: 'Tooling', to: 'dvt' }],
      },
      existing
    );
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.plan.sections[0].order).toBe(1);
    expect(result.plan.dependencies[0].from).toBe(existing[0].items[0].id);
  });

  it('refuses a document in the wrong format', () => {
    expect(errorsOf({ format: 'floid', schedules: [] })[0]).toContain('floid-authoring');
    expect(errorsOf({ format: 'floid-authoring', schedules: [] })[0]).toContain('"schedules"');
  });
});

describe('extractJson', () => {
  it('finds the document in a fenced reply with prose around it', () => {
    const reply =
      'Here is your schedule:\n\n```json\n{"format": "floid-authoring"}\n```\n\nLet me know!';
    expect(extractJson(reply)).toEqual({ format: 'floid-authoring' });
  });

  it('finds a bare object with text either side', () => {
    expect(extractJson('Sure — {"a": 1} done')).toEqual({ a: 1 });
  });

  it('gives up on text with no JSON in it', () => {
    expect(extractJson('no schedule here')).toBeUndefined();
  });
});

describe('the published spec', () => {
  it('is carried word for word by llms-full.txt', () => {
    const published = readFileSync(resolve(__dirname, '../../public/llms-full.txt'), 'utf8');
    expect(published).toContain(AUTHORING_SPEC.trim());
  });

  it('tells the AI the date and what is already in the project', () => {
    const prompt = buildAuthoringPrompt({
      today: '2026-10-30',
      project: {
        name: 'Aurora',
        schedules: [
          {
            name: 'Engineering',
            start: '2027-01-01',
            end: '2027-06-01',
            items: [
              { name: 'Tooling', kind: 'bar', start: '2027-01-04', end: '2027-03-26', depth: 0 },
              { name: 'T1', kind: 'milestone', start: '2027-03-26', end: '2027-03-26', depth: 1 },
            ],
          },
        ],
      },
    });
    expect(prompt).toContain('Today is 2026-10-30');
    expect(prompt).toContain('- Engineering (2027-01-01 to 2027-06-01)');
    expect(prompt).toContain('  - Tooling (bar, 2027-01-04 to 2027-03-26)');
    expect(prompt).toContain('    - T1 (milestone, 2027-03-26)');
    expect(prompt).toContain(AUTHORING_SPEC);
  });
});
