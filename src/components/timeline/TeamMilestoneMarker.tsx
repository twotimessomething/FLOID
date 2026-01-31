import { useRef, useCallback, useEffect } from 'react';
import type { Milestone, Team, TeamPhase } from '../../types';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT } from '../../utils/timelineUtils';

interface TeamMilestoneMarkerProps {
  readonly milestone: Milestone;
  readonly teamPhase: TeamPhase;
  readonly team: Team;
  readonly timelineWidth: number;
}

export default function TeamMilestoneMarker({
  milestone,
  teamPhase,
  team,
  timelineWidth,
}: TeamMilestoneMarkerProps): JSX.Element {
  const { updateTeamMilestone } = useTeamStore();
  const { selection, setSelection, setDragging } = useUIStore();

  const isSelected = selection.type === 'milestone' && selection.id === milestone.id;
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);

  // Calculate absolute position within the phase
  const phaseWidth = (teamPhase.relativeEnd - teamPhase.relativeStart) * timelineWidth;
  const phaseLeft = teamPhase.relativeStart * timelineWidth;
  const milestoneLeft = phaseLeft + milestone.relativePosition * phaseWidth;

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setSelection({ type: 'milestone', id: milestone.id }, { x: e.clientX, y: e.clientY });
  };

  // Prevent double-click from propagating to parent
  const handleDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');
    },
    [setDragging]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      // Convert pixel delta to relative position within phase
      const deltaRelative = deltaX / phaseWidth;
      const newPosition = Math.max(0, Math.min(1, milestone.relativePosition + deltaRelative));

      updateTeamMilestone(team.id, teamPhase.id, milestone.id, { relativePosition: newPosition });
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setDragging(false);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [milestone.relativePosition, team.id, teamPhase.id, milestone.id, phaseWidth, updateTeamMilestone, setDragging]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSelection({ type: 'milestone', id: milestone.id }, { x: rect.right, y: rect.top });
      }
    },
    [setSelection, milestone.id]
  );

  return (
    <div
      className="absolute z-30 cursor-pointer group focus-ring"
      style={{
        left: milestoneLeft,
        top: 0,
        height: ROW_HEIGHT,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${milestone.name} milestone at ${Math.round(milestone.relativePosition * 100)}% of ${teamPhase.name}`}
      aria-selected={isSelected}
    >
      {/* Diamond marker */}
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }`}
        aria-hidden="true"
      >
        <div
          className={`w-3 h-3 rotate-45 ${
            isSelected
              ? 'bg-blue-600 ring-2 ring-blue-300'
              : 'bg-[#111827] group-hover:bg-[#1f2937]'
          }`}
        />
      </div>

      {/* Vertical line extending down */}
      <div
        className={`absolute top-1/2 left-0 -translate-x-1/2 w-0.5 h-3 ${
          isSelected ? 'bg-blue-600' : 'bg-[#111827] group-hover:bg-[#1f2937]'
        }`}
        aria-hidden="true"
      />

      {/* Tooltip on hover */}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#111827] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        role="tooltip"
      >
        {milestone.name}
      </div>
    </div>
  );
}
