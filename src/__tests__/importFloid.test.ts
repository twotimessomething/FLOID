import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importFloidText, isFloidFileName } from '../utils/importFloid';
import { exportProjectToJson } from '../utils/exportUtils';
import type { Project, Section } from '../types';

vi.mock('../utils/indexedDB', () => ({
  setAppSettings: vi.fn().mockResolvedValue(undefined),
}));

const mocks = vi.hoisted(() => ({
  activeProjectId: null as string | null,
  saveCurrentProject: vi.fn(async () => undefined),
  importProject: vi.fn(async () => 'imported-id'),
  selectProject: vi.fn(async () => undefined),
  loadSectionsForProject: vi.fn(async () => undefined),
  showToast: vi.fn(),
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      activeProjectId: mocks.activeProjectId,
      saveCurrentProject: mocks.saveCurrentProject,
      importProject: mocks.importProject,
      selectProject: mocks.selectProject,
    }),
  },
}));

vi.mock('../stores/sectionStore', () => ({
  useSectionStore: {
    getState: () => ({
      sections: [],
      dependencies: [],
      loadSectionsForProject: mocks.loadSectionsForProject,
    }),
  },
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: { getState: () => ({ showToast: mocks.showToast }) },
}));

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Imported',
    pinnedSectionId: null,
    projectStartDate: '2025-01-01',
    projectEndDate: '2025-07-01',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeSection(): Section {
  return {
    id: 'sec-1',
    name: 'Design',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2025-01-15T00:00:00.000Z',
    order: 0,
    startDate: '2025-01-01',
    endDate: '2025-07-01',
    items: [],
    color: '#3b82f6',
    isCollapsed: false,
  };
}

const projectFileText = (): string =>
  JSON.stringify(exportProjectToJson(makeProject(), [makeSection()]));

const handleScheduleImport = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeProjectId = null;
});

describe('importFloidText', () => {
  it("routes a schedule file (format: 'floid') to the schedule handler", async () => {
    const text = JSON.stringify({ format: 'floid', anything: true });
    const outcome = await importFloidText(text, { handleScheduleImport });

    expect(outcome).toBe('schedule');
    expect(handleScheduleImport).toHaveBeenCalledWith(text);
    expect(mocks.importProject).not.toHaveBeenCalled();
  });

  it('imports a project file and switches to it', async () => {
    const outcome = await importFloidText(projectFileText(), { handleScheduleImport });

    expect(outcome).toBe('project');
    expect(handleScheduleImport).not.toHaveBeenCalled();
    expect(mocks.importProject).toHaveBeenCalledOnce();
    expect(mocks.selectProject).toHaveBeenCalledWith('imported-id');
    expect(mocks.loadSectionsForProject).toHaveBeenCalledWith('imported-id');
    expect(mocks.showToast).toHaveBeenCalledWith('success', 'Imported project “Imported”');
  });

  it('saves the current project first only when one is open', async () => {
    await importFloidText(projectFileText(), { handleScheduleImport });
    expect(mocks.saveCurrentProject).not.toHaveBeenCalled();

    mocks.activeProjectId = 'existing';
    await importFloidText(projectFileText(), { handleScheduleImport });
    expect(mocks.saveCurrentProject).toHaveBeenCalledOnce();
  });

  it('reports invalid input without touching anything', async () => {
    expect(await importFloidText('not json at all', { handleScheduleImport })).toBe('invalid');
    expect(await importFloidText('{"format":"mystery"}', { handleScheduleImport })).toBe('invalid');

    expect(handleScheduleImport).not.toHaveBeenCalled();
    expect(mocks.importProject).not.toHaveBeenCalled();
  });

  it('says so when a file is not a FLOID file, by name when it has one', async () => {
    await importFloidText('not json at all');
    expect(mocks.showToast).toHaveBeenLastCalledWith(
      'error',
      'Couldn’t open this file. It isn’t a FLOID file.'
    );

    await importFloidText('{"name":"left-pad"}', { fileName: 'package.json' });
    expect(mocks.showToast).toHaveBeenLastCalledWith(
      'error',
      'Couldn’t open “package.json”. It isn’t a FLOID file.'
    );
  });
});

describe('isFloidFileName', () => {
  it('accepts what the Open dialog offers, in any case', () => {
    expect(isFloidFileName('Plan.floid')).toBe(true);
    expect(isFloidFileName('Backup.floid-project')).toBe(true);
    expect(isFloidFileName('old-export.json')).toBe(true);
    expect(isFloidFileName('SHOUTY.FLOID')).toBe(true);
  });

  it('turns away everything else', () => {
    expect(isFloidFileName('mockup.png')).toBe(false);
    expect(isFloidFileName('floid')).toBe(false);
    expect(isFloidFileName('plan.floid.txt')).toBe(false);
  });
});
