import { useCallback, useRef, useEffect, useState } from 'react';
import type { Team, TeamPhase } from '../../types';
import { useTeamStore } from '../../stores/teamStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';
import TeamElementRow from './TeamElementRow';
import TeamMilestoneMarker from './TeamMilestoneMarker';
import DragHandle from './DragHandle';
import { AddItemButton } from '../controls';

interface TeamPhaseRowProps {
  readonly teamPhase: TeamPhase;
  readonly team: Team;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly totalDays: number;
}

export default function TeamPhaseRow({
  teamPhase,
  team,
  isLabel,
  timelineWidth,
  totalDays,
}: TeamPhaseRowProps): JSX.Element {
  const { toggleTeamPhaseCollapse, updateTeamPhasePosition, addTeamElement } = useTeamStore();
  const { project } = useProjectStore();
  const { selection, setSelection, setDragging } = useUIStore();

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);
  const hasDragged = useRef(false);
  const elementContainerRef = useRef<HTMLDivElement>(null);

  // Drag date bubble state
  const [startDragDate, setStartDragDate] = useState<string | undefined>(undefined);
  const [endDragDate, setEndDragDate] = useState<string | undefined>(undefined);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSelection({ type: 'teamPhase', id: teamPhase.id }, { x: rect.right, y: rect.top });
      }
    },
    [setSelection, teamPhase.id]
  );

  const isSelected = selection.type === 'teamPhase' && selection.id === teamPhase.id;
  const { left, width } = getBarDimensions(
    teamPhase.relativeStart,
    teamPhase.relativeEnd,
    timelineWidth
  );

  const handleClick = (e: React.MouseEvent): void => {
    // Don't trigger selection if we just finished dragging
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    setSelection({ type: 'teamPhase', id: teamPhase.id }, { x: e.clientX, y: e.clientY });
  };

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleTeamPhaseCollapse(team.id, teamPhase.id);
  };

  const handleAddElement = (): void => {
    addTeamElement(team.id, teamPhase.id, {
      name: 'New Element',
      description: '',
      relativeStart: 0,
      relativeEnd: 0.3,
      order: teamPhase.elements.length,
    });
  };

  // Double-click on element container creates a new element within this team phase
  const handleElementContainerDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      // Prevent event from bubbling to parent container
      e.stopPropagation();

      const rect = elementContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clickX = e.clientX - rect.left;
      const absoluteRelative = getRelativeFromPosition(clickX, timelineWidth);

      // Convert absolute position to relative position within the phase
      const phaseWidth = teamPhase.relativeEnd - teamPhase.relativeStart;
      if (phaseWidth <= 0) return;

      const relativeWithinPhase = (absoluteRelative - teamPhase.relativeStart) / phaseWidth;

      // Create an element with 30-day default width
      const thirtyDaysRelative = totalDays > 0 ? 30 / totalDays : 0.1;
      // Convert to relative within phase
      const elementWidthInPhase = phaseWidth > 0 ? thirtyDaysRelative / phaseWidth : 0.2;
      const halfWidth = elementWidthInPhase / 2;

      const relativeStart = Math.max(0, relativeWithinPhase - halfWidth);
      const relativeEnd = Math.min(1, relativeWithinPhase + halfWidth);

      addTeamElement(team.id, teamPhase.id, {
        name: 'New Element',
        description: '',
        relativeStart,
        relativeEnd,
        order: teamPhase.elements.length,
      });

      // Get the new element and select it
      const updatedTeams = useTeamStore.getState().teams;
      const updatedTeam = updatedTeams.find((t) => t.id === team.id);
      const updatedPhase = updatedTeam?.phases.find((p) => p.id === teamPhase.id);
      const newElement = updatedPhase?.elements[updatedPhase.elements.length - 1];

      if (newElement) {
        setSelection({ type: 'teamElement', id: newElement.id }, { x: e.clientX, y: e.clientY });
      }
    },
    [team.id, teamPhase.id, teamPhase.relativeStart, teamPhase.relativeEnd, teamPhase.elements.length, timelineWidth, totalDays, addTeamElement, setSelection]
  );

  // Prevent double-click from propagating on the phase bar
  const handleBarDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const handleDragStart = (edge: 'start' | 'end'): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
    // Initialize the drag date
    const position = edge === 'start' ? teamPhase.relativeStart : teamPhase.relativeEnd;
    const date = getDateFromRelativePosition(project.startDate, project.endDate, position);
    const dateStr = formatDate(date, 'MMM d');
    if (edge === 'start') {
      setStartDragDate(dateStr);
    } else {
      setEndDragDate(dateStr);
    }
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    const deltaRelative = deltaX / timelineWidth;
    if (edge === 'start') {
      const newStart = Math.max(0, Math.min(teamPhase.relativeEnd - 0.01, teamPhase.relativeStart + deltaRelative));
      updateTeamPhasePosition(team.id, teamPhase.id, newStart, teamPhase.relativeEnd);
      // Update drag date
      const date = getDateFromRelativePosition(project.startDate, project.endDate, newStart);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      const newEnd = Math.max(teamPhase.relativeStart + 0.01, Math.min(1, teamPhase.relativeEnd + deltaRelative));
      updateTeamPhasePosition(team.id, teamPhase.id, teamPhase.relativeStart, newEnd);
      // Update drag date
      const date = getDateFromRelativePosition(project.startDate, project.endDate, newEnd);
      setEndDragDate(formatDate(date, 'MMM d'));
    }
  };

  const handleDragEnd = (edge: 'start' | 'end'): void => {
    setDragging(false);
    // Mark that a drag occurred to prevent click from triggering
    hasDragged.current = true;
    // Clear the drag date
    if (edge === 'start') {
      setStartDragDate(undefined);
    } else {
      setEndDragDate(undefined);
    }
  };

  // Move handlers for dragging the entire bar
  const handleMoveStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isMoving.current = true;
      moveLastX.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');
    },
    [setDragging]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMoving.current) return;
      const deltaX = e.clientX - moveLastX.current;
      moveLastX.current = e.clientX;

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      const deltaRelative = deltaX / timelineWidth;
      const barWidth = teamPhase.relativeEnd - teamPhase.relativeStart;

      let newStart = teamPhase.relativeStart + deltaRelative;
      let newEnd = teamPhase.relativeEnd + deltaRelative;

      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = barWidth;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - barWidth;
      }

      updateTeamPhasePosition(team.id, teamPhase.id, newStart, newEnd);
    };

    const handleMouseUp = () => {
      if (!isMoving.current) return;
      isMoving.current = false;
      setDragging(false);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [team.id, teamPhase.id, teamPhase.relativeStart, teamPhase.relativeEnd, timelineWidth, updateTeamPhasePosition, setDragging]);

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label={`${teamPhase.name} phase`}>
        {/* Team Phase label */}
        <div
          className={`flex items-center gap-2 pl-6 pr-3 border-b border-[#e5e7eb]/50 cursor-pointer row-selectable focus-ring ${
            isSelected ? 'selected bg-blue-50' : ''
          }`}
          style={{ height: ROW_HEIGHT }}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${teamPhase.name} phase${isSelected ? ', selected' : ''}`}
        >
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] focus-ring rounded-md transition-colors duration-150"
            aria-expanded={!teamPhase.isCollapsed}
            aria-label={`${teamPhase.isCollapsed ? 'Expand' : 'Collapse'} ${teamPhase.name}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${
                teamPhase.isCollapsed ? '' : 'expanded'
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
          <span className="text-sm text-[#111827] truncate flex-1">
            {teamPhase.name}
          </span>
          <AddItemButton onClick={handleAddElement} label="Add element" />
        </div>

        {/* Element labels */}
        {!teamPhase.isCollapsed && (
          <div role="list" aria-label={`${teamPhase.name} elements`}>
            {teamPhase.elements.map((element) => (
              <TeamElementRow
                key={element.id}
                element={element}
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
    <div role="group" aria-label={`${teamPhase.name} timeline`}>
      {/* Team Phase bar row - no double-click handler here, let it bubble up */}
      <div
        className="relative border-b border-[#e5e7eb]/50"
        style={{ height: ROW_HEIGHT }}
      >
        <div
          className={`absolute top-2 bottom-2 rounded-[10px] cursor-grab active:cursor-grabbing timeline-bar group ${
            isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
          }`}
          style={{
            left,
            width,
            backgroundColor: team.color,
          }}
          onClick={handleClick}
          onDoubleClick={handleBarDoubleClick}
          onMouseDown={handleMoveStart}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-label={`${teamPhase.name} phase bar`}
          aria-selected={isSelected}
        >
          {/* Left drag handle */}
          <DragHandle
            edge="start"
            onDragStart={() => handleDragStart('start')}
            onDrag={(deltaX) => handleDrag('start', deltaX)}
            onDragEnd={() => handleDragEnd('start')}
            label={`Resize ${teamPhase.name} start`}
            dragDate={startDragDate}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={() => handleDragStart('end')}
            onDrag={(deltaX) => handleDrag('end', deltaX)}
            onDragEnd={() => handleDragEnd('end')}
            label={`Resize ${teamPhase.name} end`}
            dragDate={endDragDate}
          />

          {/* Phase name on bar */}
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
            <span className="text-xs font-medium text-white truncate drop-shadow-sm">
              {teamPhase.name}
            </span>
          </div>
        </div>

        {/* Milestones */}
        {teamPhase.milestones.map((milestone) => (
          <TeamMilestoneMarker
            key={milestone.id}
            milestone={milestone}
            teamPhase={teamPhase}
            team={team}
            timelineWidth={timelineWidth}
          />
        ))}
      </div>

      {/* Element bars - double-click creates elements */}
      {!teamPhase.isCollapsed && (
        <div
          ref={elementContainerRef}
          role="list"
          aria-label={`${teamPhase.name} element bars`}
          onDoubleClick={handleElementContainerDoubleClick}
          style={{ minHeight: teamPhase.elements.length === 0 ? 28 : undefined }}
        >
          {teamPhase.elements.map((element) => (
            <TeamElementRow
              key={element.id}
              element={element}
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
