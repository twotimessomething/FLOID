import { lazy, Suspense, useEffect, useCallback, useState, type DragEvent } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Header } from './components/layout/Header';
import { TimelineContainer } from './components/layout/TimelineContainer';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { InfoSidebar } from './components/layout/InfoSidebar';
import { NewProjectModal } from './components/layout/NewProjectModal';
import { ContextMenu } from './components/timeline/ContextMenu';
import { Toast } from './components/common/Toast';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { MobileNotice } from './components/common/MobileNotice';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useAutoSave, useKeyboardShortcuts, useScheduleImport, useTheme } from './hooks';
import { useBackupReminder } from './hooks/useBackupReminder';
import { useFileSystemAutoSave } from './hooks/useFileSystemAutoSave';
import { useSectionStore } from './stores/sectionStore';
import { useProjectStore } from './stores/projectStore';
import { useUIStore } from './stores/uiStore';
import { parseProjectJson, convertImportedProject } from './utils/exportUtils';

/**
 * Overlays arrive when they are asked for.
 *
 * Everything below is a surface that is absent until something opens it, so
 * none of it belongs in the chunk that draws the first bar. Each gets its own
 * boundary with a `null` fallback: a modal that has not loaded yet is
 * indistinguishable from a modal that is closed, and one boundary per surface
 * means a slow chunk cannot blank a sibling that is already on screen.
 *
 * Mounting late does not clip the way they arrive. `usePresence` seeds its
 * mounted flag from the open flag, and `.modal-enter` is a CSS animation that
 * runs on mount, so a lazily mounted modal plays its rise in full — it simply
 * starts a moment later.
 */
const loadEditorModal = (): Promise<typeof import('./components/layout/EditorModal')> =>
  import('./components/layout/EditorModal');
