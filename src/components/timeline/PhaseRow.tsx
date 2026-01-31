import { useCallback, useRef, useEffect } from 'react';
import type { Phase } from '../../types';
import { useTimelineStore } from '../../stores/timelineStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ROW_HEIGHT } from '../../utils/timelineUtils';
import { EditableText } from '../common';
import ElementRow from './ElementRow';
import DragHandle from './DragHandle';
import MilestoneMarker from './MilestoneMarker';

interface PhaseRowProps {
  readonly phase: Phase;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function PhaseRow({ phase, isLabel, timelineWidth }: PhaseRowProps): JSX.Element {
  const { togglePhaseCollapse, updatePhasePosition, updatePhase } = useTimelineStore();
  const { selection, setSelection, setDragging } = useUIStore();

  const isSelected = selection.type === 'phase' && selection.id === phase.id;
  const { left, width } = getBarDimensions(
    phase.relativeStart,
    phase.relativeEnd,
    timelineWidth
  );

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);

  const handleClick = useCallback((): void => {
    setSelection({ type: 'phase', id: phase.id });
  }, [setSelection, phase.id]);

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    togglePhaseCollapse(phase.id);
  };

  const handleDragStart = (edge: 'start' | 'end'): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    const deltaRelative = deltaX / timelineWidth;
    if (edge === 'start') {
      const newStart = Math.max(0, Math.min(phase.relativeEnd - 0.01, phase.relativeStart + deltaRelative));
      updatePhasePosition(phase.id, newStart, phase.relativeEnd);
    } else {
      const newEnd = Math.max(phase.relativeStart + 0.01, Math.min(1, phase.relativeEnd + deltaRelative));
      updatePhasePosition(phase.id, phase.relativeStart, newEnd);
    }
  };

  const handleDragEnd = (): void => {
    setDragging(false);
  };

  // Move handlers for dragging the entire bar
  const handleMoveStart = useCallback(
    (e: React.MouseEvent) => {
      // Don't start move if clicking on drag handles (they stopPropagation)
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
      const barWidth = phase.relativeEnd - phase.relativeStart;

      let newStart = phase.relativeStart + deltaRelative;
      let newEnd = phase.relativeEnd + deltaRelative;

      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = barWidth;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - barWidth;
      }

      updatePhasePosition(phase.id, newStart, newEnd);
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
  }, [phase.id, phase.relativeStart, phase.relativeEnd, timelineWidth, updatePhasePosition, setDragging]);

  const handleNameSave = useCallback(
    (newName: string) => {
      updatePhase(phase.id, { name: newName });
    },
    [updatePhase, phase.id]
  );

  // Handle keyboard interaction on the label row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label={`${phase.name} phase`}>
        {/* Phase label */}
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
          aria-label={`${phase.name} phase${isSelected ? ', selected' : ''}`}
        >
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 focus-ring rounded"
            aria-expanded={!phase.isCollapsed}
            aria-label={`${phase.isCollapsed ? 'Expand' : 'Collapse'} ${phase.name}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${
                phase.isCollapsed ? '' : 'expanded'
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
            style={{ backgroundColor: phase.color }}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-gray-700 truncate">
            {phase.name}
          </span>
        </div>

        {/* Element labels */}
        {!phase.isCollapsed && (
          <div role="list" aria-label={`${phase.name} elements`}>
            {phase.elements.map((element) => (
              <ElementRow
                key={element.id}
                element={element}
                phase={phase}
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
    <div role="group" aria-label={`${phase.name} timeline`}>
      {/* Phase bar */}
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
            backgroundColor: phase.color,
          }}
          onClick={handleClick}
          onMouseDown={handleMoveStart}
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label={`${phase.name} phase bar, from ${Math.round(phase.relativeStart * 100)}% to ${Math.round(phase.relativeEnd * 100)}%`}
          aria-selected={isSelected}
        >
          {/* Left drag handle */}
          <DragHandle
            edge="start"
            onDragStart={() => handleDragStart('start')}
            onDrag={(deltaX) => handleDrag('start', deltaX)}
            onDragEnd={handleDragEnd}
            label={`Resize ${phase.name} start`}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={() => handleDragStart('end')}
            onDrag={(deltaX) => handleDrag('end', deltaX)}
            onDragEnd={handleDragEnd}
            label={`Resize ${phase.name} end`}
          />

          {/* Phase name on bar */}
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
            <EditableText
              value={phase.name}
              onSave={handleNameSave}
              className="text-xs font-medium text-white truncate drop-shadow-sm"
              inputClassName="text-gray-800"
            />
          </div>
        </div>

        {/* Milestones */}
        {phase.milestones.map((milestone) => (
          <MilestoneMarker
            key={milestone.id}
            milestone={milestone}
            phase={phase}
            timelineWidth={timelineWidth}
          />
        ))}
      </div>

      {/* Element bars */}
      {!phase.isCollapsed && (
        <div role="list" aria-label={`${phase.name} element bars`}>
          {phase.elements.map((element) => (
            <ElementRow
              key={element.id}
              element={element}
              phase={phase}
              isLabel={false}
              timelineWidth={timelineWidth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
