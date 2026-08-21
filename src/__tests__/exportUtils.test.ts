import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeScheduleImport,
  convertImportedProject,
  downloadProjectJson,
  downloadScheduleFloid,
  exportProjectToJson,
  exportScheduleToFloid,
  parseProjectJson,
  parseScheduleFloid,
} from '../utils/exportUtils';
import { setAppSettings } from '../utils/indexedDB';
import type { Project, Section, TimelineItem } from '../types';
import type { ScheduleExportData } from '../types/scheduleExport';

vi.mock('../utils/indexedDB', () => ({
  setAppSettings: vi.fn().mockResolvedValue(undefined),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    pinnedSectionId: 'sec-1',
    projectStartDate: '2025-01-01',
    projectEndDate: '2025-07-01',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A schedule with a bar, a nested bar, a nested milestone and a root milestone. */
function makeSection(overrides: Partial<Section> = {}): Section {
  const task: TimelineItem = {
    id: 'task-1',
    kind: 'bar',
    name: 'User Research',
    description: '',
    start: '2025-01-05',
    end: '2025-01-20',
    color: null,
    isCollapsed: false,
    children: [],
  };

  const marker: TimelineItem = {
    id: 'bm-1',
    kind: 'milestone',
    name: 'Findings in',
    description: '',
    start: '2025-01-18',
    end: '2025-01-18',
    color: null,
    isCollapsed: false,
    children: [],
  };

  return {
    id: 'sec-1',
    name: 'Design',
    type: 'schedule',
    templateId: 'id-timeline',
    revision: 3,
    lastModifiedAt: '2025-01-15T00:00:00.000Z',
    order: 0,
    startDate: '2025-01-01',
    endDate: '2025-07-01',
    items: [
      {
        id: 'ph-1',
        kind: 'bar',
        name: 'Discovery',
        description: 'Research phase',
        start: '2025-01-01',
        end: '2025-03-01',
        color: null,
        isCollapsed: false,
        isLocked: true,
        children: [task, marker],
      },
      {
        id: 'ms-1',
        kind: 'milestone',
        name: 'Kick-off',
        description: '',
        start: '2025-01-01',
        end: '2025-01-01',
        color: null,
        isCollapsed: false,
        children: [],
      },
    ],
    color: '#3b82f6',
    isCollapsed: false,
    ...overrides,
  };
}

describe('exportProjectToJson', () => {
  it('writes the current project format', () => {
    const result = exportProjectToJson(makeProject(), [makeSection()]);
    expect(result.format).toBe('floid-project');
    expect(result.version).toBe('3.0');
    expect(result.exportedAt).toBeDefined();
  });

  it('includes project metadata', () => {
    const project = makeProject();
    const result = exportProjectToJson(project, [makeSection()]);
    expect(result.project.id).toBe(project.id);
    expect(result.project.name).toBe(project.name);
    expect(result.project.pinnedSectionId).toBe(project.pinnedSectionId);
  });

  it('writes items as they are, at every depth', () => {
    const result = exportProjectToJson(makeProject(), [makeSection()]);
    const [discovery, kickoff] = result.sections[0].items;
    expect(discovery.start).toBe('2025-01-01');
    expect(discovery.children.map((c) => c.name)).toEqual(['User Research', 'Findings in']);
    expect(kickoff.kind).toBe('milestone');
  });
});

describe('parseProjectJson', () => {
  it('parses what it wrote', () => {
    const json = JSON.stringify(exportProjectToJson(makeProject(), [makeSection()]));
    const parsed = parseProjectJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe('floid-project');
    expect(parsed!.sections).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parseProjectJson('not json')).toBeNull();
  });

  it('returns null for an unknown format', () => {
    expect(parseProjectJson(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('reads a 2.0 file written before the item model', () => {
    const legacy = JSON.stringify({
      format: 'floid-project',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      project: { ...makeProject(), pinnedSectionId: 'sec-1' },
      sections: [
        {
          id: 'sec-1',
          name: 'Design',
          type: 'schedule',
          revision: 3,
          lastModifiedAt: '',
          order: 0,
          startDate: '2025-01-01',
          endDate: '2025-03-02',
          color: '#3b82f6',
          isCollapsed: false,
          phases: [
            {
              id: 'ph-1',
              name: 'Discovery',
              order: 0,
              relativeStart: 0,
              relativeEnd: 0.5,
              tasks: [{ id: 't-1', name: 'Research', relativeStart: 0, relativeEnd: 1, order: 0 }],
              barMilestones: [{ id: 'bm-1', name: 'Mid', relativePosition: 0.5 }],
            },
          ],
          milestones: [{ id: 'ms-1', name: 'Kick-off', relativePosition: 0, order: 0 }],
        },
      ],
    });

    const parsed = parseProjectJson(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe('3.0');
    const items = parsed!.sections[0].items;
    expect(items.map((i) => i.name)).toEqual(['Discovery', 'Kick-off']);
    expect(items[0].children.map((c) => c.name)).toEqual(['Research', 'Mid']);
    expect(items[0].start).toBe('2025-01-01');
    expect(items[0].end).toBe('2025-01-31');
  });

  it('reads a numbered legacy file and promotes its master schedule to the pin', () => {
    const legacy = JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      project: { ...makeProject(), pinnedSectionId: undefined, masterSectionId: 'sec-1' },
      sections: [
        {
          id: 'sec-1',
          name: 'Design',
          type: 'schedule',
          revision: 1,
          lastModifiedAt: '',
          order: 0,
          startDate: '2025-01-01',
          endDate: '2025-07-01',
          color: '#3b82f6',
          phases: [],
          milestones: [],
        },
      ],
    });

    const parsed = parseProjectJson(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!.project.pinnedSectionId).toBe('sec-1');
    expect(parsed!.sections[0].items).toEqual([]);
  });

  it('defaults isCollapsed when a file omits it', () => {
    const exported = exportProjectToJson(makeProject(), [makeSection()]);
    const raw = JSON.parse(JSON.stringify(exported));
    delete raw.sections[0].isCollapsed;
    expect(parseProjectJson(JSON.stringify(raw))!.sections[0].isCollapsed).toBe(false);
  });
});

describe('project round-trip', () => {
  it('loses nothing on the way out and back', () => {
    const project = makeProject();
    const section = makeSection();

    const parsed = parseProjectJson(JSON.stringify(exportProjectToJson(project, [section])));
    const { project: imported, sections } = convertImportedProject(parsed!);

    expect(imported.id).toBe(project.id);
    expect(imported.name).toBe(project.name);
    expect(sections).toHaveLength(1);
    // The whole tree survives, including the flags a field-by-field rebuild
    // used to drop on the way back in
    expect(sections[0].items).toEqual(section.items);
    expect(sections[0].items[0].isLocked).toBe(true);
    expect(sections[0].items[0].children[1].kind).toBe('milestone');
  });
});

describe('exportScheduleToFloid / parseScheduleFloid', () => {
  it('writes the current schedule format', () => {
    const result = exportScheduleToFloid(makeProject(), makeSection());
    expect(result.format).toBe('floid');
    expect(result.version).toBe('3.0');
    expect(result.sourceProjectId).toBe('proj-1');
  });

  it('round-trips through parse', () => {
    const exported = exportScheduleToFloid(makeProject(), makeSection());
    const parsed = parseScheduleFloid(JSON.stringify(exported));
    expect(parsed).not.toBeNull();
    expect(parsed!.schedule.id).toBe('sec-1');
    expect(parsed!.schedule.name).toBe('Design');
    expect(parsed!.items).toHaveLength(2);
    expect(parsed!.items[0].children).toHaveLength(2);
  });

  it('returns null for invalid data', () => {
    expect(parseScheduleFloid('not json')).toBeNull();
    expect(parseScheduleFloid(JSON.stringify({ format: 'wrong' }))).toBeNull();
  });
});

describe('analyzeScheduleImport', () => {
  const project = makeProject();

  function makeImportData(overrides: Partial<ScheduleExportData> = {}): ScheduleExportData {
    return {
      format: 'floid',
      version: '3.0',
      exportedAt: new Date().toISOString(),
      sourceProjectId: 'other-proj',
      sourceProjectName: 'Other Project',
      schedule: {
        id: 'sec-1',
        name: 'Design',
        revision: 5,
        lastModifiedAt: new Date().toISOString(),
        color: '#3b82f6',
      },
      projectDates: { startDate: project.projectStartDate, endDate: project.projectEndDate },
      scheduleDates: { startDate: '2025-01-01', endDate: '2025-07-01' },
      items: [],
      ...overrides,
    };
  }

  it('detects a schedule it has never seen', () => {
    const data = makeImportData({
      schedule: { id: 'new-id', name: 'New', revision: 1, lastModifiedAt: '', color: '#000' },
    });
    expect(analyzeScheduleImport(data, project, [makeSection()]).type).toBe('new-schedule');
  });

  it('detects a newer revision', () => {
    const result = analyzeScheduleImport(makeImportData(), project, [makeSection({ revision: 3 })]);
    expect(result.type).toBe('update-newer');
    expect(result.revisionDelta).toBe(2);
  });

  it('detects an older revision', () => {
    const data = makeImportData({
      schedule: { id: 'sec-1', name: 'Design', revision: 3, lastModifiedAt: '', color: '#000' },
    });
    const result = analyzeScheduleImport(data, project, [makeSection({ revision: 5 })]);
    expect(result.type).toBe('update-older');
    expect(result.revisionDelta).toBe(-2);
  });

  it('detects the same revision', () => {
    const result = analyzeScheduleImport(makeImportData(), project, [makeSection({ revision: 5 })]);
    expect(result.type).toBe('update-same');
    expect(result.revisionDelta).toBe(0);
  });

  it('detects a name collision on a different schedule', () => {
    const existing = makeSection({ id: 'different-id', name: 'Design' });
    const data = makeImportData({
      schedule: { id: 'sec-1', name: 'Design', revision: 1, lastModifiedAt: '', color: '#000' },
    });
    expect(analyzeScheduleImport(data, project, [existing]).type).toBe('name-collision');
  });

  it('flags a schedule that was drawn against different dates', () => {
    const data = makeImportData({
      scheduleDates: { startDate: '2024-01-01', endDate: '2024-07-01' },
    });
    expect(analyzeScheduleImport(data, project, []).dateMismatch).toBe(true);
  });

  it('does not flag one that lines up', () => {
    const data = makeImportData({
      scheduleDates: { startDate: project.projectStartDate, endDate: project.projectEndDate },
    });
    expect(analyzeScheduleImport(data, project, []).dateMismatch).toBe(false);
  });
});

/**
 * What a download claims about the user's data.
 *
 * A whole project leaving the app is a backup and may stamp the date; a single
 * schedule is a share, and stamping it would silence the backup reminder while
 * every project still sits unwritten in IndexedDB.
 */
describe('backup date stamping', () => {
  beforeEach(() => {
    vi.mocked(setAppSettings).mockClear();

    // jsdom has no object URLs and does not follow anchor clicks
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a backup when a whole project is exported', async () => {
    await downloadProjectJson(makeProject(), [makeSection()]);

    expect(setAppSettings).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setAppSettings).mock.calls[0][0]).toHaveProperty('lastBackupDate');
  });

  it('does not record a backup when a single schedule is exported', async () => {
    await downloadScheduleFloid(makeProject(), makeSection());

    expect(setAppSettings).not.toHaveBeenCalled();
  });
});
