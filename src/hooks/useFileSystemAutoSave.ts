import { useEffect, useRef, useCallback } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { useSyncStore } from '../stores/syncStore';
import { getAppSettings, setAppSettings } from '../utils/indexedDB';
import {
  directoryDisplayName,
  persistDirectory,
  pickDirectory,
  restoreDirectory,
  supportsFolderAutoSave,
  writeFileInDirectory,
} from '../platform/files';
import { exportToJson, projectFloidFilename } from '../utils/exportUtils';
import type { DirectoryToken } from '../platform/types';
import type { Project, Section } from '../types';

const FS_DEBOUNCE_MS = 5000; // Longer debounce for file writes

interface UseFileSystemAutoSaveReturn {
  saveToFolder: () => Promise<boolean>;
  reconnectFolder: () => Promise<boolean>;
}

export function useFileSystemAutoSave(): UseFileSystemAutoSaveReturn {
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const project = useProjectStore((state) => state.project);
  const isInitialized = useSectionStore((state) => state.isInitialized);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);

  const setSyncing = useSyncStore((state) => state.setSyncing);
  const setSynced = useSyncStore((state) => state.setSynced);
  const setError = useSyncStore((state) => state.setError);
  const setDisabled = useSyncStore((state) => state.setDisabled);
  const setFolderName = useSyncStore((state) => state.setFolderName);

  const tokenRef = useRef<DirectoryToken | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the persisted grant and initialize sync state on mount
  useEffect(() => {
    if (!supportsFolderAutoSave()) {
      setDisabled();
      return;
    }

    const initToken = async (): Promise<void> => {
      const token = await restoreDirectory();
      tokenRef.current = token;

      if (token) {
        const settings = await getAppSettings();
        setFolderName(settings.fileSystemFolderName);
      } else {
        setDisabled();
      }
    };

    void initToken();
  }, [setDisabled, setFolderName]);

  /** Adopt a freshly picked folder: remember it, persist it, name it. */
  const adoptToken = useCallback(
    async (token: DirectoryToken): Promise<void> => {
      tokenRef.current = token;
      await persistDirectory(token);
      const name = await directoryDisplayName(token);
      await setAppSettings({ fileSystemFolderName: name });
      setFolderName(name);
    },
    [setFolderName]
  );

  // Core save function
  const performSave = useCallback(
    async (token: DirectoryToken, proj: Project, secs: Section[]): Promise<void> => {
      setSyncing();

      try {
        const contents = exportToJson(proj, secs, useSectionStore.getState().dependencies);
        await writeFileInDirectory(token, projectFloidFilename(proj), contents);
        setSynced(await directoryDisplayName(token));

        // Update last sync date in app settings
        await setAppSettings({ lastFileSystemSyncDate: new Date().toISOString() });
      } catch (e) {
        const error = e as Error;
        console.error('File system auto-save failed:', error);

        if (error.name === 'NotFoundError') {
          // Folder was deleted
          setError('Folder not found');
          tokenRef.current = null;
          await persistDirectory(null);
          await setAppSettings({ fileSystemFolderName: null });
        } else if (
          error.name === 'NotAllowedError' ||
          error.message.includes('Permission denied') ||
          error.message.includes('forbidden')
        ) {
          // Permission was lost — the sandbox forgot the grant; reconnect re-picks
          setError('Permission lost');
        } else {
          setError('Save failed');
        }
      }
    },
    [setSyncing, setSynced, setError]
  );

  // Auto-save on changes
  useEffect(() => {
    if (!isInitialized || !isStorageReady || !project || !tokenRef.current) return;
    if (!supportsFolderAutoSave()) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const token = tokenRef.current;
      if (!token) return;
      void performSave(token, project, sections);
    }, FS_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sections, dependencies, project, isInitialized, isStorageReady, performSave]);

  // Manual save to folder (for "Save to Folder" button)
  const saveToFolder = useCallback(async (): Promise<boolean> => {
    if (!project) return false;
    if (!supportsFolderAutoSave()) return false;

    let token = tokenRef.current;

    // If no folder yet, prompt the user to select one
    if (!token) {
      token = await pickDirectory({ id: 'floid-autosave' });
      if (!token) return false;
      await adoptToken(token);
    }

    await performSave(token, project, sections);
    return true;
  }, [project, sections, performSave, adoptToken]);

  // Reconnect to a folder (for when the grant is lost)
  const reconnectFolder = useCallback(async (): Promise<boolean> => {
    if (!supportsFolderAutoSave()) return false;

    const token = await pickDirectory({ id: 'floid-autosave' });
    if (!token) return false;

    await adoptToken(token);
    return true;
  }, [adoptToken]);

  return { saveToFolder, reconnectFolder };
}
