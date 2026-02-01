import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import type { Phase, Section } from '../../types';
import { getPhaseColor } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate, getDaysBetween } from '../../utils/dateUtils';
import ElementRow from './ElementRow';
import DragHandle from './DragHandle';
import { AddItemButton } from '../controls';

interface PhaseRowProps {
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function PhaseRow({
  phase,
  section,
  isLabel,
  timelineWidth,
}: PhaseRowProps): JSX.Element {
  const { togglePhaseCollapse, updatePhasePosition, addElement } = useSectionStore();
  const { project } = useProjectStore();
  const { selection, selectItem, setDragging } = useUIStore();
  const phaseRowRef = useRef<HTMLDivElement>(null);

  const isIDTimeline = section.type === 'id-timeline';
  const effectiveColor = getPhaseColor(phase, section);
  const isSelected = selection.type === 'phase' && selection.id === phase.id;
  const { left, width } = getBarDimensions(
    phase.relativeStart,
    phase.relativeEnd,
    timelineWidth
  );

  // Memoize phaseWidth to prevent unnecessary callback/effect re-runs
  const phaseWidth = useMemo(
    () => phase.relativeEnd - phase.relativeStart,
    [phase.relativeEnd, phase.relativeStart]
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
    selectItem('phase', phase.id, section.id, null, { x: e.clientX, y: e.clientY });
  }, [selectItem, phase.id, section.id]);

  // Prevent double-click from propagating to parent (which would create a new element)
  const handleBarDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  // Double-click on elements container creates a new element within this phase
  const handleCreateElement = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();

      // Calculate position relative to the phase
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const absolutePosition = getRelativeFromPosition(clickX, timelineWidth);

      // Convert absolute position to phase-relative position (use memoized phaseWidth)
      const relativeInPhase = phaseWidth > 0
        ? (absolutePosition - phase.relativeStart) / phaseWidth
        : 0.5;

      // Create an element centered at the click position with reasonable width
      const totalDays = getDaysBetween(project.startDate, project.endDate);
      const sevenDaysRelative = totalDays > 0 ? (7 / totalDays) / phaseWidth : 0.15;
      const halfWidth = sevenDaysRelative / 2;
      const relativeStart = Math.max(0, Math.min(1 - sevenDaysRelative, relativeInPhase - halfWidth));
      const relativeEnd = Math.min(1, relativeStart + sevenDaysRelative);

      addElement(section.id, phase.id, {
        name: '',
        description: '',
        relativeStart,
        relativeEnd,
        order: phase.elements.length,
      });

      // Get the new element and select it
      const updatedSections = useSectionStore.getState().sections;
      const updatedSection = updatedSections.find((s) => s.id === section.id);
      const updatedPhase = updatedSection?.phases.find((p) => p.id === phase.id);
      const newElement = updatedPhase?.elements[updatedPhase.elements.length - 1];

      if (newElement) {
        selectItem('element', newElement.id, section.id, phase.id, { x: e.clientX, y: e.clientY });
      }
    },
    [section.id, phase.id, phase.relativeStart, phaseWidth, phase.elements.length, timelineWidth, project.startDate, project.endDate, addElement, selectItem]
  );

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    togglePhaseCollapse(section.id, phase.id);
  };

  const handleAddElement = (): void => {
    addElement(section.id, phase.id, {
      name: '',
      description: '',
      relativeStart: 0,
      relativeEnd: 0.3,
      order: phase.elements.length,
    });
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
      updatePhasePosition(section.id, phase.id, newStart, phase.relativeEnd);
      // Update drag date
      const date = getDateFromRelativePosition(project.startDate, project.endDate, newStart);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      const newEnd = Math.max(phase.relativeStart + 0.01, Math.min(1, phase.relativeEnd + deltaRelative));
      updatePhasePosition(section.id, phase.id, phase.relativeStart, newEnd);
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

      let newStart = phase.relativeStart + deltaRelative;
      let newEnd = phase.relativeEnd + deltaRelative;

      // Clamp to bounds (use memoized phaseWidth)
      if (newStart < 0) {
        newStart = 0;
        newEnd = phaseWidth;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - phaseWidth;
      }

      updatePhasePosition(section.id, phase.id, newStart, newEnd);
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
  }, [section.id, phase.id, phase.relativeStart, phase.relativeEnd, phaseWidth, timelineWidth, updatePhasePosition, setDragging]);

  // Handle keyboard interaction on the label row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('phase', phase.id, section.id, null, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, phase.id, section.id]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label={`${phase.name} phase`}>
        {/* Phase label */}
        <div
          className={`flex items-center gap-2 ${isIDTimeline ? 'px-3' : 'pl-6 pr-3'} border-b border-[var(--color-border)]/25 cursor-pointer row-selectable focus-ring ${
            isSelected ? 'selected' : ''
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
            className="w-4 h-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded-md transition-colors duration-150"
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
          {isIDTimeline && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: effectiveColor }}
              aria-hidden="true"
            />
          )}
          <span className={`text-sm ${isIDTimeline ? 'font-medium' : ''} text-[var(--color-text-primary)] truncate flex-1`}>
            {phase.name}
          </span>
          {!isIDTimeline && <AddItemButton onClick={handleAddElement} label="Add element" />}
        </div>

        {/* Element labels */}
        {!phase.isCollapsed && phase.elements.length > 0 && (
          <div role="list" aria-label={`${phase.name} elements`}>
            {phase.elements.map((element) => (
              <ElementRow
                key={element.id}
                element={element}
                phase={phase}
                section={section}
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
        className="relative border-b border-[var(--color-border)]/25 overflow-visible"
        style={{ height: ROW_HEIGHT }}
      >
        <div
          className={`absolute top-2 bottom-2 rounded-[10px] cursor-grab active:cursor-grabbing timeline-bar group overflow-visible ${
            isSelected ? 'ring-2 ring-[var(--color-focus)] ring-offset-1' : ''
          }`}
          style={{
            left,
            width,
            backgroundColor: effectiveColor,
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
            color={effectiveColor}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={() => handleDragStart('end')}
            onDrag={(deltaX) => handleDrag('end', deltaX)}
            onDragEnd={() => handleDragEnd('end')}
            label={`Resize ${phase.name} end`}
            dragDate={endDragDate}
            color={effectiveColor}
          />

          {/* Phase name on bar */}
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
            <span className="text-xs font-medium text-white truncate drop-shadow-sm">
              {phase.name}
            </span>
          </div>
        </div>
      </div>

      {/* Element bars */}
      {!phase.isCollapsed && (
        <div
          role="list"
          aria-label={`${phase.name} element bars`}
          onDoubleClick={handleCreateElement}
        >
          {phase.elements.map((element) => (
            <ElementRow
              key={element.id}
              element={element}
              phase={phase}
              section={section}
              isLabel={false}
              timelineWidth={timelineWidth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
