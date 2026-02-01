import { useEffect, useCallback } from 'react';
import Header from './components/layout/Header';
import TimelineContainer from './components/layout/TimelineContainer';
import { EditorModal } from './components/layout/EditorModal';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { InfoSidebar } from './components/layout/InfoSidebar';
import { ProjectSetupModal } from './components/layout/ProjectSetupModal';
import { ProjectEditModal } from './components/layout/ProjectEditModal';
import { AddTeamModal } from './components/layout/AddTeamModal';
import { ContextMenu } from './components/timeline';
import { useAutoSave, useKeyboardShortcuts } from './hooks';
import { useSectionStore } from './stores/sectionStore';
import { useProjectStore } from './stores/projectStore';
import { useUIStore } from './stores/uiStore';

function App() {
  const { initializeFromProject, loadSectionsForProject } = useSectionStore();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);

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

  return (
    <div className="h-full flex flex-col bg-[#fafafa]" onContextMenu={handleContextMenu}>
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
      <ProjectSetupModal />
      <ProjectEditModal />
      <AddTeamModal />
      <ContextMenu />
    </div>
  );
}

export default App;
