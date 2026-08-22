import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredData, ProjectIndexEntry } from '../utils/storageUtils';

// Mock the indexedDB module before importing storageUtils
vi.mock('../utils/indexedDB', () => {
  const store = new Map<string, unknown>();
  return {
    setProjectData: vi.fn(async (id: string, data: unknown) => { store.set(id, data); }),
    getProjectData: vi.fn(async (id: string) => store.get(id) ?? null),
    deleteProjectData: vi.fn(async (id: string) => { store.delete(id); }),
    setProjectsIndex: vi.fn(async (projects: unknown) => { store.set('__index', projects); }),
    getProjectsIndex: vi.fn(async () => (store.get('__index') as ProjectIndexEntry[]) ?? []),
    migrateFromLocalStorage: vi.fn(async () => {}),
    setAppSettings: vi.fn(async () => {}),
  };
});

// Import after mocking
import {
  saveProjectToStorage,
  loadProjectFromStorage,
  deleteProjectFromStorage,
  saveProjectsIndex,
  loadProjectsIndex,
  saveProjectToStorageSync,
  saveProjectsIndexSync,
  recoverFromLocalStorage,
  migrateStoredData,
  STORAGE_SCHEMA_VERSION,
} from '../utils/storageUtils';
import type { LegacySection } from '../types/legacy';

// Already on the current schema, so the load path has nothing to change.
const mockData: StoredData = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  project: {
    id: 'proj-1',
    name: 'Test',
    pinnedSectionId: 'sec-1',
    projectStartDate: '2025-01-01',
    projectEndDate: '2025-07-01',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  sections: [],
};

beforeEach(() => {
  localStorage.clear();
});

describe('async storage (IndexedDB)', () => {
  it('saves and loads project data', async () => {
    await saveProjectToStorage('proj-1', mockData);
    const loaded = await loadProjectFromStorage('proj-1');
    expect(loaded).toEqual(mockData);
  });

  it('returns null for non-existent project', async () => {
    const loaded = await loadProjectFromStorage('nonexistent');
    expect(loaded).toBeNull();
  });

  it('deletes project data', async () => {
    await saveProjectToStorage('proj-1', mockData);
    await deleteProjectFromStorage('proj-1');
    const loaded = await loadProjectFromStorage('proj-1');
    expect(loaded).toBeNull();
  });

  it('saves and loads projects index', async () => {
    const index: ProjectIndexEntry[] = [
      { id: 'proj-1', name: 'Test', updatedAt: '2025-01-01T00:00:00.000Z' },
    ];
    await saveProjectsIndex(index);
    const loaded = await loadProjectsIndex();
    expect(loaded).toEqual(index);
  });
});

describe('sync fallback (localStorage)', () => {
  it('saves project to localStorage', () => {
    saveProjectToStorageSync('proj-1', mockData);
    const stored = localStorage.getItem('floid-project-proj-1');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(mockData);
  });

  it('saves projects index to localStorage', () => {
    const index: ProjectIndexEntry[] = [
      { id: 'proj-1', name: 'Test', updatedAt: '2025-01-01T00:00:00.000Z' },
    ];
    saveProjectsIndexSync(index);
    const stored = localStorage.getItem('floid-projects-index');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(index);
  });
});

describe('the load path migrates on the way out of storage', () => {
  const legacySection: LegacySection = {
    id: 'sec-1',
    name: 'Design',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2025-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-07-01T00:00:00.000Z',
    phases: [],
    milestones: [],
    color: '#3b82f6',
    isCollapsed: false,
  };

  const legacyStored = (): StoredData => {
    const project = { ...mockData.project, masterSectionId: 'sec-1' } as unknown as Record<
      string,
      unknown
    >;
    delete project.pinnedSectionId;
    delete project.schemaVersion;
    return {
      project: project as unknown as StoredData['project'],
      sections: [legacySection] as never,
    };
  };

  it('maps a legacy master schedule to the pin', () => {
    const migrated = migrateStoredData(legacyStored());
    expect(migrated.project.pinnedSectionId).toBe('sec-1');
    expect(migrated.project).not.toHaveProperty('masterSectionId');
    // The former master schedule kept a per-phase palette
    expect(migrated.sections[0].isMulticolor).toBe(true);
  });

  it('stamps the schema version so the next load is a no-op', () => {
    expect(migrateStoredData(legacyStored()).schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(migrateStoredData(mockData)).toBe(mockData);
  });

  it('runs on data read back out of storage', async () => {
    await saveProjectToStorage('legacy-proj', legacyStored());
    const loaded = await loadProjectFromStorage('legacy-proj');
    expect(loaded?.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(loaded?.sections[0]).toHaveProperty('items');
    expect(loaded?.sections[0]).not.toHaveProperty('phases');
  });

  it('never stamps the current version onto data it has not converted', async () => {
    // The load path trusts the stamp, so a write that lies about it would make
    // the record permanently unreadable.
    await saveProjectToStorage('stamped', legacyStored());
    const raw = (await loadProjectFromStorage('stamped')) as StoredData;
    expect(raw.sections[0]).not.toHaveProperty('phases');
  });

  it('runs on an emergency save recovered from localStorage', async () => {
    localStorage.setItem('floid-project-legacy-2', JSON.stringify(legacyStored()));
    const recovered = await recoverFromLocalStorage('legacy-2');
    expect(recovered?.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(recovered?.project.pinnedSectionId).toBe('sec-1');
  });

  it('gives a pre-v4 save an empty dependency list', () => {
    expect(migrateStoredData(legacyStored()).dependencies).toEqual([]);
  });

  it('keeps only dependency edges whose items survived the migration', () => {
    const stored: StoredData = {
      ...legacyStored(),
      dependencies: [
        { id: 'e1', from: 'ghost-a', fromAnchor: 'end', to: 'ghost-b', toAnchor: 'start' },
      ],
    };
    expect(migrateStoredData(stored).dependencies).toEqual([]);
  });
});

describe('recoverFromLocalStorage', () => {
  it('recovers data from localStorage emergency save', async () => {
    localStorage.setItem('floid-project-proj-1', JSON.stringify(mockData));
    const recovered = await recoverFromLocalStorage('proj-1');
    expect(recovered).toEqual(mockData);
    // Should clean up localStorage
    expect(localStorage.getItem('floid-project-proj-1')).toBeNull();
  });

  it('returns null when no emergency data exists', async () => {
    const result = await recoverFromLocalStorage('nonexistent');
    expect(result).toBeNull();
  });
});
