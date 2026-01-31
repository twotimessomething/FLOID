import { useProjectStore } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';

export function LeftSidebar() {
  const { project } = useProjectStore();
  const { phases } = useTimelineStore();
  const { teams } = useTeamStore();
  const { isLeftSidebarOpen, toggleLeftSidebar } = useUIStore();

  if (!isLeftSidebarOpen) {
    return (
      <button
        onClick={toggleLeftSidebar}
        className="flex-shrink-0 w-10 h-full border-r border-gray-200 bg-gray-50 flex items-start justify-center pt-4 hover:bg-gray-100 transition-colors"
        aria-label="Open sidebar"
      >
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="flex-shrink-0 w-56 border-r border-gray-200 bg-gray-50 flex flex-col">
      {/* Collapse button */}
      <div className="flex justify-end p-2 border-b border-gray-200">
        <button
          onClick={toggleLeftSidebar}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
          aria-label="Collapse sidebar"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Teams section */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Teams
          </h3>
          <div className="space-y-2">
            {/* Industrial Design (default) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: '#5B9BD5' }}
                />
                <span className="text-sm text-gray-700">Industrial Design</span>
              </div>
              <span className="text-xs text-gray-400">{phases.length}</span>
            </div>
            {/* Other teams */}
            {teams.map((team) => (
              <div key={team.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="text-sm text-gray-700">{team.name}</span>
                </div>
                <span className="text-xs text-gray-400">{team.phases.length}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project info at bottom */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Project Info
          </h3>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Start Date</span>
            <span className="text-gray-700">
              {new Date(project.startDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">End Date</span>
            <span className="text-gray-700">
              {new Date(project.endDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Teams</span>
            <span className="text-gray-700">{teams.length + 1}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Phases</span>
            <span className="text-gray-700">{phases.length}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
