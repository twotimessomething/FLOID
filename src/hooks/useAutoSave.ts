import { useEffect, useRef, useCallback } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { saveProjectToStorageSync, saveProjectsIndexSync } from '../utils/storageUtils';

const DEBOUNCE_MS = 1000;

export function useAutoSave(): void {
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const isInitialized = useSectionStore((state) => state.isInitialized);
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const saveCurrentProject = useProjectStore((state) => state.saveCurrentProject);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);

  // Async save function for normal operation
  const saveImmediately = useCallback(async () => {
    if (!isInitialized || !activeProjectId) return;

    // Clear any pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Get latest state directly from stores to ensure we save current data
    const latest = useSectionStore.getState();
    await useProjectStore.getState().saveCurrentProject(latest.sections, latest.dependencies);
    pendingSaveRef.current = false;
  }, [isInitialized, activeProjectId]);

  // Sync fallback for page unload (IndexedDB can't complete during unload)
  const saveSync = useCallback(() => {
    const state = useProjectStore.getState();
    const sectionsState = useSectionStore.getState();

    if (!state.activeProjectId || !state.project) return;

    const updatedAt = new Date().toISOString();
    const updatedProject = { ...state.project, updatedAt };

    // Save project data synchronously to localStorage
    saveProjectToStorageSync(state.activeProjectId, {
      project: updatedProject,
      sections: sectionsState.sections,
      dependencies: sectionsState.dependencies,
    });

    // Also save updated projects index
    const updatedProjects = state.projects.map((p) =>
      p.id === state.activeProjectId ? { ...p, updatedAt } : p
    );
    saveProjectsIndexSync(updatedProjects);
  }, []);

  // Debounced save on state changes
  useEffect(() => {
    // Don't save until initialized and we have an active project
    if (!isInitialized || !activeProjectId) return;

    pendingSaveRef.current = true;

    // Debounce the save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      // Use the proper per-project save function
      await saveCurrentProject(sections, dependencies);
      pendingSaveRef.current = false;
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [sections, dependencies, project, isInitialized, activeProjectId, saveCurrentProject]);

  // Save immediately when tab becomes hidden or page is about to unload
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden' && pendingSaveRef.current) {
        // Try async save first when going hidden (not unloading)
        saveImmediately().catch(console.error);
      }
    };

    const handleBeforeUnload = (): void => {
      if (pendingSaveRef.current) {
        // Use sync fallback for beforeunload since IndexedDB can't complete
        saveSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveImmediately, saveSync]);
}
