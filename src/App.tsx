import { useEffect } from 'react';
import Header from './components/layout/Header';
import TimelineContainer from './components/layout/TimelineContainer';
import { EditorModal } from './components/layout/EditorModal';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { ProjectSetupModal } from './components/layout/ProjectSetupModal';
import { useAutoSave, useKeyboardShortcuts } from './hooks';
import { useTimelineStore } from './stores/timelineStore';
import { useTeamStore } from './stores/teamStore';
import { useProjectStore } from './stores/projectStore';

function App() {
  const { initializeFromProject } = useTimelineStore();
  const { loadTeamsForProject } = useTeamStore();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  // Initialize auto-save functionality
  useAutoSave();

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    initializeFromProject();
  }, [initializeFromProject]);

  // Load teams when project is initialized
  useEffect(() => {
    if (activeProjectId) {
      loadTeamsForProject(activeProjectId);
    }
  }, [activeProjectId, loadTeamsForProject]);

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
    </div>
  );
}

export default App;
