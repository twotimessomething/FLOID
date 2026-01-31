import { useUIStore } from '../../stores/uiStore';
import {
  PhaseEditor,
  ElementEditor,
  MilestoneEditor,
  TeamEditor,
  TeamPhaseEditor,
  TeamElementEditor,
} from '../panels';

const SIDEBAR_WIDTH = 280;

export function EditorSidebar(): JSX.Element | null {
  const { isSidebarOpen, selection, closeSidebar } = useUIStore();

  if (!isSidebarOpen || !selection.type || !selection.id) {
    return null;
  }

  // Store id in local const after null check for type narrowing
  const selectedId = selection.id;

  const renderEditor = (): JSX.Element | null => {
    switch (selection.type) {
      case 'phase':
        return <PhaseEditor phaseId={selectedId} />;
      case 'element':
        return <ElementEditor elementId={selectedId} />;
      case 'milestone':
        return <MilestoneEditor milestoneId={selectedId} />;
      case 'team':
        return <TeamEditor teamId={selectedId} />;
      case 'teamPhase':
        return <TeamPhaseEditor teamPhaseId={selectedId} />;
      case 'teamElement':
        return <TeamElementEditor teamElementId={selectedId} />;
      default:
        return null;
    }
  };

  return (
    <aside
      className="flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto sidebar-enter"
      style={{ width: SIDEBAR_WIDTH }}
      role="complementary"
      aria-label="Edit panel"
      aria-live="polite"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900" id="sidebar-title">
          Edit
        </h2>
        <button
          onClick={closeSidebar}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded hover:bg-gray-100 focus-ring btn-press"
          aria-label="Close sidebar (Escape)"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="p-4" aria-labelledby="sidebar-title">
        {renderEditor()}
      </div>
    </aside>
  );
}
