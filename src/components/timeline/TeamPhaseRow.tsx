import { useCallback, useRef, useEffect } from 'react';
import type { Team, TeamPhase } from '../../types';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ROW_HEIGHT } from '../../utils/timelineUtils';
import { EditableText } from '../common';
import TeamElementRow from './TeamElementRow';
import DragHandle from './DragHandle';
import { AddItemButton } from '../controls';

interface TeamPhaseRowProps {
  readonly teamPhase: TeamPhase;
  readonly team: Team;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function TeamPhaseRow({
  teamPhase,
  team,
  isLabel,
  timelineWidth,
}: TeamPhaseRowProps): JSX.Element {
  const { toggleTeamPhaseCollapse, updateTeamPhasePosition, addTeamElement, updateTeamPhase } = useTeamStore();
  const { selection, setSelection, setDragging } = useUIStore();

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelection({ type: 'teamPhase', id: teamPhase.id });
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

  const handleClick = (): void => {
    setSelection({ type: 'teamPhase', id: teamPhase.id });
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

  const handleDragStart = (edge: 'start' | 'end'): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    const deltaRelative = deltaX / timelineWidth;
    if (edge === 'start') {
      const newStart = Math.max(0, Math.min(teamPhase.relativeEnd - 0.01, teamPhase.relativeStart + deltaRelative));
      updateTeamPhasePosition(team.id, teamPhase.id, newStart, teamPhase.relativeEnd);
    } else {
      const newEnd = Math.max(teamPhase.relativeStart + 0.01, Math.min(1, teamPhase.relativeEnd + deltaRelative));
      updateTeamPhasePosition(team.id, teamPhase.id, teamPhase.relativeStart, newEnd);
    }
  };

  const handleDragEnd = (): void => {
    setDragging(false);
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

  const handleNameSave = useCallback(
    (newName: string) => {
      updateTeamPhase(team.id, teamPhase.id, { name: newName });
    },
    [updateTeamPhase, team.id, teamPhase.id]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label={`${teamPhase.name} phase`}>
        {/* Team Phase label */}
        <div
          className={`flex items-center gap-2 pl-6 pr-3 border-b border-gray-100 cursor-pointer row-selectable focus-ring ${
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
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 focus-ring rounded"
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
          <span className="text-sm text-gray-700 truncate flex-1">
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
      {/* Team Phase bar */}
      <div
        className="relative border-b border-gray-100"
        style={{ height: ROW_HEIGHT }}
      >
        <div
          className={`absolute top-2 bottom-2 rounded-md cursor-grab active:cursor-grabbing timeline-bar group ${
            isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
          }`}
          style={{
            left,
            width,
            backgroundColor: team.color,
          }}
          onClick={handleClick}
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
            onDragEnd={handleDragEnd}
            label={`Resize ${teamPhase.name} start`}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={() => handleDragStart('end')}
            onDrag={(deltaX) => handleDrag('end', deltaX)}
            onDragEnd={handleDragEnd}
            label={`Resize ${teamPhase.name} end`}
          />

          {/* Phase name on bar */}
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
            <EditableText
              value={teamPhase.name}
              onSave={handleNameSave}
              className="text-xs font-medium text-white truncate drop-shadow-sm"
              inputClassName="text-gray-800"
            />
          </div>
        </div>
      </div>

      {/* Element bars */}
      {!teamPhase.isCollapsed && (
        <div role="list" aria-label={`${teamPhase.name} element bars`}>
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
