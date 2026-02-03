import { useEffect, useRef } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { getFileHandle, setFileHandle } from '../utils/indexedDB';
import { writeProjectToFolder, isFileSystemAccessSupported } from '../utils/fileSystemUtils';

const FS_DEBOUNCE_MS = 5000; // Longer debounce for file writes

export function useFileSystemAutoSave(): void {
  const sections = useSectionStore((state) => state.sections);
  const project = useProjectStore((state) => state.project);
  const isInitialized = useSectionStore((state) => state.isInitialized);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);

  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load handle on mount
  useEffect(() => {
    if (!isFileSystemAccessSupported()) return;

    getFileHandle().then((h) => {
      handleRef.current = h;
    });
  }, []);

  // Auto-save on changes
  useEffect(() => {
    if (!isInitialized || !isStorageReady || !project || !handleRef.current) return;
    if (!isFileSystemAccessSupported()) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const handle = handleRef.current;
      if (!handle) return;

      try {
        await writeProjectToFolder(handle, project, sections);
      } catch (e) {
        console.error('File system auto-save failed:', e);
        // Clear handle if permission was lost
        handleRef.current = null;
        await setFileHandle(null);
      }
    }, FS_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sections, project, isInitialized, isStorageReady]);
}