const EditorModal = lazy(() => loadEditorModal().then((m) => ({ default: m.EditorModal })));
const AddScheduleModal = lazy(() =>
  import('./components/layout/AddScheduleModal').then((m) => ({ default: m.AddScheduleModal }))
);
const ImportConfirmModal = lazy(() =>
  import('./components/layout/ImportConfirmModal').then((m) => ({ default: m.ImportConfirmModal }))
);
const SettingsModal = lazy(() =>
  import('./components/layout/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const ExportModal = lazy(() =>
  import('./components/layout/ExportModal').then((m) => ({ default: m.ExportModal }))
);
const KeyboardHelpModal = lazy(() =>
  import('./components/layout/KeyboardHelpModal').then((m) => ({ default: m.KeyboardHelpModal }))
);
const AboutModal = lazy(() =>
  import('./components/layout/AboutModal').then((m) => ({ default: m.AboutModal }))
);

/**
 * True from the first time a surface is wanted, and true from then on.
 *
 * A lazy chunk is fetched the moment React renders its element, not when the
 * surface opens — so mounting every modal unconditionally would download all
 * of them at boot and leave the split doing nothing. Gating on the
 * open flag alone would go too far the other way and tear a modal off screen
 * the instant it closed, before `usePresence` could play its exit. Latching
 * gives both: nothing is fetched until it is first asked for, and once a
 * surface exists it stays mounted to leave on its own terms.
 */
function useOnceWanted(isWanted: boolean): boolean {
  const [wasWanted, setWasWanted] = useState(false);
  if (isWanted && !wasWanted) setWasWanted(true);
  return wasWanted || isWanted;
}

function App(): JSX.Element {
  const { initializeFromProject, loadSectionsForProject } = useSectionStore();
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);
  const saveCurrentProject = useProjectStore((state) => state.saveCurrentProject);
  const importProject = useProjectStore((state) => state.importProject);
  const selectProject = useProjectStore((state) => state.selectProject);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);
  const isDraggingFile = useUIStore((state) => state.isDraggingFile);
  const setDraggingFile = useUIStore((state) => state.setDraggingFile);
  const showToast = useUIStore((state) => state.showToast);

  // Each lazy overlay is mounted only once something has asked for it — see
  // `useOnceWanted`. Read as individual selectors so opening one modal does
  // not re-render the others.
  const wantsEditor = useOnceWanted(useUIStore((state) => state.isModalOpen));
  const wantsAddSchedule = useOnceWanted(useUIStore((state) => state.isAddScheduleModalOpen));
  const wantsImportConfirm = useOnceWanted(useUIStore((state) => state.importModal.isOpen));
  const wantsSettings = useOnceWanted(useUIStore((state) => state.isSettingsModalOpen));
  const wantsExport = useOnceWanted(useUIStore((state) => state.isExportModalOpen));
  const wantsKeyboardHelp = useOnceWanted(useUIStore((state) => state.isKeyboardHelpModalOpen));
  const wantsAbout = useOnceWanted(useUIStore((state) => state.isAboutModalOpen));

  const { handleImport: handleScheduleImport, handleConfirmAction } = useScheduleImport();

  // Initialize auto-save functionality
  useAutoSave();

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts();

  // Initialize theme handling
  useTheme();

  // Initialize backup reminder
  useBackupReminder();

  // Initialize file system auto-save
  useFileSystemAutoSave();

  useEffect(() => {
    initializeFromProject();
  }, [initializeFromProject]);

  // Load sections when project changes
  useEffect(() => {
    if (activeProjectId) {
      loadSectionsForProject(activeProjectId);
    }
  }, [activeProjectId, loadSectionsForProject]);

  /**
   * The editor is the one overlay that sits on the timeline's own path —
   * drawing a bar opens it — so it is fetched as soon as the sheet is drawn
   * rather than at the click that needs it. Off the first paint, ahead of the
   * first open.
   */
  useEffect(() => {
    if (!isStorageReady) return;
    const timer = window.setTimeout(() => {
      void loadEditorModal();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isStorageReady]);

  // Disable default browser context menu app-wide
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Close any open context menu when right-clicking elsewhere
    closeContextMenu();
  }, [closeContextMenu]);

  // File drag-and-drop handlers
  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if dragging files
      if (e.dataTransfer.types.includes('Files')) {
        e.dataTransfer.dropEffect = 'copy';
        if (!isDraggingFile) {
          setDraggingFile(true);
        }
      }
    },
    [isDraggingFile, setDraggingFile]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Only set to false if leaving the main container
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
        setDraggingFile(false);
      }
    },
    [setDraggingFile]
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingFile(false);

      const files = Array.from(e.dataTransfer.files);
      const floidFile = files.find((f) => f.name.endsWith('.floid'));

      if (floidFile) {
        const text = await floidFile.text();
        try {
          const parsed = JSON.parse(text);

          if (parsed.format === 'floid') {
            // Schedule import
            handleScheduleImport(text);
          } else if (parsed.format === 'floid-project') {
            // Project import
            const exportData = parseProjectJson(text);
            if (exportData) {
              const {
                project: importedProject,
                sections: importedSections,
                dependencies: importedDependencies,
              } = convertImportedProject(exportData);

              // Save current project before switching (if there is one)
              if (activeProjectId) {
                await saveCurrentProject(sections, dependencies);
              }

              // Add the imported project to the project list
              const newProjectId = await importProject(
                importedProject,
                importedSections,
                importedDependencies
              );

              // Switch to the imported project
              await selectProject(newProjectId);
              await loadSectionsForProject(newProjectId);

              showToast('success', `Imported project "${importedProject.name}"`);
            }
          }
        } catch {
          // Invalid JSON, ignore
        }
      }
    },
    [setDraggingFile, handleScheduleImport, activeProjectId, sections, dependencies, saveCurrentProject, importProject, selectProject, loadSectionsForProject, showToast]
  );

  // Show loading state while storage initializes
  if (!isStorageReady) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-body text-[var(--color-text-secondary)]">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-[var(--color-background)] relative"
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Skip link for keyboard navigation */}
      <a href="#main-timeline" className="skip-link">
        Skip to timeline
      </a>
      {/* SEO: visually hidden heading for crawlers */}
      <h1 className="sr-only">FLOID — Free Product Development Scheduling &amp; Timeline Software</h1>
      <p className="sr-only">Build product development timelines with drag-and-drop phases, tasks, and milestones. Run parallel schedules for every team, pin a reference schedule, and export or share your plan. Free browser-based timeline builder for product development and any project schedule.</p>
      <Header />
      <ErrorBoundary>
        <main
          id="main-timeline"
          className="flex-1 flex min-h-0"
          role="main"
          aria-label="Project timeline"
        >
          <LeftSidebar />
          <TimelineContainer />
          <InfoSidebar />
        </main>
      </ErrorBoundary>
      {wantsEditor && (
        <Suspense fallback={null}>
          <EditorModal />
        </Suspense>
      )}
      {/* Eager: the walkthrough removes itself the instant this opens, so a
          fallback here would blank the screen rather than hide behind it. */}
      <NewProjectModal />
      {wantsAddSchedule && (
        <Suspense fallback={null}>
          <AddScheduleModal />
        </Suspense>
      )}
      {wantsImportConfirm && (
        <Suspense fallback={null}>
          <ImportConfirmModal onConfirm={handleConfirmAction} />
        </Suspense>
      )}
      {wantsSettings && (
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      )}
      {wantsExport && (
        <Suspense fallback={null}>
          <ExportModal />
        </Suspense>
      )}
      {wantsKeyboardHelp && (
        <Suspense fallback={null}>
          <KeyboardHelpModal />
        </Suspense>
      )}
      {wantsAbout && (
        <Suspense fallback={null}>
          <AboutModal />
        </Suspense>
      )}
      {/* Eager: these four answer a gesture or a state the app is already in —
          a right-click, a toast, a confirm, a narrow window — and none of them
          can afford to arrive a round trip late. */}
      <ContextMenu />
      <Toast />
      <ConfirmDialog />
      <MobileNotice />

      {/* Drop zone overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[var(--color-accent)]/5 border border-dashed border-[var(--color-accent)] pointer-events-none">
          <div className="bg-[var(--color-raised)] px-6 py-4 rounded-[var(--radius-md)]">
            <p className="text-body font-normal text-[var(--color-accent)]">
              Drop .floid file to import
            </p>
          </div>
        </div>
      )}
      <Analytics />
    </div>
  );
}

export { App };
