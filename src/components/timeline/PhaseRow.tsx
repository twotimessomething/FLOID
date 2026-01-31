import { useCallback, useRef, useEffect, useState } from 'react';
import type { Phase } from '../../types';
import { useTimelineStore } from '../../stores/timelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';
import ElementRow from './ElementRow';
import DragHandle from './DragHandle';
import MilestoneMarker from './MilestoneMarker';

interface PhaseRowProps {
  readonly phase: Phase;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly totalDays: number;
}

export default function PhaseRow({ phase, isLabel, timelineWidth, totalDays }: PhaseRowProps): JSX.Element {
  const { togglePhaseCollapse, updatePhasePosition, addElement } = useTimelineStore();
  const { project } = useProjectStore();
  const { selection, setSelection, setDragging } = useUIStore();
  const phaseRowRef = useRef<HTMLDivElement>(null);
  const elementContainerRef = useRef<HTMLDivElement>(null);

  const isSelected = selection.type === 'phase' && selection.id === phase.id;
  const { left, width } = getBarDimensions(
    phase.relativeStart,
    phase.relativeEnd,
    timelineWidth
  );

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);
  const hasDragged = useRef(false);

  // Drag date bubble state
  const [startDragDate, setStartDragDate] = useState<string | undefined>(undefined);
  const [endDragDate, setEndDragDate] = useState<string | undefined>(undefined);

  const handleClick = useCallback((e: React.MouseEvent): void => {
    // Don't trigger selection if we just finished dragging
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    setSelection({ type: 'phase', id: phase.id }, { x: e.clientX, y: e.clientY });
  }, [setSelection, phase.id]);

  // Prevent double-click from propagating to parent (which would create a new element)
  const handleBarDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    togglePhaseCollapse(phase.id);
  };

  const handleDragStart = (edge: 'start' | 'end'): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
    // Initialize the drag date
    const position = edge === 'start' ? phase.relativeStart : phase.relativeEnd;
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
      const newStart = Math.max(0, Math.min(phase.relativeEnd - 0.01, phase.relativeStart + deltaRelative));
      updatePhasePosition(phase.id, newStart, phase.relativeEnd);
      // Update drag date
      const date = getDateFromRelativePosition(project.startDate, project.endDate, newStart);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      const newEnd = Math.max(phase.relativeStart + 0.01, Math.min(1, phase.relativeEnd + deltaRelative));
      updatePhasePosition(phase.id, phase.relativeStart, newEnd);
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

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

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

  // Handle keyboard interaction on the label row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSelection({ type: 'phase', id: phase.id }, { x: rect.right, y: rect.top });
      }
    },
    [setSelection, phase.id]
  );

  // Double-click on element container creates a new element within this phase
  const handleElementContainerDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      // Prevent event from bubbling to parent container
      e.stopPropagation();

      const rect = elementContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clickX = e.clientX - rect.left;
      const absoluteRelative = getRelativeFromPosition(clickX, timelineWidth);

      // Convert absolute position to relative position within the phase
      const phaseWidth = phase.relativeEnd - phase.relativeStart;
      if (phaseWidth <= 0) return;

      const relativeWithinPhase = (absoluteRelative - phase.relativeStart) / phaseWidth;

      // Create an element with 30-day default width
      const thirtyDaysRelative = totalDays > 0 ? 30 / totalDays : 0.1;
      // Convert to relative within phase
      const elementWidthInPhase = phaseWidth > 0 ? thirtyDaysRelative / phaseWidth : 0.2;
      const halfWidth = elementWidthInPhase / 2;

      const relativeStart = Math.max(0, relativeWithinPhase - halfWidth);
      const relativeEnd = Math.min(1, relativeWithinPhase + halfWidth);

      addElement(phase.id, {
        name: 'New Element',
        description: '',
        relativeStart,
        relativeEnd,
        order: phase.elements.length,
      });

      // Get the new element and select it
      const updatedPhases = useTimelineStore.getState().phases;
      const updatedPhase = updatedPhases.find((p) => p.id === phase.id);
      const newElement = updatedPhase?.elements[updatedPhase.elements.length - 1];

      if (newElement) {
        setSelection({ type: 'element', id: newElement.id }, { x: e.clientX, y: e.clientY });
      }
    },
    [phase.id, phase.relativeStart, phase.relativeEnd, phase.elements.length, timelineWidth, totalDays, addElement, setSelection]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label={`${phase.name} phase`}>
        {/* Phase label */}
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
          aria-label={`${phase.name} phase${isSelected ? ', selected' : ''}`}
        >
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] focus-ring rounded-md transition-colors duration-150"
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
          <span className="text-sm font-medium text-[#111827] truncate">
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
      {/* Phase bar row - double-click bubbles up to create phases */}
      <div
        ref={phaseRowRef}
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
            backgroundColor: phase.color,
          }}
          onClick={handleClick}
          onDoubleClick={handleBarDoubleClick}
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
            onDragEnd={() => handleDragEnd('start')}
            label={`Resize ${phase.name} start`}
            dragDate={startDragDate}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={() => handleDragStart('end')}
            onDrag={(deltaX) => handleDrag('end', deltaX)}
            onDragEnd={() => handleDragEnd('end')}
            label={`Resize ${phase.name} end`}
            dragDate={endDragDate}
          />

          {/* Phase name on bar */}
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
            <span className="text-xs font-medium text-white truncate drop-shadow-sm">
              {phase.name}
            </span>
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

      {/* Element bars - double-click creates elements */}
      {!phase.isCollapsed && (
        <div
          ref={elementContainerRef}
          role="list"
          aria-label={`${phase.name} element bars`}
          onDoubleClick={handleElementContainerDoubleClick}
          style={{ minHeight: phase.elements.length === 0 ? 28 : undefined }}
        >
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
