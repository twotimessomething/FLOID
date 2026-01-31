import { useEffect } from 'react';
import Header from './components/layout/Header';
import TimelineContainer from './components/layout/TimelineContainer';
import { EditorSidebar } from './components/layout/EditorSidebar';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { useAutoSave, useKeyboardShortcuts } from './hooks';
import { useTimelineStore } from './stores/timelineStore';

function App() {
  const { initializeFromTemplate } = useTimelineStore();

  // Initialize auto-save functionality
  useAutoSave();

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    initializeFromTemplate();
  }, [initializeFromTemplate]);

  return (
    <div className="h-full flex flex-col bg-gray-100">
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
        <EditorSidebar />
      </main>
    </div>
  );
}

export default App;
