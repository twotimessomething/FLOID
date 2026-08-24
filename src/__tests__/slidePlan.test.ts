import { describe, it, expect } from 'vitest';
import type { Project } from '../types/project';
import type { DependencyEdge, Section, TimelineItem } from '../types';
import {
  buildSlidePlan,
  fitText,
  inkForPaper,
  routeDependency,
  type SlideShape,
} from '../utils/slidePlan';
import {
  SLIDE_HEIGHT_PT,
  SLIDE_INK,
  SLIDE_MAX_SCALE,
  SLIDE_WIDTH_PT,
} from '../constants/slideDimensions';

function bar(
  id: string,
  start: string,
  end: string,
  children: TimelineItem[] = [],
  overrides: Partial<TimelineItem> = {}
): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start,
    end,
    color: null,
    isCollapsed: false,
    children,
    ...overrides,
  };
}

function milestone(id: string, day: string, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id,
    kind: 'milestone',
    name: id,
    description: '',
    start: day,
    end: day,
    color: null,
    isCollapsed: false,
    children: [],
    ...overrides,
  };
}

function section(id: string, items: TimelineItem[], overrides: Partial<Section> = {}): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#3264B3',
    isCollapsed: false,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Test project',
    pinnedSectionId: null,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-12-31',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Every shape named `name`, whatever kind it came out as. */
const named = (shapes: readonly SlideShape[], name: string): SlideShape[] =>
  shapes.filter((shape) => shape.name === name);

const texts = (shapes: readonly SlideShape[]): string[] =>
  shapes.flatMap((shape) =>
    shape.kind === 'text' ? [shape.text] : shape.kind === 'rect' ? [shape.text ?? ''] : []
  );

/** Slide-space bounds of a shape, so nothing can quietly run off the page. */
function extentOf(shape: SlideShape): { top: number; bottom: number; left: number; right: number } {
  switch (shape.kind) {
    case 'rect':
    case 'text':
      return {
        top: shape.y,
        bottom: shape.y + shape.h,
        left: shape.x,
        right: shape.x + shape.w,
      };
    case 'diamond':
    case 'dot':
      return {
        top: shape.cy - shape.size / 2,
        bottom: shape.cy + shape.size / 2,
        left: shape.cx - shape.size / 2,
        right: shape.cx + shape.size / 2,
      };
    case 'polyline': {
      const ys = shape.points.map((p) => p.y);
      const xs = shape.points.map((p) => p.x);
      return {
        top: Math.min(...ys),
        bottom: Math.max(...ys),
        left: Math.min(...xs),
        right: Math.max(...xs),
      };
    }
  }
}

describe('buildSlidePlan — collapse state', () => {
  it('leaves a collapsed schedule its own row and no item rows', () => {
    const open = buildSlidePlan(project(), [
      section('s1', [bar('a', '2026-01-01', '2026-03-01'), bar('b', '2026-03-01', '2026-05-01')]),
    ]);
    const folded = buildSlidePlan(project(), [
      section('s1', [bar('a', '2026-01-01', '2026-03-01'), bar('b', '2026-03-01', '2026-05-01')], {
        isCollapsed: true,
      }),
    ]);

    expect(open.rowCount).toBe(2);
    expect(folded.rowCount).toBe(0);

    // The bars are still there — folded onto the schedule's own row as tape
    expect(named(folded.shapes, 'a')).toHaveLength(1);
    expect(named(folded.shapes, 'b')).toHaveLength(1);
    expect(folded.shapes.filter((s) => s.name === 'Row a')).toHaveLength(0);
  });

  it('keeps a collapsed group solid and its children off the sheet', () => {
    const child = bar('child', '2026-01-05', '2026-02-01');
    const folded = buildSlidePlan(project(), [
      section('s1', [bar('parent', '2026-01-01', '2026-03-01', [child], { isCollapsed: true })]),
    ]);

    expect(folded.rowCount).toBe(1);
    expect(named(folded.shapes, 'child')).toHaveLength(0);

    // Folded, the parent is the only thing standing for its children, so it
    // keeps a fill rather than becoming a span
    const parent = named(folded.shapes, 'parent');
    expect(parent).toHaveLength(1);
    expect(parent[0].kind).toBe('rect');
  });
});

