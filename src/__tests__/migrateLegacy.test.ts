import { describe, it, expect } from 'vitest';
import { migrateLegacySection, migrateSections } from '../utils/migrateLegacy';
import { migrateStoredData, STORAGE_SCHEMA_VERSION } from '../utils/storageUtils';
import type { StoredData } from '../utils/storageUtils';
import type { LegacySection } from '../types/legacy';
import { isLegacySection } from '../types/legacy';
import { createSectionFromTemplate, getTemplateById } from '../data/scheduleTemplates';

/** How the old app wrote dates: a local calendar date pushed through toISOString. */
const iso = (y: number, m: number, d: number): string => new Date(y, m - 1, d).toISOString();

const legacySection = (): LegacySection => ({
  id: 'sec-1',
  name: 'Design',
  type: 'schedule',
  revision: 4,
  lastModifiedAt: '2025-01-01T00:00:00.000Z',
  order: 0,
  startDate: iso(2025, 1, 1),
  endDate: iso(2025, 3, 2), // 60 days
  color: '#3b82f6',
  isCollapsed: false,
  phases: [
    // Deliberately out of array order — the old model ordered by `order`
    {
      id: 'ph-2',
      sectionId: 'sec-1',
      name: 'Second',
      order: 1,
      relativeStart: 0.5,
      relativeEnd: 1,
      tasks: [],
      barMilestones: [],
    },
    {
      id: 'ph-1',
      sectionId: 'sec-1',
      name: 'First',
      order: 0,
      relativeStart: 0,
      relativeEnd: 0.5,
      color: '#ff0000',
      isCollapsed: true,
      tasks: [{ id: 't-1', name: 'Task A', relativeStart: 0, relativeEnd: 0.5, order: 0 }],
      barMilestones: [{ id: 'bm-1', name: 'Mid', relativePosition: 1 }],
    },
  ],
  milestones: [
    { id: 'ms-1', sectionId: 'sec-1', name: 'Kickoff', relativePosition: 0, order: 0 },
  ],
});

describe('isLegacySection', () => {
  it('recognises the old shape and only the old shape', () => {
    expect(isLegacySection(legacySection())).toBe(true);
    expect(isLegacySection({ items: [] })).toBe(false);
    expect(isLegacySection({ phases: [], items: [] })).toBe(false);
    expect(isLegacySection(null)).toBe(false);
  });
});

describe('migrateLegacySection', () => {
  const migrated = migrateLegacySection(legacySection());

  it('normalises the window to day keys', () => {
    expect(migrated.startDate).toBe('2025-01-01');
    expect(migrated.endDate).toBe('2025-03-02');
  });

  it('orders root items by the old order field, milestones last', () => {
    expect(migrated.items.map((i) => i.name)).toEqual(['First', 'Second', 'Kickoff']);
  });

  it('resolves a phase to absolute dates against the schedule window', () => {
    // 0 to 0.5 of a 60-day window
    expect(migrated.items[0].start).toBe('2025-01-01');
    expect(migrated.items[0].end).toBe('2025-01-31');
    expect(migrated.items[1].start).toBe('2025-01-31');
    expect(migrated.items[1].end).toBe('2025-03-02');
  });

  it('resolves a task against its phase, not the schedule', () => {
    const task = migrated.items[0].children[0];
    expect(task.name).toBe('Task A');
    expect(task.kind).toBe('bar');
    // 0 to 0.5 of the phase's own 30 days
    expect(task.start).toBe('2025-01-01');
    expect(task.end).toBe('2025-01-16');
  });

  it('turns a bar milestone into a milestone item nested under that bar', () => {
    const marker = migrated.items[0].children[1];
    expect(marker.name).toBe('Mid');
    expect(marker.kind).toBe('milestone');
    expect(marker.start).toBe(marker.end);
    // relativePosition 1 of a phase running Jan 1 - Jan 31
    expect(marker.start).toBe('2025-01-31');
  });

  it('turns a schedule milestone into a root milestone item', () => {
    const marker = migrated.items[2];
    expect(marker.kind).toBe('milestone');
    expect(marker.start).toBe('2025-01-01');
    expect(marker.start).toBe(marker.end);
    expect(marker.children).toEqual([]);
  });

  it('keeps colour, collapse and ids', () => {
    expect(migrated.items[0].color).toBe('#ff0000');
    expect(migrated.items[0].isCollapsed).toBe(true);
    expect(migrated.items[0].id).toBe('ph-1');
    expect(migrated.items[0].children[0].id).toBe('t-1');
  });

  it('never produces a zero-width bar', () => {
    const degenerate = migrateLegacySection({
      ...legacySection(),
      phases: [{ id: 'p', name: 'Sliver', relativeStart: 0.5, relativeEnd: 0.5001, tasks: [] }],
      milestones: [],
    });
    expect(degenerate.items[0].start).not.toBe(degenerate.items[0].end);
  });
});

