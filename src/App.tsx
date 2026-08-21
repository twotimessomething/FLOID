import { useEffect, useCallback, type DragEvent } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Header } from './components/layout/Header';
import { TimelineContainer } from './components/layout/TimelineContainer';
import { EditorModal } from './components/layout/EditorModal';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { InfoSidebar } from './components/layout/InfoSidebar';
import { NewProjectModal } from './components/layout/NewProjectModal';
import { ProjectEditModal } from './components/layout/ProjectEditModal';
import { AddScheduleModal } from './components/layout/AddScheduleModal';
import { ImportConfirmModal } from './components/layout/ImportConfirmModal';
import { SettingsModal } from './components/layout/SettingsModal';
import { ExportModal } from './components/layout/ExportModal';
import { KeyboardHelpModal } from './components/layout/KeyboardHelpModal';
import { ContextMenu } from './components/timeline';
import { Toast, ConfirmDialog, MobileNotice } from './components/common';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useAutoSave, useKeyboardShortcuts, useScheduleImport, useTheme } from './hooks';
import { useBackupReminder } from './hooks/useBackupReminder';
import { useFileSystemAutoSave } from './hooks/useFileSystemAutoSave';
import { useSectionStore } from './stores/sectionStore';
import { useProjectStore } from './stores/projectStore';
import { useUIStore } from './stores/uiStore';
import { parseProjectJson, convertImportedProject } from './utils/exportUtils';

function App(): JSX.Element {
  const { initializeFromProject, loadSectionsForProject } = useSectionStore();
  const sections = useSectionStore((state) => state.sections);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);
  const saveCurrentProject = useProjectStore((state) => state.saveCurrentProject);
  const importProject = useProjectStore((state) => state.importProject);
  const selectProject = useProjectStore((state) => state.selectProject);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);
  const isDraggingFile = useUIStore((state) => state.isDraggingFile);
  const setDraggingFile = useUIStore((state) => state.setDraggingFile);
  const showToast = useUIStore((state) => state.showToast);

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
              const { project: importedProject, sections: importedSections } = convertImportedProject(exportData);

              // Save current project before switching (if there is one)
              if (activeProjectId) {
                await saveCurrentProject(sections);
              }

              // Add the imported project to the project list
              const newProjectId = await importProject(importedProject, importedSections);

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
    [setDraggingFile, handleScheduleImport, activeProjectId, sections, saveCurrentProject, importProject, selectProject, loadSectionsForProject, showToast]
  );

  // Show loading state while storage initializes
  if (!isStorageReady) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-[13px] text-[var(--color-text-secondary)]">Loading...</div>
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
      <EditorModal />
      <NewProjectModal />
      <ProjectEditModal />
      <AddScheduleModal />
      <ImportConfirmModal onConfirm={handleConfirmAction} />
      <SettingsModal />
      <ExportModal />
      <KeyboardHelpModal />
      <ContextMenu />
      <Toast />
      <ConfirmDialog />
      <MobileNotice />

      {/* Drop zone overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[var(--color-accent)]/5 border border-dashed border-[var(--color-accent)] pointer-events-none">
          <div className="bg-[var(--color-raised)] px-6 py-4 rounded-[var(--radius-md)]">
            <p className="text-[13px] font-normal text-[var(--color-accent)]">
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
