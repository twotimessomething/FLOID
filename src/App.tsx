import { useEffect, useCallback, type DragEvent } from 'react';
import Header from './components/layout/Header';
import TimelineContainer from './components/layout/TimelineContainer';
import { EditorModal } from './components/layout/EditorModal';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { InfoSidebar } from './components/layout/InfoSidebar';
import { NewProjectModal } from './components/layout/NewProjectModal';
import { ProjectEditModal } from './components/layout/ProjectEditModal';
import { AddScheduleModal } from './components/layout/AddScheduleModal';
import { ImportConfirmModal } from './components/layout/ImportConfirmModal';
import { ContextMenu } from './components/timeline';
import { Toast } from './components/common';
import { useAutoSave, useKeyboardShortcuts, useScheduleImport } from './hooks';
import { useSectionStore } from './stores/sectionStore';
import { useProjectStore } from './stores/projectStore';
import { useUIStore } from './stores/uiStore';

function App() {
  const { initializeFromProject, loadSectionsForProject } = useSectionStore();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);
  const isDraggingFile = useUIStore((state) => state.isDraggingFile);
  const setDraggingFile = useUIStore((state) => state.setDraggingFile);

  const { handleImport: handleScheduleImport, handleConfirmAction } = useScheduleImport();

  // Initialize auto-save functionality
  useAutoSave();

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts();

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
        handleScheduleImport(text);
      }
    },
    [setDraggingFile, handleScheduleImport]
  );

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
      <Header />
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
      <EditorModal />
      <NewProjectModal />
      <ProjectEditModal />
      <AddScheduleModal />
      <ImportConfirmModal onConfirm={handleConfirmAction} />
      <ContextMenu />
      <Toast />

      {/* Drop zone overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-blue-500/10 border-4 border-dashed border-blue-500 pointer-events-none">
          <div className="bg-white px-6 py-4 rounded-xl shadow-lg">
            <p className="text-lg font-medium text-blue-600">
              Drop .floid file to import schedule
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
