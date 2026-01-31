const STORAGE_KEY = 'floid-project';
const PROJECTS_INDEX_KEY = 'floid-projects-index';

export interface StoredData {
  project: unknown;
  phases: unknown[];
  milestones: unknown[]; // ID timeline milestones
  teams: unknown[];
  version: number;
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

// Get storage key for a specific project
const getProjectKey = (projectId: string): string => `${STORAGE_KEY}-${projectId}`;

// Save a specific project's data
export const saveProjectToStorage = (projectId: string, data: StoredData): void => {
  try {
    localStorage.setItem(getProjectKey(projectId), JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save project to localStorage:', error);
  }
};

// Load a specific project's data
export const loadProjectFromStorage = (projectId: string): StoredData | null => {
  try {
    const data = localStorage.getItem(getProjectKey(projectId));
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load project from localStorage:', error);
    return null;
  }
};

// Delete a specific project's data
export const deleteProjectFromStorage = (projectId: string): void => {
  try {
    localStorage.removeItem(getProjectKey(projectId));
  } catch (error) {
    console.error('Failed to delete project from localStorage:', error);
  }
};

// Save the projects index
export const saveProjectsIndex = (projects: ProjectIndexEntry[]): void => {
  try {
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Failed to save projects index:', error);
  }
};

// Load the projects index
export const loadProjectsIndex = (): ProjectIndexEntry[] => {
  try {
    const data = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load projects index:', error);
    return [];
  }
};

// Legacy support - save to old format
export const saveToStorage = (data: StoredData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

// Legacy support - load from old format
export const loadFromStorage = (): StoredData | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return null;
  }
};

export const clearStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};
