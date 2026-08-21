import type { AppSettings } from '../types/storage';
import { DEFAULT_APP_SETTINGS } from '../types/storage';
import type { StoredData, ProjectIndexEntry } from './storageUtils';

const DB_NAME = 'floid-storage';
const DB_VERSION = 1;

const STORES = {
  PROJECTS_INDEX: 'projects-index',
  PROJECT_DATA: 'project-data',
  APP_SETTINGS: 'app-settings',
  FILE_HANDLES: 'file-handles',
} as const;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Projects index store (list of all projects)
      if (!db.objectStoreNames.contains(STORES.PROJECTS_INDEX)) {
        db.createObjectStore(STORES.PROJECTS_INDEX, { keyPath: 'key' });
      }

      // Project data store (actual project data keyed by project ID)
      if (!db.objectStoreNames.contains(STORES.PROJECT_DATA)) {
        db.createObjectStore(STORES.PROJECT_DATA, { keyPath: 'id' });
      }

      // App settings store (single record)
      if (!db.objectStoreNames.contains(STORES.APP_SETTINGS)) {
        db.createObjectStore(STORES.APP_SETTINGS, { keyPath: 'key' });
      }

      // File handles store (for File System Access API)
      if (!db.objectStoreNames.contains(STORES.FILE_HANDLES)) {
        db.createObjectStore(STORES.FILE_HANDLES, { keyPath: 'key' });
      }
    };
  });

  return dbPromise;
}

// Helper to perform a transaction
async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Projects index operations
export async function getProjectsIndex(): Promise<ProjectIndexEntry[]> {
  try {
    const result = await withTransaction<{ key: string; entries: ProjectIndexEntry[] } | undefined>(
      STORES.PROJECTS_INDEX,
      'readonly',
      (store) => store.get('index')
    );
    return result?.entries ?? [];
  } catch (error) {
    console.error('Failed to get projects index from IndexedDB:', error);
    return [];
  }
}

export async function setProjectsIndex(entries: ProjectIndexEntry[]): Promise<void> {
  try {
    await withTransaction(STORES.PROJECTS_INDEX, 'readwrite', (store) =>
      store.put({ key: 'index', entries })
    );
  } catch (error) {
    console.error('Failed to save projects index to IndexedDB:', error);
  }
}

// Project data operations
export async function getProjectData(projectId: string): Promise<StoredData | null> {
  try {
    const result = await withTransaction<{ id: string; data: StoredData } | undefined>(
      STORES.PROJECT_DATA,
      'readonly',
      (store) => store.get(projectId)
    );
    return result?.data ?? null;
  } catch (error) {
    console.error('Failed to get project data from IndexedDB:', error);
    return null;
  }
}

export async function setProjectData(projectId: string, data: StoredData): Promise<void> {
  try {
    await withTransaction(STORES.PROJECT_DATA, 'readwrite', (store) =>
      store.put({ id: projectId, data })
    );
  } catch (error) {
    console.error('Failed to save project data to IndexedDB:', error);
  }
}

export async function deleteProjectData(projectId: string): Promise<void> {
  try {
    await withTransaction(STORES.PROJECT_DATA, 'readwrite', (store) =>
      store.delete(projectId)
    );
  } catch (error) {
    console.error('Failed to delete project data from IndexedDB:', error);
  }
}

// App settings operations
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const result = await withTransaction<{ key: string; settings: AppSettings } | undefined>(
      STORES.APP_SETTINGS,
      'readonly',
      (store) => store.get('settings')
    );
    return result?.settings ?? DEFAULT_APP_SETTINGS;
  } catch (error) {
    console.error('Failed to get app settings from IndexedDB:', error);
    return DEFAULT_APP_SETTINGS;
  }
}

export async function setAppSettings(updates: Partial<AppSettings>): Promise<void> {
  try {
    const current = await getAppSettings();
    const updated = { ...current, ...updates };
    await withTransaction(STORES.APP_SETTINGS, 'readwrite', (store) =>
      store.put({ key: 'settings', settings: updated })
    );
  } catch (error) {
    console.error('Failed to save app settings to IndexedDB:', error);
  }
}

// File handle operations (for File System Access API)
export async function getFileHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const result = await withTransaction<{ key: string; handle: FileSystemDirectoryHandle } | undefined>(
      STORES.FILE_HANDLES,
      'readonly',
      (store) => store.get('directory')
    );
    return result?.handle ?? null;
  } catch (error) {
    console.error('Failed to get file handle from IndexedDB:', error);
    return null;
  }
}

export async function setFileHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    if (handle) {
      await withTransaction(STORES.FILE_HANDLES, 'readwrite', (store) =>
        store.put({ key: 'directory', handle })
      );
    } else {
      await withTransaction(STORES.FILE_HANDLES, 'readwrite', (store) =>
        store.delete('directory')
      );
    }
  } catch (error) {
    console.error('Failed to save file handle to IndexedDB:', error);
  }
}

/**
 * A shallow "is this a project at all?" check, deliberately blind to the shape
 * of a schedule's contents. Records written by older versions are still valid
 * projects — they are brought up to date on the way out of storage, and
 * anything stricter here would discard them before that can happen.
 */
function isValidStoredData(data: unknown): data is StoredData {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;

  const project = record.project;
  if (!project || typeof project !== 'object') return false;
  const projectFields = project as Record<string, unknown>;
  if (
    typeof projectFields.projectStartDate !== 'string' ||
    typeof projectFields.projectEndDate !== 'string'
  ) {
    return false;
  }

  if (!Array.isArray(record.sections)) return false;

  return record.sections.every((section: unknown) => {
    if (!section || typeof section !== 'object') return false;
    const fields = section as Record<string, unknown>;
    return typeof fields.startDate === 'string' && typeof fields.endDate === 'string';
  });
}

// Migration helper: Check if localStorage has data to migrate
export async function migrateFromLocalStorage(): Promise<boolean> {
  const PROJECTS_INDEX_KEY = 'floid-projects-index';
  const STORAGE_KEY = 'floid-project';

  try {
    // Check if we already have data in IndexedDB
    const existingIndex = await getProjectsIndex();
    if (existingIndex.length > 0) {
      return false; // Already migrated
    }

    // Check localStorage for projects index
    const localIndexStr = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (!localIndexStr) {
      return false; // No data to migrate
    }

    const localIndex: ProjectIndexEntry[] = JSON.parse(localIndexStr);
    if (localIndex.length === 0) {
      return false;
    }

    // Migrate each project (skip invalid ones)
    const validEntries: ProjectIndexEntry[] = [];
    for (const entry of localIndex) {
      const projectKey = `${STORAGE_KEY}-${entry.id}`;
      const projectDataStr = localStorage.getItem(projectKey);
      if (projectDataStr) {
        try {
          const projectData: unknown = JSON.parse(projectDataStr);
          if (isValidStoredData(projectData)) {
            // Copied across verbatim; loadProjectFromStorage migrates on read,
            // so nothing is rewritten until the user next saves.
            await setProjectData(entry.id, projectData);
            validEntries.push(entry);
          } else {
            console.warn(`Skipping invalid project data for ${entry.id}`);
          }
        } catch {
          console.warn(`Failed to parse project data for ${entry.id}`);
        }
      }
    }

    // Only migrate valid entries
    if (validEntries.length > 0) {
      await setProjectsIndex(validEntries);
    }

    return validEntries.length > 0;
  } catch (error) {
    console.error('Migration from localStorage failed:', error);
    return false;
  }
}
