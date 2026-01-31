import { useCallback, useRef } from 'react';
import type { Team } from '../../types';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, getBarDimensions, getRelativeFromPosition } from '../../utils/timelineUtils';
import TeamPhaseRow from './TeamPhaseRow';
import { AddItemButton } from '../controls';

interface DragHandleProps {
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly style: React.CSSProperties;
}

interface TeamSectionProps {
  readonly team: Team;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly totalDays: number;
  readonly teamIndex?: number;
  readonly dragHandleProps?: DragHandleProps;
  readonly isDragging?: boolean;
}

export default function TeamSection({
  team,
  isLabel,
  timelineWidth,
  totalDays,
  teamIndex,
  dragHandleProps,
  isDragging,
}: TeamSectionProps): JSX.Element {
  const { toggleTeamCollapse, addTeamPhase, addTeamMilestone } = useTeamStore();
  const { selection, setSelection } = useUIStore();
  const headerRowRef = useRef<HTMLDivElement>(null);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSelection({ type: 'team', id: team.id }, { x: rect.right, y: rect.top });
      }
    },
    [setSelection, team.id]
  );

  const isSelected = selection.type === 'team' && selection.id === team.id;

  // Handle click on collapsed team phase bar
  const handleCollapsedPhaseClick = useCallback(
    (phaseId: string) => (e: React.MouseEvent): void => {
      e.stopPropagation();
      setSelection({ type: 'teamPhase', id: phaseId }, { x: e.clientX, y: e.clientY });
    },
    [setSelection]
  );

  // Handle keyboard on collapsed team phase bar
  const handleCollapsedPhaseKeyDown = useCallback(
    (phaseId: string) => (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSelection({ type: 'teamPhase', id: phaseId }, { x: rect.right, y: rect.top });
      }
    },
    [setSelection]
  );

  // Prevent double-click from propagating on collapsed phase bars
  const handleCollapsedPhaseDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const handleClick = (e: React.MouseEvent): void => {
    setSelection({ type: 'team', id: team.id }, { x: e.clientX, y: e.clientY });
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

  // Double-click on team header row creates a milestone
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (team.phases.length === 0) return;

      const rect = headerRowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clickX = e.clientX - rect.left;
      const relativePosition = getRelativeFromPosition(clickX, timelineWidth);

      // Find the team phase at this position, or use the closest one
      let targetPhase = team.phases.find(
        (p) => relativePosition >= p.relativeStart && relativePosition <= p.relativeEnd
      );

      // If no phase contains this position, find the closest phase
      if (!targetPhase) {
        targetPhase = team.phases.reduce((closest, phase) => {
          const phaseCenter = (phase.relativeStart + phase.relativeEnd) / 2;
          const closestCenter = (closest.relativeStart + closest.relativeEnd) / 2;
          return Math.abs(relativePosition - phaseCenter) < Math.abs(relativePosition - closestCenter)
            ? phase
            : closest;
        });
      }

      // Calculate relative position within the phase
      const phaseWidth = targetPhase.relativeEnd - targetPhase.relativeStart;
      const milestoneRelativePosition = phaseWidth > 0
        ? (relativePosition - targetPhase.relativeStart) / phaseWidth
        : 0.5;

      addTeamMilestone(team.id, targetPhase.id, {
        name: 'New Milestone',
        description: '',
        relativePosition: Math.max(0, Math.min(1, milestoneRelativePosition)),
        order: targetPhase.milestones.length,
      });

      // Get the new milestone
      const updatedTeams = useTeamStore.getState().teams;
      const updatedTeam = updatedTeams.find((t) => t.id === team.id);
      const updatedPhase = updatedTeam?.phases.find((p) => p.id === targetPhase!.id);
      const newMilestone = updatedPhase?.milestones[updatedPhase.milestones.length - 1];

      if (newMilestone) {
        setSelection({ type: 'milestone', id: newMilestone.id }, { x: e.clientX, y: e.clientY });
      }
    },
    [team.id, team.phases, timelineWidth, addTeamMilestone, setSelection]
  );


  // Double-click on team phases container creates a new team phase
  const handleCreateTeamPhase = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const relativePosition = getRelativeFromPosition(clickX, timelineWidth);

      // Create a phase centered at the click position with 30-day width
      const thirtyDaysRelative = totalDays > 0 ? 30 / totalDays : 0.15;
      const halfWidth = thirtyDaysRelative / 2;
      const relativeStart = Math.max(0, relativePosition - halfWidth);
      const relativeEnd = Math.min(1, relativePosition + halfWidth);

      addTeamPhase(team.id, {
        name: 'New Phase',
        description: '',
        relativeStart,
        relativeEnd,
        order: team.phases.length,
        isCollapsed: false,
        elements: [],
        milestones: [],
      });

      // Get the new phase and select it
      const updatedTeams = useTeamStore.getState().teams;
      const updatedTeam = updatedTeams.find((t) => t.id === team.id);
      const newPhase = updatedTeam?.phases[updatedTeam.phases.length - 1];

      if (newPhase) {
        setSelection({ type: 'teamPhase', id: newPhase.id }, { x: e.clientX, y: e.clientY });
      }
    },
    [team.id, team.phases.length, timelineWidth, totalDays, addTeamPhase, setSelection]
  );


  if (isLabel) {
    // Render label column content
    return (
      <div
        className={`border-t-2 border-[#e5e7eb] ${isDragging ? 'opacity-50' : ''}`}
        role="group"
        aria-label={`${team.name} team`}
      >
        {/* Team header label */}
        <div
          className={`flex items-center gap-2 px-3 border-b border-[#e5e7eb]/50 cursor-pointer row-selectable focus-ring ${
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
          {/* Drag handle for reordering */}
          {dragHandleProps && teamIndex !== undefined && (
            <div
              {...dragHandleProps}
              className="flex items-center justify-center w-4 h-4 text-[#9ca3af] hover:text-[#6b7280] rounded transition-colors duration-150"
              title="Drag to reorder"
              aria-label={`Drag to reorder ${team.name}`}
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 10 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="2" cy="2" r="1.5" />
                <circle cx="8" cy="2" r="1.5" />
                <circle cx="2" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="2" cy="14" r="1.5" />
                <circle cx="8" cy="14" r="1.5" />
              </svg>
            </div>
          )}
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] focus-ring rounded-md transition-colors duration-150"
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
          <span className="text-sm font-medium text-[#111827] truncate flex-1">
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
                totalDays={totalDays}
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
      className={`border-t-2 border-[#e5e7eb] ${isDragging ? 'opacity-50' : ''}`}
      role="group"
      aria-label={`${team.name} team timeline`}
    >
      {/* Team header row with individual phase bars when collapsed */}
      <div
        ref={headerRowRef}
        className="relative border-b border-[#e5e7eb]/50"
        style={{ height: ROW_HEIGHT }}
        onDoubleClick={handleHeaderDoubleClick}
      >
        {team.isCollapsed && (
          <>
            {team.phases.map((phase) => {
              const { left, width } = getBarDimensions(
                phase.relativeStart,
                phase.relativeEnd,
                timelineWidth
              );
              const isPhaseSelected = selection.type === 'teamPhase' && selection.id === phase.id;

              return (
                <div
                  key={phase.id}
                  className={`absolute top-1 bottom-1 rounded-[10px] cursor-pointer timeline-bar ${
                    isPhaseSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                  style={{
                    left,
                    width,
                    backgroundColor: team.color,
                  }}
                  onClick={handleCollapsedPhaseClick(phase.id)}
                  onDoubleClick={handleCollapsedPhaseDoubleClick}
                  onKeyDown={handleCollapsedPhaseKeyDown(phase.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${phase.name} phase bar (collapsed view)`}
                  aria-selected={isPhaseSelected}
                >
                  <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
                    <span className="text-xs font-medium text-white truncate drop-shadow-sm">
                      {phase.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Team phase bars */}
      {!team.isCollapsed && (
        <div
          role="list"
          aria-label={`${team.name} phase bars`}
          onDoubleClick={handleCreateTeamPhase}
        >
          {team.phases.map((teamPhase) => (
            <TeamPhaseRow
              key={teamPhase.id}
              teamPhase={teamPhase}
              team={team}
              isLabel={false}
              timelineWidth={timelineWidth}
              totalDays={totalDays}
            />
          ))}
        </div>
      )}
    </div>
  );
}