describe('buildSlidePlan — how items print', () => {
  it('draws a leaf bar as one rectangle carrying its own name', () => {
    const plan = buildSlidePlan(project(), [
      section('s1', [bar('Concept', '2026-01-01', '2026-04-01')]),
    ]);

    const shapes = named(plan.shapes, 'Concept');
    expect(shapes).toHaveLength(1);
    const [rect] = shapes;
    expect(rect.kind).toBe('rect');
    if (rect.kind !== 'rect') throw new Error('unreachable');
    expect(rect.text).toBe('Concept');
    expect(rect.fill).toBe('3264B3');
    expect(rect.w).toBeGreaterThan(0);
  });

  it('draws an open group as a span with a terminal at each end and its name above', () => {
    const plan = buildSlidePlan(project(), [
      section('s1', [
        bar('Design', '2026-01-01', '2026-06-01', [bar('Sketch', '2026-01-01', '2026-03-01')]),
      ]),
    ]);

    const span = named(plan.shapes, 'Design span');
    const start = named(plan.shapes, 'Design start');
    const end = named(plan.shapes, 'Design end');
    const label = named(plan.shapes, 'Design name');

    expect(span).toHaveLength(1);
    expect(start[0]?.kind).toBe('dot');
    expect(end[0]?.kind).toBe('dot');
    expect(label[0]?.kind).toBe('text');

    if (span[0].kind !== 'rect' || start[0].kind !== 'dot' || end[0].kind !== 'dot') {
      throw new Error('unreachable');
    }
    // The terminals sit on the span's own ends
    expect(start[0].cx).toBeCloseTo(span[0].x, 5);
    expect(end[0].cx).toBeCloseTo(span[0].x + span[0].w, 5);
    // and the name is above the line, not on it
    if (label[0].kind !== 'text') throw new Error('unreachable');
    expect(label[0].y + label[0].h).toBeLessThanOrEqual(span[0].y);

    // The child below it is an ordinary bar
    expect(named(plan.shapes, 'Sketch')[0].kind).toBe('rect');
  });

  it('draws milestones as diamonds, on the schedule row at the root', () => {
    const plan = buildSlidePlan(project(), [
      section('s1', [
        milestone('Ship', '2026-06-01'),
        bar('Build', '2026-01-01', '2026-06-01', [milestone('Review', '2026-03-01')]),
      ]),
    ]);

    expect(named(plan.shapes, 'Ship')[0].kind).toBe('diamond');
    expect(named(plan.shapes, 'Review')[0].kind).toBe('diamond');
    // A root milestone rules a reference line down past the schedule's items
    expect(named(plan.shapes, 'Reference line Ship')[0].kind).toBe('polyline');
    // and gets no row of its own, unlike the nested one
    expect(plan.rowCount).toBe(2);
  });

  it('drops a bar name that has nowhere to print rather than spilling it', () => {
    const plan = buildSlidePlan(project(), [
      section('s1', [
        bar('One day of work', '2026-01-01', '2026-01-02'),
        bar('Long', '2026-02-01', '2026-11-01'),
      ]),
    ]);

    const tiny = named(plan.shapes, 'One day of work')[0];
    if (tiny.kind !== 'rect') throw new Error('unreachable');
    expect(tiny.text).toBeUndefined();

    // It is still findable in the label column
    expect(texts(named(plan.shapes, 'Row One day of work'))).toEqual(['One day of work']);
  });
});

describe('buildSlidePlan — one slide', () => {
  it('squeezes a tall timeline until every shape is on the page', () => {
    const sections = Array.from({ length: 8 }, (_, s) =>
      section(
        `s${s}`,
        Array.from({ length: 8 }, (_, i) =>
          bar(`s${s}-b${i}`, '2026-01-01', '2026-04-01', [
            bar(`s${s}-b${i}-c`, '2026-01-01', '2026-02-01'),
          ])
        ),
        { order: s }
      )
    );

    const plan = buildSlidePlan(project(), sections);

    expect(plan.rowCount).toBe(128);
    expect(plan.scale).toBeLessThan(1);

    for (const shape of plan.shapes) {
      const box = extentOf(shape);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(SLIDE_HEIGHT_PT);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(SLIDE_WIDTH_PT);
    }
  });

  it('does not stretch a short timeline past its ceiling', () => {
    const plan = buildSlidePlan(project(), [
      section('s1', [bar('only', '2026-01-01', '2026-06-01')]),
    ]);
    expect(plan.scale).toBe(SLIDE_MAX_SCALE);
  });

  it('prints the pinned schedule first', () => {
    const plan = buildSlidePlan(project({ pinnedSectionId: 'gates' }), [
      section('work', [bar('a', '2026-01-01', '2026-03-01')], { order: 0 }),
      section('gates', [milestone('DV', '2026-02-01')], { order: 1 }),
    ]);

    const gates =
      named(plan.shapes, 'Schedule gates ★')[0] ?? named(plan.shapes, 'Schedule gates')[0];
    const work = named(plan.shapes, 'Schedule work')[0];
    expect(extentOf(gates).top).toBeLessThan(extentOf(work).top);
  });
});

