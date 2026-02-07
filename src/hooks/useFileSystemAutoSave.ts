import { useEffect, useRef, useCallback } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { useSyncStore } from '../stores/syncStore';
import { getFileHandle, setFileHandle, getAppSettings, setAppSettings } from '../utils/indexedDB';
import { writeProjectToFolder, isFileSystemAccessSupported, requestDirectoryAccess } from '../utils/fileSystemUtils';
import type { Project, Section } from '../types';

const FS_DEBOUNCE_MS = 5000; // Longer debounce for file writes

interface UseFileSystemAutoSaveReturn {
  saveToFolder: () => Promise<boolean>;
  reconnectFolder: () => Promise<boolean>;
}

export function useFileSystemAutoSave(): UseFileSystemAutoSaveReturn {
  const sections = useSectionStore((state) => state.sections);
  const project = useProjectStore((state) => state.project);
  const isInitialized = useSectionStore((state) => state.isInitialized);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);

  const setSyncing = useSyncStore((state) => state.setSyncing);
  const setSynced = useSyncStore((state) => state.setSynced);
  const setError = useSyncStore((state) => state.setError);
  const setDisabled = useSyncStore((state) => state.setDisabled);
  const setFolderName = useSyncStore((state) => state.setFolderName);

  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load handle and initialize sync state on mount
  useEffect(() => {
    if (!isFileSystemAccessSupported()) {
      setDisabled();
      return;
    }

    const initHandle = async (): Promise<void> => {
      const h = await getFileHandle();
      handleRef.current = h;

      if (h) {
        const settings = await getAppSettings();
        setFolderName(settings.fileSystemFolderName);
      } else {
        setDisabled();
      }
    };

    initHandle();
  }, [setDisabled, setFolderName]);

  // Core save function
  const performSave = useCallback(
    async (handle: FileSystemDirectoryHandle, proj: Project, secs: Section[]): Promise<void> => {
      setSyncing();

      try {
        await writeProjectToFolder(handle, proj, secs);
        setSynced(handle.name);

        // Update last sync date in app settings
        await setAppSettings({ lastFileSystemSyncDate: new Date().toISOString() });
      } catch (e) {
        const error = e as Error;
        console.error('File system auto-save failed:', error);

        // Check for specific error types
        if (error.name === 'NotFoundError') {
          // Folder was deleted
          setError('Folder not found');
          handleRef.current = null;
          await setFileHandle(null);
          await setAppSettings({ fileSystemFolderName: null });
        } else if (error.name === 'NotAllowedError' || error.message.includes('Permission denied')) {
          // Permission was lost
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
    if (!isInitialized || !isStorageReady || !project || !handleRef.current) return;
    if (!isFileSystemAccessSupported()) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const handle = handleRef.current;
      if (!handle) return;
      performSave(handle, project, sections);
    }, FS_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sections, project, isInitialized, isStorageReady, performSave]);

  // Manual save to folder (for "Save to Folder" button)
  const saveToFolder = useCallback(async (): Promise<boolean> => {
    if (!project) return false;
    if (!isFileSystemAccessSupported()) return false;

    let handle = handleRef.current;

    // If no handle, prompt user to select folder
    if (!handle) {
      handle = await requestDirectoryAccess();
      if (!handle) return false;

      // Store the handle
      handleRef.current = handle;
      await setFileHandle(handle);
      await setAppSettings({ fileSystemFolderName: handle.name });
      setFolderName(handle.name);
    }

    // Perform the save
    await performSave(handle, project, sections);
    return true;
  }, [project, sections, performSave, setFolderName]);

  // Reconnect to folder (for when permission is lost)
  const reconnectFolder = useCallback(async (): Promise<boolean> => {
    if (!isFileSystemAccessSupported()) return false;

    const handle = await requestDirectoryAccess();
    if (!handle) return false;

    handleRef.current = handle;
    await setFileHandle(handle);
    await setAppSettings({ fileSystemFolderName: handle.name });
    setFolderName(handle.name);

    return true;
  }, [setFolderName]);

  return { saveToFolder, reconnectFolder };
}
