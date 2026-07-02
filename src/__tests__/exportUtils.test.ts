import { describe, it, expect, vi } from 'vitest';
import {
  exportProjectToJson,
  parseProjectJson,
  exportScheduleToFloid,
  parseScheduleFloid,
  analyzeScheduleImport,
  convertImportedProject,
} from '../utils/exportUtils';
import type { Project, Section } from '../types';
import type { ScheduleExportData } from '../types/scheduleExport';

// Mock indexedDB module
vi.mock('../utils/indexedDB', () => ({
  setAppSettings: vi.fn().mockResolvedValue(undefined),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    pinnedSectionId: 'sec-1',
    projectStartDate: '2025-01-01T00:00:00.000Z',
    projectEndDate: '2025-07-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec-1',
    name: 'Design',
    type: 'schedule',
    templateId: 'id-timeline',
    revision: 3,
    lastModifiedAt: '2025-01-15T00:00:00.000Z',
    order: 0,
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-07-01T00:00:00.000Z',
    phases: [
      {
        id: 'ph-1',
        sectionId: 'sec-1',
        name: 'Discovery',
        description: 'Research phase',
        color: null,
        order: 0,
        isCollapsed: false,
        tasks: [
          {
            id: 'task-1',
            phaseId: 'ph-1',
            name: 'User Research',
            description: '',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
        ],
        relativeStart: 0.0,
        relativeEnd: 0.3,
      },
    ],
    milestones: [
      {
        id: 'ms-1',
        sectionId: 'sec-1',
        name: 'Kick-off',
        description: '',
        relativePosition: 0.0,
        order: 0,
      },
    ],
    color: '#3b82f6',
    isCollapsed: false,
    ...overrides,
  };
}

describe('exportProjectToJson', () => {
  it('produces v2.0 floid-project format', () => {
    const result = exportProjectToJson(makeProject(), [makeSection()]);
    expect(result.format).toBe('floid-project');
    expect(result.version).toBe('2.0');
    expect(result.exportedAt).toBeDefined();
  });

  it('includes project metadata', () => {
    const project = makeProject();
    const result = exportProjectToJson(project, [makeSection()]);
    expect(result.project.id).toBe(project.id);
    expect(result.project.name).toBe(project.name);
    expect(result.project.pinnedSectionId).toBe(project.pinnedSectionId);
  });

  it('computes absolute dates for phases', () => {
    const result = exportProjectToJson(makeProject(), [makeSection()]);
    const phase = result.sections[0].phases[0];
    expect(phase.absoluteStart).toBeDefined();
    expect(phase.absoluteEnd).toBeDefined();
    // Phase at relativeStart 0 should be near section start (±1 day for timezone)
    expect(phase.absoluteStart).toMatch(/^2025-01-0[12]|2024-12-31$/);
  });

  it('computes absolute dates for milestones', () => {
    const result = exportProjectToJson(makeProject(), [makeSection()]);
    const milestone = result.sections[0].milestones[0];
    expect(milestone.absoluteDate).toBeDefined();
    // Milestone at relativePosition 0 should be near section start (±1 day for timezone)
    expect(milestone.absoluteDate).toMatch(/^2025-01-0[12]|2024-12-31$/);
  });
});

describe('parseProjectJson', () => {
  it('parses v2.0 format', () => {
    const exported = exportProjectToJson(makeProject(), [makeSection()]);
    const json = JSON.stringify(exported);
    const parsed = parseProjectJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe('floid-project');
    expect(parsed!.sections.length).toBe(1);
  });

  it('parses legacy v2 format', () => {
    const legacyJson = JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      project: makeProject(),
      sections: [makeSection()],
    });
    const result = parseProjectJson(legacyJson);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('floid-project');
    expect(result!.version).toBe('2.0');
  });

  it('returns null for invalid JSON', () => {
    expect(parseProjectJson('not json')).toBeNull();
  });

  it('returns null for unknown format', () => {
    expect(parseProjectJson(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('maps legacy masterSectionId to pinnedSectionId and marks the section multicolor', () => {
    const exported = exportProjectToJson(makeProject(), [makeSection()]);
    const raw = JSON.parse(JSON.stringify(exported));
    delete raw.project.pinnedSectionId;
    raw.project.masterSectionId = 'sec-1';
    delete raw.sections[0].isMulticolor;

    const parsed = parseProjectJson(JSON.stringify(raw));
    expect(parsed!.project.pinnedSectionId).toBe('sec-1');
    expect(parsed!.sections[0].isMulticolor).toBe(true);
  });

  it('defaults isCollapsed to false', () => {
    const exported = exportProjectToJson(makeProject(), [makeSection()]);
    // Remove isCollapsed to test default
    delete (exported.sections[0] as Record<string, unknown>).isCollapsed;
    const json = JSON.stringify(exported);
    const parsed = parseProjectJson(json);
    expect(parsed!.sections[0].isCollapsed).toBe(false);
  });
});

describe('exportProjectToJson → parseProjectJson → convertImportedProject round-trip', () => {
  it('preserves all section data through full round-trip', () => {
    const project = makeProject();
    const section = makeSection();

    const exported = exportProjectToJson(project, [section]);
    const json = JSON.stringify(exported);
    const parsed = parseProjectJson(json);
    const { project: importedProject, sections: importedSections } = convertImportedProject(parsed!);

    expect(importedProject.id).toBe(project.id);
    expect(importedProject.name).toBe(project.name);
    expect(importedSections.length).toBe(1);
    expect(importedSections[0].id).toBe(section.id);
    expect(importedSections[0].phases[0].relativeStart).toBe(section.phases[0].relativeStart);
    expect(importedSections[0].phases[0].relativeEnd).toBe(section.phases[0].relativeEnd);
    expect(importedSections[0].milestones[0].relativePosition).toBe(section.milestones[0].relativePosition);
  });

  it('preserves task data through round-trip', () => {
    const project = makeProject();
    const section = makeSection();

    const exported = exportProjectToJson(project, [section]);
    const json = JSON.stringify(exported);
    const parsed = parseProjectJson(json);
    const { sections } = convertImportedProject(parsed!);

    const task = sections[0].phases[0].tasks[0];
    expect(task.id).toBe('task-1');
    expect(task.name).toBe('User Research');
    expect(task.relativeStart).toBe(0.0);
    expect(task.relativeEnd).toBe(0.5);
  });
});

describe('exportScheduleToFloid / parseScheduleFloid', () => {
  it('produces v2.0 floid format', () => {
    const result = exportScheduleToFloid(makeProject(), makeSection());
    expect(result.format).toBe('floid');
    expect(result.version).toBe('2.0');
    expect(result.sourceProjectId).toBe('proj-1');
  });

  it('round-trips through parse', () => {
    const exported = exportScheduleToFloid(makeProject(), makeSection());
    const json = JSON.stringify(exported);
    const parsed = parseScheduleFloid(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.schedule.id).toBe('sec-1');
    expect(parsed!.schedule.name).toBe('Design');
    expect(parsed!.phases.length).toBe(1);
    expect(parsed!.milestones.length).toBe(1);
  });

  it('parseScheduleFloid returns null for invalid data', () => {
    expect(parseScheduleFloid('not json')).toBeNull();
    expect(parseScheduleFloid(JSON.stringify({ format: 'wrong' }))).toBeNull();
  });
});

describe('analyzeScheduleImport', () => {
  const project = makeProject();

  function makeImportData(overrides: Partial<ScheduleExportData> = {}): ScheduleExportData {
    return {
      format: 'floid',
      version: '2.0',
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
      projectDates: {
        startDate: project.projectStartDate,
        endDate: project.projectEndDate,
      },
      scheduleDates: {
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-07-01T00:00:00.000Z',
      },
      phases: [],
      milestones: [],
      ...overrides,
    };
  }

  it('detects new schedule (no existing match)', () => {
    const data = makeImportData({ schedule: { id: 'new-id', name: 'New', revision: 1, lastModifiedAt: '', color: '#000' } });
    const result = analyzeScheduleImport(data, project, [makeSection()]);
    expect(result.type).toBe('new-schedule');
  });

  it('detects newer update', () => {
    const existing = makeSection({ revision: 3 });
    const data = makeImportData({ schedule: { id: 'sec-1', name: 'Design', revision: 5, lastModifiedAt: '', color: '#000' } });
    const result = analyzeScheduleImport(data, project, [existing]);
    expect(result.type).toBe('update-newer');
    expect(result.revisionDelta).toBe(2);
  });

  it('detects older update', () => {
    const existing = makeSection({ revision: 5 });
    const data = makeImportData({ schedule: { id: 'sec-1', name: 'Design', revision: 3, lastModifiedAt: '', color: '#000' } });
    const result = analyzeScheduleImport(data, project, [existing]);
    expect(result.type).toBe('update-older');
    expect(result.revisionDelta).toBe(-2);
  });

  it('detects same revision', () => {
    const existing = makeSection({ revision: 5 });
    const data = makeImportData();
    const result = analyzeScheduleImport(data, project, [existing]);
    expect(result.type).toBe('update-same');
    expect(result.revisionDelta).toBe(0);
  });

  it('detects name collision', () => {
    const existing = makeSection({ id: 'different-id', name: 'Design' });
    const data = makeImportData({ schedule: { id: 'sec-1', name: 'Design', revision: 1, lastModifiedAt: '', color: '#000' } });
    const result = analyzeScheduleImport(data, project, [existing]);
    expect(result.type).toBe('name-collision');
  });

  it('detects date mismatch', () => {
    const data = makeImportData({
      scheduleDates: { startDate: '2024-01-01T00:00:00.000Z', endDate: '2024-07-01T00:00:00.000Z' },
    });
    const result = analyzeScheduleImport(data, project, []);
    expect(result.dateMismatch).toBe(true);
  });

  it('detects no date mismatch when aligned', () => {
    const data = makeImportData({
      scheduleDates: {
        startDate: project.projectStartDate,
        endDate: project.projectEndDate,
      },
    });
    const result = analyzeScheduleImport(data, project, []);
    expect(result.dateMismatch).toBe(false);
  });
});