describe('buildSlidePlan — dependencies', () => {
  const edge = (overrides: Partial<DependencyEdge> = {}): DependencyEdge => ({
    id: 'e1',
    from: 'a',
    fromAnchor: 'end',
    to: 'b',
    toAnchor: 'start',
    ...overrides,
  });

  it('links two items and prints a broken one in danger ink', () => {
    const ok = buildSlidePlan(
      project(),
      [section('s1', [bar('a', '2026-01-01', '2026-03-01'), bar('b', '2026-03-01', '2026-05-01')])],
      [edge()]
    );
    const broken = buildSlidePlan(
      project(),
      [section('s1', [bar('a', '2026-03-01', '2026-05-01'), bar('b', '2026-01-01', '2026-02-01')])],
      [edge()]
    );

    const okLink = named(ok.shapes, 'Link a → b')[0];
    const brokenLink = named(broken.shapes, 'Link a → b')[0];
    if (okLink.kind !== 'polyline' || brokenLink.kind !== 'polyline') {
      throw new Error('unreachable');
    }
    expect(okLink.color).toBe(SLIDE_INK.dependency);
    expect(brokenLink.color).toBe(SLIDE_INK.dependencyViolated);
    expect(okLink.arrow).toBe(true);
  });

  it('points a link into a collapsed group at the row standing in for it', () => {
    const hidden = bar('hidden', '2026-04-01', '2026-06-01');
    const plan = buildSlidePlan(
      project(),
      [
        section('s1', [
          bar('a', '2026-01-01', '2026-03-01'),
          bar('parent', '2026-03-01', '2026-08-01', [hidden], { isCollapsed: true }),
        ]),
      ],
      [edge({ to: 'hidden' })]
    );

    const link = named(plan.shapes, 'Link a → hidden')[0];
    const parentRect = named(plan.shapes, 'parent')[0];
    if (link.kind !== 'polyline' || parentRect.kind !== 'rect') throw new Error('unreachable');

    const arrival = link.points[link.points.length - 1].y;
    expect(arrival).toBeGreaterThanOrEqual(parentRect.y);
    expect(arrival).toBeLessThanOrEqual(parentRect.y + parentRect.h);
  });

  it('points a link into a collapsed schedule at that schedule row', () => {
    const plan = buildSlidePlan(
      project(),
      [
        section('open', [bar('a', '2026-01-01', '2026-03-01')], { order: 0 }),
        section('folded', [bar('b', '2026-03-01', '2026-05-01')], {
          order: 1,
          isCollapsed: true,
        }),
      ],
      [edge()]
    );

    const link = named(plan.shapes, 'Link a → b')[0];
    const tape = named(plan.shapes, 'b')[0];
    if (link.kind !== 'polyline' || tape.kind !== 'rect') throw new Error('unreachable');

    // Not the top of the sheet: the row the folded schedule is standing on
    const arrival = link.points[link.points.length - 1].y;
    expect(arrival).toBeGreaterThan(tape.y);
    expect(Math.abs(arrival - extentOf(named(plan.shapes, 'Schedule folded')[0]).top)).toBeLessThan(
      40
    );
  });

  it('can be left off', () => {
    const plan = buildSlidePlan(
      project(),
      [section('s1', [bar('a', '2026-01-01', '2026-03-01'), bar('b', '2026-03-01', '2026-05-01')])],
      [edge()],
      { includeDependencies: false }
    );
    expect(named(plan.shapes, 'Link a → b')).toHaveLength(0);
  });
});

describe('routeDependency', () => {
  it('runs straight when both ends share a row', () => {
    const points = routeDependency(10, 50, 'end', 90, 50);
    expect(points).toEqual([
      { x: 10, y: 50 },
      { x: 90, y: 50 },
    ]);
  });

  it('turns square corners between rows', () => {
    const points = routeDependency(10, 50, 'end', 90, 120);
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    expect(points[0]).toEqual({ x: 10, y: 50 });
    expect(points[points.length - 1]).toEqual({ x: 90, y: 120 });
    // One corner column, so a back-to-back link never doubles back on itself
    expect(new Set(points.map((p) => p.x)).size).toBe(3);
  });
});

describe('text fitting', () => {
  it('keeps what fits and marks what it cut', () => {
    expect(fitText('Concept', 10, 500)).toBe('Concept');
    expect(fitText('', 10, 500)).toBe('');
    expect(fitText('Concept development phase', 10, 40)).toMatch(/…$/);
    expect(fitText('Concept development phase', 10, 40).length).toBeLessThan(25);
    expect(fitText('Concept', 10, 1)).toBe('');
  });
});

describe('inkForPaper', () => {
  it('walks a pale bar colour down until it can be read on white', () => {
    // Palette 'sky' is a tint — unreadable as text on paper
    expect(inkForPaper('#B1E3F9')).not.toBe('B1E3F9');
    // A mid-value hue is already dark enough to keep
    expect(inkForPaper('#3264B3')).toBe('3264B3');
  });
});
