import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import type { Phase, Section, ViewportBounds } from '../../types';
import { getPhaseColor } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { getBarDimensions, ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import {
  getDateFromRelativePosition,
  formatDate,
  getDaysBetween,
  sectionToViewportRelative,
  viewportToSectionRelative,
  snapRelativeToBusinessDay,
} from '../../utils/dateUtils';
import ElementRow from './ElementRow';
import DragHandle from './DragHandle';
import { AddItemButton } from '../controls';

interface PhaseRowProps {
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
}

export default function PhaseRow({
  phase,
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
}: PhaseRowProps): JSX.Element {
  const { togglePhaseCollapse, updatePhasePosition, updatePhaseWithElements, updatePhaseWithRipple, addElement, clearExpansion } = useSectionStore();
  const lastExpansion = useSectionStore((state) => state.lastExpansion);
  const project = useProjectStore((state) => state.project);
  const { selection, selectItem, setDragging, openContextMenu } = useUIStore();
  const phaseRowRef = useRef<HTMLDivElement>(null);

  const isMasterSection = section.id === project?.masterSectionId;
  const effectiveColor = getPhaseColor(phase, section);
  const isSelected = selection.type === 'phase' && selection.id === phase.id;

  // Convert section-relative positions to viewport-relative for rendering
  const viewportStart = sectionToViewportRelative(phase.relativeStart, section, viewportBounds);
  const viewportEnd = sectionToViewportRelative(phase.relativeEnd, section, viewportBounds);
  const { left, width } = getBarDimensions(
    viewportStart,
    viewportEnd,
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

  // Preserve children state (Shift key modifier)
  const preserveChildrenRef = useRef(false);
  const initialElementPositions = useRef<Array<{ id: string; absoluteStart: number; absoluteEnd: number }>>([]);

  // Ripple mode state (Shift+Cmd/Ctrl modifier on end handle)
  const rippleModeRef = useRef(false);

  // Drag date bubble state
  const [startDragDate, setStartDragDate] = useState<string | undefined>(undefined);
  const [endDragDate, setEndDragDate] = useState<string | undefined>(undefined);

  // Helper to compensate scroll when expansion happens during drag
  const compensateExpansionScroll = useCallback(() => {
    const expansion = useSectionStore.getState().lastExpansion;
    if (!expansion || expansion.sectionId !== section.id) return;

    const scrollContainer = document.querySelector('.timeline-scroll-container') as HTMLElement | null;
    if (scrollContainer && expansion.expansionStartDays > 0) {
      // When expanding left, content shifts right - compensate by scrolling right
      const scrollDelta = (expansion.expansionStartDays / expansion.newTotalDays) * timelineWidth;
      scrollContainer.scrollLeft += scrollDelta;
    }

    clearExpansion();
  }, [section.id, timelineWidth, clearExpansion]);

  const handleClick = useCallback((e: React.MouseEvent): void => {
    // Don't trigger selection if we just finished dragging
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    selectItem('phase', phase.id, section.id, null, { x: e.clientX, y: e.clientY });
  }, [selectItem, phase.id, section.id]);

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'phase', phase.id, section.id);
  }, [openContextMenu, phase.id, section.id]);

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
      // Convert viewport pixel position to viewport-relative
      const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
      // Convert viewport-relative to section-relative
      const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);

      // Convert section-relative to phase-relative position
      const relativeInPhase = phaseWidth > 0
        ? (sectionRelative - phase.relativeStart) / phaseWidth
        : 0.5;

      // Create an element centered at the click position with reasonable width
      const sectionDays = getDaysBetween(section.startDate, section.endDate);
      const sevenDaysRelative = sectionDays > 0 ? (7 / sectionDays) / phaseWidth : 0.15;
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
    [section, phase.id, phase.relativeStart, phaseWidth, phase.elements.length, timelineWidth, viewportBounds, addElement, selectItem]
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

  const handleDragStart = (edge: 'start' | 'end', e?: React.MouseEvent): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');

    // Check for ripple mode: Shift+Cmd/Ctrl on end handle only
    const isRippleModifier = e?.shiftKey && (e?.metaKey || e?.ctrlKey);
    rippleModeRef.current = edge === 'end' && (isRippleModifier ?? false);

    // Check if Shift is held (without Cmd/Ctrl) to preserve children positions
    preserveChildrenRef.current = (e?.shiftKey && !e?.metaKey && !e?.ctrlKey) ?? false;
    if (preserveChildrenRef.current) {
      // Capture initial absolute positions of all elements (section-relative)
      initialElementPositions.current = phase.elements.map((el) => ({
        id: el.id,
        absoluteStart: phase.relativeStart + el.relativeStart * phaseWidth,
        absoluteEnd: phase.relativeStart + el.relativeEnd * phaseWidth,
      }));
    }

    // Initialize the drag date - use section dates for date display
    const position = edge === 'start' ? phase.relativeStart : phase.relativeEnd;
    const date = getDateFromRelativePosition(section.startDate, section.endDate, position);
    const dateStr = formatDate(date, 'MMM d');
    if (edge === 'start') {
      setStartDragDate(dateStr);
    } else {
      setEndDragDate(dateStr);
    }
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    // Convert pixel delta to section-relative delta
    // We need to scale by the ratio of section width to viewport width
    const sectionDays = getDaysBetween(section.startDate, section.endDate);
    const sectionViewportWidth = (sectionDays / viewportBounds.totalDays) * timelineWidth;
    const deltaSectionRelative = sectionViewportWidth > 0 ? deltaX / sectionViewportWidth : 0;

    let newStart: number;
    let newEnd: number;

    if (edge === 'start') {
      // Allow going below 0 to trigger auto-expansion
      newStart = Math.min(phase.relativeEnd - 0.01, phase.relativeStart + deltaSectionRelative);
      newEnd = phase.relativeEnd;
      // Update drag date
      const clampedStart = Math.max(0, newStart);
      const date = getDateFromRelativePosition(section.startDate, section.endDate, clampedStart);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      newStart = phase.relativeStart;
      // Allow going above 1 to trigger auto-expansion
      newEnd = Math.max(phase.relativeStart + 0.01, phase.relativeEnd + deltaSectionRelative);
      // Update drag date
      const clampedEnd = Math.min(1, newEnd);
      const date = getDateFromRelativePosition(section.startDate, section.endDate, clampedEnd);
      setEndDragDate(formatDate(date, 'MMM d'));
    }

    // Ripple mode: shift all downstream phases when resizing end
    if (rippleModeRef.current && edge === 'end') {
      updatePhaseWithRipple(section.id, phase.id, newEnd);
      return;
    }

    if (preserveChildrenRef.current && initialElementPositions.current.length > 0) {
      // Calculate new element positions to preserve absolute positions
      const newPhaseWidth = newEnd - newStart;
      const elementUpdates = initialElementPositions.current.map((initial) => {
        // Clamp absolute positions to new phase bounds
        const clampedAbsStart = Math.max(newStart, Math.min(newEnd, initial.absoluteStart));
        const clampedAbsEnd = Math.max(newStart, Math.min(newEnd, initial.absoluteEnd));

        // Convert back to relative positions within the new phase
        const newRelStart = newPhaseWidth > 0 ? (clampedAbsStart - newStart) / newPhaseWidth : 0;
        const newRelEnd = newPhaseWidth > 0 ? (clampedAbsEnd - newStart) / newPhaseWidth : 1;

        // Ensure minimum element width
        const minWidth = 0.02;
        const finalRelEnd = Math.max(newRelStart + minWidth, newRelEnd);

        return {
          id: initial.id,
          relativeStart: Math.max(0, Math.min(1 - minWidth, newRelStart)),
          relativeEnd: Math.min(1, finalRelEnd),
        };
      });

      updatePhaseWithElements(section.id, phase.id, newStart, newEnd, elementUpdates);
    } else {
      // updatePhasePosition will handle auto-expansion if newStart < 0 or newEnd > 1
      updatePhasePosition(section.id, phase.id, newStart, newEnd);
      // Compensate scroll immediately if expansion happened
      compensateExpansionScroll();
    }
  };

  const handleDragEnd = (edge: 'start' | 'end'): void => {
    setDragging(false);
    // Mark that a drag occurred to prevent click from triggering
    hasDragged.current = true;
    // Clear preserve children state
    preserveChildrenRef.current = false;
    initialElementPositions.current = [];
    // Clear ripple mode state
    rippleModeRef.current = false;
    // Clear the drag date
    if (edge === 'start') {
      setStartDragDate(undefined);
    } else {
      setEndDragDate(undefined);
    }

    // Smart weekend snapping: snap edge to next business day if on weekend
    const currentPosition = edge === 'start' ? phase.relativeStart : phase.relativeEnd;
    const snappedPosition = snapRelativeToBusinessDay(currentPosition, section.startDate, section.endDate);
    if (snappedPosition !== currentPosition) {
      if (edge === 'start') {
        updatePhasePosition(section.id, phase.id, snappedPosition, phase.relativeEnd);
      } else {
        updatePhasePosition(section.id, phase.id, phase.relativeStart, snappedPosition);
      }
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

  // Memoize sectionViewportWidth for the move handler
  const sectionDays = useMemo(() => getDaysBetween(section.startDate, section.endDate), [section.startDate, section.endDate]);
  const sectionViewportWidth = useMemo(
    () => viewportBounds.totalDays > 0 ? (sectionDays / viewportBounds.totalDays) * timelineWidth : timelineWidth,
    [sectionDays, viewportBounds.totalDays, timelineWidth]
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

      // Convert pixel delta to section-relative delta
      const deltaSectionRelative = sectionViewportWidth > 0 ? deltaX / sectionViewportWidth : 0;

      const newStart = phase.relativeStart + deltaSectionRelative;
      const newEnd = phase.relativeEnd + deltaSectionRelative;

      // Allow moving past bounds to trigger auto-expansion
      // The store's updatePhasePosition will handle the expansion
      updatePhasePosition(section.id, phase.id, newStart, newEnd);

      // Compensate scroll immediately if expansion happened
      compensateExpansionScroll();
    };

    const handleMouseUp = () => {
      if (!isMoving.current) return;
      isMoving.current = false;
      setDragging(false);
      document.body.classList.remove('no-select');

      // Smart weekend snapping: snap both edges to next business day if on weekend
      const snappedStart = snapRelativeToBusinessDay(phase.relativeStart, section.startDate, section.endDate);
      const snappedEnd = snapRelativeToBusinessDay(phase.relativeEnd, section.startDate, section.endDate);
      if (snappedStart !== phase.relativeStart || snappedEnd !== phase.relativeEnd) {
        updatePhasePosition(section.id, phase.id, snappedStart, snappedEnd);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [section.id, phase.id, phase.relativeStart, phase.relativeEnd, sectionViewportWidth, updatePhasePosition, setDragging, compensateExpansionScroll]);

  // Viewport stability: compensate scroll position after auto-expansion
  useEffect(() => {
    if (!lastExpansion || lastExpansion.sectionId !== section.id) return;

    // Find the scroll container
    const scrollContainer = document.querySelector('.timeline-scroll-container') as HTMLElement | null;
    if (!scrollContainer) {
      clearExpansion();
      return;
    }

    // When we expand left, content shifts right - compensate by scrolling right
    if (lastExpansion.expansionStartDays > 0) {
      const scrollDelta = (lastExpansion.expansionStartDays / lastExpansion.newTotalDays) * timelineWidth;
      scrollContainer.scrollLeft += scrollDelta;
    }

    clearExpansion();
  }, [lastExpansion, section.id, timelineWidth, clearExpansion]);

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
          className={`flex items-center gap-2 ${isMasterSection ? 'px-3' : 'pl-6 pr-3'} border-b border-[var(--color-border)]/25 cursor-pointer row-selectable focus-ring ${
            isSelected ? 'selected' : ''
          }`}
          style={{ height: ROW_HEIGHT }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
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
          {isMasterSection && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: effectiveColor }}
              aria-hidden="true"
            />
          )}
          <span className={`text-sm ${isMasterSection ? 'font-medium' : ''} text-[var(--color-text-primary)] truncate flex-1`}>
            {phase.name}
          </span>
          {!isMasterSection && <AddItemButton onClick={handleAddElement} label="Add element" />}
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
                viewportBounds={viewportBounds}
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
          onContextMenu={handleContextMenu}
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
            onDragStart={(e) => handleDragStart('start', e)}
            onDrag={(deltaX) => handleDrag('start', deltaX)}
            onDragEnd={() => handleDragEnd('start')}
            label={`Resize ${phase.name} start`}
            dragDate={startDragDate}
            color={effectiveColor}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={(e) => handleDragStart('end', e)}
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
              viewportBounds={viewportBounds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
