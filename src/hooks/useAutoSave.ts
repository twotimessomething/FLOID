import { useEffect } from 'react';
import { create } from 'zustand';
import { BACK_UP_ACTION } from '../commands/executeCommand';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore, type ToastState } from '../stores/uiStore';
import { saveProjectToStorageSync, saveProjectsIndexSync } from '../utils/storageUtils';

const DEBOUNCE_MS = 1000;

/**
 * The longest the end of a session waits on IndexedDB. A write that has not
 * landed by then is not going to, and an app that will not quit is worse than
 * one that leaves the localStorage copy behind.
 */
const EXIT_FLUSH_MS = 2000;

/**
 * A toast takes a lifetime, not "until dismissed". A day is the latter in
 * practice, and stays well inside setTimeout's 32-bit ceiling.
 */
const UNTIL_DISMISSED_MS = 24 * 60 * 60 * 1000;

const SAVE_FAILED_MESSAGE = 'Couldn’t save your changes. Export a backup to keep them safe.';

/*
 * Autosave's state lives here rather than in refs: the Mac's Quit and its
 * window close have to flush it from outside React. App mounts the hook once.
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** True from an edit until a save picks it up; a save that fails sets it again. */
let needsSave = false;
/** The latest write still running, so the end of a session can wait on it. */
let inFlight: Promise<void> | null = null;
/** The failure toast, while it might still be the one on screen. */
let failureToast: ToastState | null = null;

/**
 * Whether the last write failed. The unit is the streak: its first failure
 * says so, once, and the next save that lands ends it — a toast per keystroke
 * would be a toast nobody reads.
 */
const useSaveHealth = create<{ readonly isFailing: boolean }>(() => ({ isFailing: false }));

/** Whether IndexedDB is refusing writes right now. */
export function useIsSaveFailing(): boolean {
  return useSaveHealth((state) => state.isFailing);
}

function handleSaved(): void {
  if (!useSaveHealth.getState().isFailing) return;
  useSaveHealth.setState({ isFailing: false });
  // A warning about a save that has since landed is no longer true
  const ui = useUIStore.getState();
  if (ui.toast === failureToast) ui.hideToast();
  failureToast = null;
}

function handleSaveFailed(error: unknown): void {
  console.error('Autosave failed:', error);
  needsSave = true;
  if (useSaveHealth.getState().isFailing) return;
  useSaveHealth.setState({ isFailing: true });
  useUIStore.getState().showToast('error', SAVE_FAILED_MESSAGE, {
    duration: UNTIL_DISMISSED_MS,
    action: BACK_UP_ACTION,
  });
  failureToast = useUIStore.getState().toast;
}

/** Writes the open project as it stands now. Never rejects; failure is reported. */
function save(): Promise<void> {
  needsSave = false;
  const { sections, dependencies } = useSectionStore.getState();
  const write: Promise<void> = useProjectStore
    .getState()
    .saveCurrentProject(sections, dependencies)
    .then(handleSaved, handleSaveFailed)
    .finally(() => {
      if (inFlight === write) inFlight = null;
    });
  inFlight = write;
  return write;
}

function scheduleSave(): void {
  needsSave = true;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void save();
  }, DEBOUNCE_MS);
}

function cancelScheduledSave(): void {
  if (debounceTimer === null) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;
}

/** Writes now whatever the debounce is still holding, or waits on the write already running. */
function flush(): Promise<void> {
  cancelScheduledSave();
  if (needsSave) return save();
  return inFlight ?? Promise.resolve();
}

function hasUnsavedChanges(): boolean {
  return needsSave || inFlight !== null;
}

/**
 * The emergency copy, for the moment a session ends and IndexedDB can no
 * longer be waited on. `initializeStorage` moves it back into IndexedDB on the
 * next launch — which is why nothing mid-session may write one: it would be
 * recovered over any newer save.
 */
function saveSync(): void {
  const state = useProjectStore.getState();
  const sectionsState = useSectionStore.getState();

  if (!state.activeProjectId || !state.project) return;

  const updatedAt = new Date().toISOString();
  const updatedProject = { ...state.project, updatedAt };

  saveProjectToStorageSync(state.activeProjectId, {
    project: updatedProject,
    sections: sectionsState.sections,
    dependencies: sectionsState.dependencies,
  });

  const updatedProjects = state.projects.map((p) =>
    p.id === state.activeProjectId ? { ...p, updatedAt } : p
  );
  saveProjectsIndexSync(updatedProjects);
}

/**
 * The session is ending: write what is pending, within EXIT_FLUSH_MS. Whatever
 * IndexedDB has not confirmed by then — refused or still running — goes to the
 * emergency copy instead. Never rejects, so a close handler awaiting it always
 * gets to close.
 *
 * For the desktop's Quit and window close, which the web's `beforeunload`
 * never hears about.
 */
export async function flushAutoSave(): Promise<void> {
  if (!hasUnsavedChanges()) return;
  await Promise.race([flush(), new Promise<void>((resolve) => setTimeout(resolve, EXIT_FLUSH_MS))]);
  if (hasUnsavedChanges()) saveSync();
}

export function useAutoSave(): void {
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const isInitialized = useSectionStore((state) => state.isInitialized);
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  // Debounced save on state changes. The save reads the stores when it fires,
  // so the values here only say *that* something changed.
  useEffect(() => {
    if (!isInitialized || !activeProjectId) return;
    scheduleSave();
    return cancelScheduledSave;
  }, [sections, dependencies, project, isInitialized, activeProjectId]);

  // Save immediately when the page goes hidden or is about to unload
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      // Hidden is not gone, so IndexedDB still has time to finish. A save that
      // failed is retried here too: stepping away is a natural moment to try.
      if (document.visibilityState === 'hidden' && needsSave) void flush();
    };

    const handleBeforeUnload = (): void => {
      // IndexedDB cannot complete during unload, hence the sync copy
      if (hasUnsavedChanges()) saveSync();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
