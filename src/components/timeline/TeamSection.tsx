import { useCallback } from 'react';
import type { Team } from '../../types';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, getBarDimensions } from '../../utils/timelineUtils';
import TeamPhaseRow from './TeamPhaseRow';
import { AddItemButton } from '../controls';

interface TeamSectionProps {
  readonly team: Team;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function TeamSection({
  team,
  isLabel,
  timelineWidth,
}: TeamSectionProps): JSX.Element {
  const { toggleTeamCollapse, addTeamPhase } = useTeamStore();
  const { selection, setSelection } = useUIStore();

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelection({ type: 'team', id: team.id });
      }
    },
    [setSelection, team.id]
  );

  const isSelected = selection.type === 'team' && selection.id === team.id;

  const handleClick = (): void => {
    setSelection({ type: 'team', id: team.id });
  };

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleTeamCollapse(team.id);
  };

  const handleAddPhase = (): void => {
    addTeamPhase(team.id, {
      name: 'New Phase',
      description: '',
      relativeStart: 0.1,
      relativeEnd: 0.4,
      order: team.phases.length,
      isCollapsed: false,
      elements: [],
      milestones: [],
    });
  };

  // Calculate team summary bar (spans from earliest phase start to latest phase end)
  const teamStart = team.phases.length > 0
    ? Math.min(...team.phases.map((p) => p.relativeStart))
    : 0.1;
  const teamEnd = team.phases.length > 0
    ? Math.max(...team.phases.map((p) => p.relativeEnd))
    : 0.4;

  const { left, width } = getBarDimensions(teamStart, teamEnd, timelineWidth);

  if (isLabel) {
    // Render label column content
    return (
      <div
        className="border-t-2 border-gray-200"
        role="group"
        aria-label={`${team.name} team`}
      >
        {/* Team header label */}
        <div
          className={`flex items-center gap-2 px-3 border-b border-gray-100 cursor-pointer row-selectable focus-ring ${
            isSelected ? 'selected bg-blue-50' : ''
          }`}
          style={{ height: ROW_HEIGHT }}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${team.name} team${isSelected ? ', selected' : ''}`}
        >
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 focus-ring rounded"
            aria-expanded={!team.isCollapsed}
            aria-label={`${team.isCollapsed ? 'Expand' : 'Collapse'} ${team.name}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${
                team.isCollapsed ? '' : 'expanded'
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: team.color }}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-gray-700 truncate flex-1">
            {team.name}
          </span>
          <AddItemButton onClick={handleAddPhase} label="Add phase" />
        </div>

        {/* Team phase labels */}
        {!team.isCollapsed && (
          <div role="list" aria-label={`${team.name} phases`}>
            {team.phases.map((teamPhase) => (
              <TeamPhaseRow
                key={teamPhase.id}
                teamPhase={teamPhase}
                team={team}
                isLabel
                timelineWidth={timelineWidth}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render timeline content
  return (
    <div
      className="border-t-2 border-gray-200"
      role="group"
      aria-label={`${team.name} team timeline`}
    >
      {/* Team summary bar (when collapsed) or header row */}
      <div
        className="relative border-b border-gray-100"
        style={{ height: ROW_HEIGHT }}
      >
        {team.isCollapsed && team.phases.length > 0 && (
          <div
            className={`absolute top-1 bottom-1 rounded cursor-pointer timeline-bar ${
              isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
            }`}
            style={{
              left,
              width,
              backgroundColor: team.color + '60', // 38% opacity for summary
            }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`${team.name} team summary bar (collapsed)`}
            aria-selected={isSelected}
          >
            <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
              <span className="text-xs font-medium text-gray-700 truncate">
                {team.name}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Team phase bars */}
      {!team.isCollapsed && (
        <div role="list" aria-label={`${team.name} phase bars`}>
          {team.phases.map((teamPhase) => (
            <TeamPhaseRow
              key={teamPhase.id}
              teamPhase={teamPhase}
              team={team}
              isLabel={false}
              timelineWidth={timelineWidth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
