import { useEffect } from 'react';
import Header from './components/layout/Header';
import TimelineContainer from './components/layout/TimelineContainer';
import { EditorModal } from './components/layout/EditorModal';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { ProjectSetupModal } from './components/layout/ProjectSetupModal';
import { ProjectEditModal } from './components/layout/ProjectEditModal';
import { useAutoSave, useKeyboardShortcuts } from './hooks';
import { useSectionStore } from './stores/sectionStore';
import { useProjectStore } from './stores/projectStore';

function App() {
  const { initializeFromProject, loadSectionsForProject } = useSectionStore();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

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

  return (
    <div className="h-full flex flex-col bg-[#fafafa]">
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
      </main>
      <EditorModal />
      <ProjectSetupModal />
      <ProjectEditModal />
    </div>
  );
}

export default App;
