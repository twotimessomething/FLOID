import type { Section } from '../types';
import type { Project } from '../types/project';
import { normalizeDayKey, todayKey } from './dayKeys';
import { migrateSections } from './migrateLegacy';
import * as idb from './indexedDB';

const STORAGE_KEY = 'floid-project';
const PROJECTS_INDEX_KEY = 'floid-projects-index';

/**
 * 1 — pre-versioning: a master schedule (`masterSectionId`) and phases/tasks at
 *     relative positions.
 * 2 — the pin replaced the master schedule.
 * 3 — one recursive item tree per schedule, positioned by absolute day keys.
 *
 * Saves written before versioning carry no `schemaVersion` at all and are
 * treated as 1, which is why every migration step below has to be safe to run
 * against a shape it may already be in.
 */
export const STORAGE_SCHEMA_VERSION = 3;

export interface StoredData {
  project: Project;
  sections: Section[];
  /** Absent on anything written before versioning; see STORAGE_SCHEMA_VERSION. */
  schemaVersion?: number;
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

// Get storage key for a specific project
const getProjectKey = (projectId: string): string => `${STORAGE_KEY}-${projectId}`;

/** A stored date may be a day key, a full ISO timestamp, or missing entirely. */
const readDayKey = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 ? normalizeDayKey(value) : todayKey();

/**
 * Bring a saved project up to the current schema on the way out of storage, so
 * the rest of the app only ever meets the current model.
 *
 * Nothing here depends on the version stamp being present or accurate — each
 * step recognises the shape it needs to change and leaves everything else
 * alone, so running this twice produces the same result as running it once.
 */
export const migrateStoredData = (data: StoredData): StoredData => {
  // A record with no project is beyond repair; the caller treats it as missing.
  if (!data?.project) return data;
  if (data.schemaVersion === STORAGE_SCHEMA_VERSION) return data;

  const rawProject = data.project as Project & { masterSectionId?: string };
  const { masterSectionId, ...project } = rawProject;

  const sections = migrateSections(data.sections ?? []).map((section) =>
    // The former master schedule kept a per-phase palette; the pin does not,
    // so the palette becomes an explicit opt-in on that one schedule.
    section.id === masterSectionId && section.isMulticolor === undefined
      ? { ...section, isMulticolor: true }
      : section
  );

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    project: {
      ...project,
      // An explicit null means the user unpinned; only an absent field falls
      // back to the master schedule this project was saved with.
      pinnedSectionId:
        project.pinnedSectionId !== undefined ? project.pinnedSectionId : (masterSectionId ?? null),
      projectStartDate: readDayKey(rawProject.projectStartDate),
      projectEndDate: readDayKey(rawProject.projectEndDate),
    },
    sections,
  };
};

/**
 * Async primary storage using IndexedDB.
 *
 * The write path migrates before it stamps. Stamping whatever it was handed
 * would make the version a claim rather than a fact, and the load path trusts
 * that claim — one write of un-migrated data through this door and the record
 * is unreadable forever. Migration is idempotent, so current data pays nothing.
 */
export const saveProjectToStorage = async (projectId: string, data: StoredData): Promise<void> => {
  const current = migrateStoredData(data);
  await idb.setProjectData(projectId, { ...current, schemaVersion: STORAGE_SCHEMA_VERSION });
};

export const loadProjectFromStorage = async (projectId: string): Promise<StoredData | null> => {
  const data = await idb.getProjectData(projectId);
  return data ? migrateStoredData(data) : null;
};

export const deleteProjectFromStorage = async (projectId: string): Promise<void> => {
  await idb.deleteProjectData(projectId);
};

export const saveProjectsIndex = async (projects: ProjectIndexEntry[]): Promise<void> => {
  await idb.setProjectsIndex(projects);
};

export const loadProjectsIndex = async (): Promise<ProjectIndexEntry[]> => {
  return idb.getProjectsIndex();
};

// Sync fallback for emergency saves (page unload)
// IndexedDB can't complete during beforeunload, so we use localStorage as fallback
export const saveProjectToStorageSync = (projectId: string, data: StoredData): void => {
  try {
    localStorage.setItem(
      getProjectKey(projectId),
      JSON.stringify({ ...migrateStoredData(data), schemaVersion: STORAGE_SCHEMA_VERSION })
    );
  } catch (error) {
    console.error('Emergency sync save failed:', error);
  }
};

export const saveProjectsIndexSync = (projects: ProjectIndexEntry[]): void => {
  try {
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Emergency sync save of projects index failed:', error);
  }
};

// Recovery: Check localStorage for any data saved during emergency
export const recoverFromLocalStorage = async (projectId: string): Promise<StoredData | null> => {
  try {
    const key = getProjectKey(projectId);
    const data = localStorage.getItem(key);
    if (data) {
      const parsed = migrateStoredData(JSON.parse(data) as StoredData);
      // Save to IndexedDB and remove from localStorage
      await idb.setProjectData(projectId, parsed);
      localStorage.removeItem(key);
      return parsed;
    }
    return null;
  } catch (error) {
    console.error('Failed to recover from localStorage:', error);
    return null;
  }
};

// Initialize storage: migrate from localStorage if needed, then recover any emergency saves
export const initializeStorage = async (): Promise<void> => {
  // First, migrate any existing localStorage data to IndexedDB
  await idb.migrateFromLocalStorage();

  // Then check for any emergency saves that need recovery
  const projectsIndex = await loadProjectsIndex();
  for (const entry of projectsIndex) {
    await recoverFromLocalStorage(entry.id);
  }
};
