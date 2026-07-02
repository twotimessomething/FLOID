import type { Section } from '../types';
import type { Project } from '../types/project';
import * as idb from './indexedDB';

const STORAGE_KEY = 'floid-project';
const PROJECTS_INDEX_KEY = 'floid-projects-index';

export interface StoredData {
  project: Project;
  sections: Section[];
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

// Get storage key for a specific project
const getProjectKey = (projectId: string): string => `${STORAGE_KEY}-${projectId}`;

/**
 * Migrate stored data from the legacy master-schedule model to the pin model:
 * `masterSectionId` becomes `pinnedSectionId`, and the former master keeps its
 * multicolor phase palette via `isMulticolor`.
 */
export const migrateStoredData = (data: StoredData): StoredData => {
  const rawProject = data.project as Project & { masterSectionId?: string };
  if (rawProject.pinnedSectionId !== undefined || rawProject.masterSectionId === undefined) {
    return data;
  }

  const { masterSectionId, ...projectRest } = rawProject;
  return {
    project: { ...projectRest, pinnedSectionId: masterSectionId ?? null },
    sections: data.sections.map((section) =>
      section.id === masterSectionId && section.isMulticolor === undefined
        ? { ...section, isMulticolor: true }
        : section
    ),
  };
};

// Async primary storage using IndexedDB
export const saveProjectToStorage = async (projectId: string, data: StoredData): Promise<void> => {
  await idb.setProjectData(projectId, data);
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
    localStorage.setItem(getProjectKey(projectId), JSON.stringify(data));
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
      console.log(`Recovered project ${projectId} from localStorage emergency save`);
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