describe('migrateSections', () => {
  it('passes an already-migrated section through untouched in shape', () => {
    const once = migrateSections([legacySection()]);
    const twice = migrateSections(once);
    expect(twice).toEqual(once);
  });

  it('handles a mixed list', () => {
    const mixed = migrateSections([legacySection(), migrateLegacySection(legacySection())]);
    expect(mixed).toHaveLength(2);
    expect(mixed[0].items).toEqual(mixed[1].items);
  });
});

describe('migrateStoredData', () => {
  const stored = (): StoredData =>
    ({
      project: {
        id: 'p1',
        name: 'Old',
        masterSectionId: 'sec-1',
        projectStartDate: iso(2025, 1, 1),
        projectEndDate: iso(2025, 7, 1),
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      sections: [legacySection()],
    }) as unknown as StoredData;

  it('lifts a pre-versioning save all the way to the current schema', () => {
    const out = migrateStoredData(stored());
    expect(out.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(out.sections[0].items.map((i) => i.name)).toEqual(['First', 'Second', 'Kickoff']);
    expect(out.project.projectStartDate).toBe('2025-01-01');
  });

  it('promotes the old master schedule to the pin', () => {
    const out = migrateStoredData(stored());
    expect(out.project.pinnedSectionId).toBe('sec-1');
    expect(out.project).not.toHaveProperty('masterSectionId');
    // The master schedule used to colour its phases individually
    expect(out.sections[0].isMulticolor).toBe(true);
  });

  it('respects an explicit unpin rather than restoring the master', () => {
    const data = stored();
    (data.project as { pinnedSectionId: string | null }).pinnedSectionId = null;
    expect(migrateStoredData(data).project.pinnedSectionId).toBeNull();
  });

  it('is idempotent', () => {
    const once = migrateStoredData(stored());
    expect(migrateStoredData(once)).toBe(once);
    // …and stable even if the version stamp is lost
    const { schemaVersion: _ignored, ...unstamped } = once;
    expect(migrateStoredData(unstamped as StoredData)).toEqual(once);
  });

  it('leaves a record with no project alone rather than inventing one', () => {
    const broken = { sections: [] } as unknown as StoredData;
    expect(migrateStoredData(broken)).toBe(broken);
  });
});

describe('templates instantiate into absolute items', () => {
  it('places phases and tasks against the requested window', () => {
    const template = getTemplateById('id-timeline');
    expect(template).toBeDefined();

    const built = createSectionFromTemplate(template!, 0, {
      dateRange: { startDate: '2025-01-01', endDate: '2025-12-31' },
    });

    expect(built.startDate).toBe('2025-01-01');
    expect(built.items.length).toBeGreaterThan(0);

    for (const item of built.items) {
      expect(item.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.start >= '2025-01-01').toBe(true);
      expect(item.end <= '2025-12-31').toBe(true);
      if (item.kind === 'bar') expect(item.end > item.start).toBe(true);
      else expect(item.end).toBe(item.start);
    }

    // Bars first, then the schedule's own markers
    const kinds = built.items.map((i) => i.kind);
    const firstMilestone = kinds.indexOf('milestone');
    if (firstMilestone !== -1) {
      expect(kinds.slice(firstMilestone).every((k) => k === 'milestone')).toBe(true);
    }
  });

  it('nests template tasks inside their phase', () => {
    const template = getTemplateById('id-timeline')!;
    const built = createSectionFromTemplate(template, 0, {
      dateRange: { startDate: '2025-01-01', endDate: '2025-12-31' },
    });
    const withChildren = built.items.find((i) => i.children.length > 0);
    expect(withChildren).toBeDefined();
    for (const child of withChildren!.children) {
      expect(child.start >= withChildren!.start).toBe(true);
      expect(child.end <= withChildren!.end).toBe(true);
    }
  });

  it('builds a blank schedule with a real window and no items', () => {
    const built = createSectionFromTemplate(getTemplateById('blank')!, 1);
    expect(built.items).toEqual([]);
    expect(built.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(built.endDate > built.startDate).toBe(true);
  });
});
