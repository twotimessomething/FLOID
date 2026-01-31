import { useCallback, useRef, useEffect } from 'react';
import type { Team, TeamPhase, TeamElement } from '../../types';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';
import { EditableText } from '../common';
import DragHandle from './DragHandle';

interface TeamElementRowProps {
  readonly element: TeamElement;
  readonly teamPhase: TeamPhase;
  readonly team: Team;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function TeamElementRow({
  element,
  teamPhase,
  team,
  isLabel,
  timelineWidth,
}: TeamElementRowProps): JSX.Element {
  const { updateTeamElementPosition, updateTeamElement } = useTeamStore();
  const { selection, setSelection, setDragging } = useUIStore();

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelection({ type: 'teamElement', id: element.id });
      }
    },
    [setSelection, element.id]
  );

  const isSelected =
    selection.type === 'teamElement' && selection.id === element.id;

  // Convert element's relative position (within teamPhase) to absolute position
  const phaseWidth = teamPhase.relativeEnd - teamPhase.relativeStart;
  const absoluteStart =
    teamPhase.relativeStart + element.relativeStart * phaseWidth;
  const absoluteEnd = teamPhase.relativeStart + element.relativeEnd * phaseWidth;

  const { left, width } = getBarDimensions(
    absoluteStart,
    absoluteEnd,
    timelineWidth
  );

  const handleClick = (): void => {
    setSelection({ type: 'teamElement', id: element.id });
  };

  const handleDragStart = (edge: 'start' | 'end'): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    const phasePixelWidth = phaseWidth * timelineWidth;
    const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;

    if (edge === 'start') {
      const newStart = Math.max(
        0,
        Math.min(element.relativeEnd - 0.02, element.relativeStart + deltaRelative)
      );
      updateTeamElementPosition(
        team.id,
        teamPhase.id,
        element.id,
        newStart,
        element.relativeEnd
      );
    } else {
      const newEnd = Math.max(
        element.relativeStart + 0.02,
        Math.min(1, element.relativeEnd + deltaRelative)
      );
      updateTeamElementPosition(
        team.id,
        teamPhase.id,
        element.id,
        element.relativeStart,
        newEnd
      );
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

      const phasePixelWidth = phaseWidth * timelineWidth;
      const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;
      const barWidth = element.relativeEnd - element.relativeStart;

      let newStart = element.relativeStart + deltaRelative;
      let newEnd = element.relativeEnd + deltaRelative;

      // Clamp to bounds (0-1 within phase)
      if (newStart < 0) {
        newStart = 0;
        newEnd = barWidth;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - barWidth;
      }

      updateTeamElementPosition(team.id, teamPhase.id, element.id, newStart, newEnd);
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
  }, [team.id, teamPhase.id, element.id, element.relativeStart, element.relativeEnd, phaseWidth, timelineWidth, updateTeamElementPosition, setDragging]);

  const handleNameSave = useCallback(
    (newName: string) => {
      updateTeamElement(team.id, teamPhase.id, element.id, { name: newName });
    },
    [updateTeamElement, team.id, teamPhase.id, element.id]
  );

  if (isLabel) {
    return (
      <div
        className={`flex items-center pl-12 pr-3 border-b border-gray-50 cursor-pointer row-selectable focus-ring ${
          isSelected ? 'selected bg-blue-50' : ''
        }`}
        style={{ height: ELEMENT_ROW_HEIGHT }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="listitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`${element.name} element${isSelected ? ', selected' : ''}`}
      >
        <span className="text-sm text-gray-600 truncate">{element.name}</span>
      </div>
    );
  }

  // Lighter version of team color for element (80% opacity)
  const elementColor = team.color + 'CC';

  return (
    <div
      className="relative border-b border-gray-50"
      style={{ height: ELEMENT_ROW_HEIGHT }}
      role="listitem"
    >
      <div
        className={`absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing timeline-bar group ${
          isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
        }`}
        style={{
          left,
          width,
          backgroundColor: elementColor,
        }}
        onClick={handleClick}
        onMouseDown={handleMoveStart}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${element.name} element bar`}
        aria-selected={isSelected}
      >
        {/* Left drag handle */}
        <DragHandle
          edge="start"
          onDragStart={() => handleDragStart('start')}
          onDrag={(deltaX) => handleDrag('start', deltaX)}
          onDragEnd={handleDragEnd}
          label={`Resize ${element.name} start`}
        />

        {/* Right drag handle */}
        <DragHandle
          edge="end"
          onDragStart={() => handleDragStart('end')}
          onDrag={(deltaX) => handleDrag('end', deltaX)}
          onDragEnd={handleDragEnd}
          label={`Resize ${element.name} end`}
        />

        {/* Element name on bar */}
        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
          <EditableText
            value={element.name}
            onSave={handleNameSave}
            className="text-xs text-white/90 truncate drop-shadow-sm"
            inputClassName="text-gray-800"
          />
        </div>
      </div>
    </div>
  );
}
