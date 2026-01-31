import { useCallback, useRef, useEffect } from 'react';
import type { Phase, Element } from '../../types';
import { useTimelineStore } from '../../stores/timelineStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';
import { EditableText } from '../common';
import DragHandle from './DragHandle';

interface ElementRowProps {
  readonly element: Element;
  readonly phase: Phase;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function ElementRow({
  element,
  phase,
  isLabel,
  timelineWidth,
}: ElementRowProps): JSX.Element {
  const { updateElementPosition, updateElement } = useTimelineStore();
  const { selection, setSelection, setDragging } = useUIStore();

  const isSelected =
    selection.type === 'element' && selection.id === element.id;

  // Convert element's relative position (within phase) to absolute position
  const phaseWidth = phase.relativeEnd - phase.relativeStart;
  const absoluteStart =
    phase.relativeStart + element.relativeStart * phaseWidth;
  const absoluteEnd = phase.relativeStart + element.relativeEnd * phaseWidth;

  const { left, width } = getBarDimensions(
    absoluteStart,
    absoluteEnd,
    timelineWidth
  );

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);

  const handleClick = useCallback((): void => {
    setSelection({ type: 'element', id: element.id });
  }, [setSelection, element.id]);

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
      updateElementPosition(
        phase.id,
        element.id,
        newStart,
        element.relativeEnd
      );
    } else {
      const newEnd = Math.max(
        element.relativeStart + 0.02,
        Math.min(1, element.relativeEnd + deltaRelative)
      );
      updateElementPosition(
        phase.id,
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

      updateElementPosition(phase.id, element.id, newStart, newEnd);
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
  }, [phase.id, element.id, element.relativeStart, element.relativeEnd, phaseWidth, timelineWidth, updateElementPosition, setDragging]);

  const handleNameSave = useCallback(
    (newName: string) => {
      updateElement(phase.id, element.id, { name: newName });
    },
    [updateElement, phase.id, element.id]
  );

  // Handle keyboard interaction
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
    return (
      <div
        className={`flex items-center pl-9 pr-3 border-b border-gray-50 cursor-pointer row-selectable focus-ring ${
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

  // Lighter version of phase color for element (80% opacity)
  const elementColor = phase.color + 'CC';

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
