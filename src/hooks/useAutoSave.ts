import { useEffect, useRef, useCallback } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';

const DEBOUNCE_MS = 1000;

export function useAutoSave() {
  const sections = useSectionStore((state) => state.sections);
  const isInitialized = useSectionStore((state) => state.isInitialized);
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const saveCurrentProject = useProjectStore((state) => state.saveCurrentProject);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);

  // Immediate save function for use in event handlers
  const saveImmediately = useCallback(() => {
    if (!isInitialized || !activeProjectId) return;

    // Clear any pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Get latest state directly from stores to ensure we save current data
    const latestSections = useSectionStore.getState().sections;
    useProjectStore.getState().saveCurrentProject(latestSections);
    pendingSaveRef.current = false;
  }, [isInitialized, activeProjectId]);

  // Debounced save on state changes
  useEffect(() => {
    // Don't save until initialized and we have an active project
    if (!isInitialized || !activeProjectId) return;

    pendingSaveRef.current = true;

    // Debounce the save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      // Use the proper per-project save function
      saveCurrentProject(sections);
      pendingSaveRef.current = false;
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sections, project, isInitialized, activeProjectId, saveCurrentProject]);

  // Save immediately when tab becomes hidden or page is about to unload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingSaveRef.current) {
        saveImmediately();
      }
    };

    const handleBeforeUnload = () => {
      if (pendingSaveRef.current) {
        saveImmediately();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveImmediately]);
}
