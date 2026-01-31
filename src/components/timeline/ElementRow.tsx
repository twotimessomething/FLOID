import { useCallback, useRef, useEffect, useState } from 'react';
import type { Phase, Element, Section } from '../../types';
import { getPhaseColor } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';
import DragHandle from './DragHandle';

interface ElementRowProps {
  readonly element: Element;
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function ElementRow({
  element,
  phase,
  section,
  isLabel,
  timelineWidth,
}: ElementRowProps): JSX.Element {
  const { updateElementPosition } = useSectionStore();
  const { project } = useProjectStore();
  const { selection, selectItem, setDragging } = useUIStore();

  const isIDTimeline = section.type === 'id-timeline';
  const isSelected = selection.type === 'element' && selection.id === element.id;

  // Convert element's relative position (within phase) to absolute position
  const phaseWidth = phase.relativeEnd - phase.relativeStart;
  const absoluteStart = phase.relativeStart + element.relativeStart * phaseWidth;
  const absoluteEnd = phase.relativeStart + element.relativeEnd * phaseWidth;

  const { left, width } = getBarDimensions(
    absoluteStart,
    absoluteEnd,
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
    selectItem('element', element.id, section.id, phase.id, { x: e.clientX, y: e.clientY });
  }, [selectItem, element.id, section.id, phase.id]);

  // Prevent double-click from propagating to parent (which would create a new element)
  const handleDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const handleDragStart = (edge: 'start' | 'end'): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
    // Calculate absolute position and set drag date
    const relativeInPhase = edge === 'start' ? element.relativeStart : element.relativeEnd;
    const absolutePosition = phase.relativeStart + relativeInPhase * phaseWidth;
    const date = getDateFromRelativePosition(project.startDate, project.endDate, absolutePosition);
    const dateStr = formatDate(date, 'MMM d');
    if (edge === 'start') {
      setStartDragDate(dateStr);
    } else {
      setEndDragDate(dateStr);
    }
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    const phasePixelWidth = phaseWidth * timelineWidth;
    const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;

    if (edge === 'start') {
      const newStart = Math.max(
        0,
        Math.min(element.relativeEnd - 0.02, element.relativeStart + deltaRelative)
      );
      updateElementPosition(section.id, phase.id, element.id, newStart, element.relativeEnd);
      // Update drag date
      const absolutePosition = phase.relativeStart + newStart * phaseWidth;
      const date = getDateFromRelativePosition(project.startDate, project.endDate, absolutePosition);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      const newEnd = Math.max(
        element.relativeStart + 0.02,
        Math.min(1, element.relativeEnd + deltaRelative)
      );
      updateElementPosition(section.id, phase.id, element.id, element.relativeStart, newEnd);
      // Update drag date
      const absolutePosition = phase.relativeStart + newEnd * phaseWidth;
      const date = getDateFromRelativePosition(project.startDate, project.endDate, absolutePosition);
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

      updateElementPosition(section.id, phase.id, element.id, newStart, newEnd);
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
  }, [section.id, phase.id, element.id, element.relativeStart, element.relativeEnd, phaseWidth, timelineWidth, updateElementPosition, setDragging]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('element', element.id, section.id, phase.id, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, element.id, section.id, phase.id]
  );

  if (isLabel) {
    return (
      <div
        className={`flex items-center ${isIDTimeline ? 'pl-9' : 'pl-12'} pr-3 border-b border-[#e5e7eb]/30 cursor-pointer row-selectable focus-ring ${
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
        <span className="text-sm text-[#6b7280] truncate">{element.name}</span>
      </div>
    );
  }

  // Get effective color for element (80% opacity)
  const effectiveColor = getPhaseColor(phase, section);
  const elementColor = effectiveColor + 'CC';

  return (
    <div
      className="relative border-b border-[#e5e7eb]/30"
      style={{ height: ELEMENT_ROW_HEIGHT }}
      role="listitem"
    >
      <div
        className={`absolute top-1 bottom-1 rounded-[10px] cursor-grab active:cursor-grabbing timeline-bar group ${
          isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
        }`}
        style={{
          left,
          width,
          backgroundColor: elementColor,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
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
          onDragEnd={() => handleDragEnd('start')}
          label={`Resize ${element.name} start`}
          dragDate={startDragDate}
        />

        {/* Right drag handle */}
        <DragHandle
          edge="end"
          onDragStart={() => handleDragStart('end')}
          onDrag={(deltaX) => handleDrag('end', deltaX)}
          onDragEnd={() => handleDragEnd('end')}
          label={`Resize ${element.name} end`}
          dragDate={endDragDate}
        />

        {/* Element name on bar */}
        <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
          <span className="text-xs text-white/90 truncate drop-shadow-sm">
            {element.name}
          </span>
        </div>
      </div>
    </div>
  );
}
