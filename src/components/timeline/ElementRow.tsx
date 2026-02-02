import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import type { Phase, Element, Section, ViewportBounds } from '../../types';
import { getPhaseColor } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { getBarDimensions, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate, sectionToViewportRelative, getDaysBetween, snapRelativeToBusinessDay } from '../../utils/dateUtils';
import DragHandle from './DragHandle';

interface ElementRowProps {
  readonly element: Element;
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
}

export default function ElementRow({
  element,
  phase,
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
}: ElementRowProps): JSX.Element {
  const { updateElementPosition } = useSectionStore();
  const project = useProjectStore((state) => state.project);
  const { selection, selectItem, setDragging, openContextMenu } = useUIStore();

  const isMasterSection = section.id === project?.masterSectionId;
  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);
  const isSelected = selection.type === 'element' && selection.id === element.id;

  // Memoize phaseWidth (section-relative) to prevent unnecessary effect re-runs
  const phaseWidth = useMemo(
    () => phase.relativeEnd - phase.relativeStart,
    [phase.relativeEnd, phase.relativeStart]
  );

  // Calculate section-relative absolute position of element
  const sectionRelativeStart = phase.relativeStart + element.relativeStart * phaseWidth;
  const sectionRelativeEnd = phase.relativeStart + element.relativeEnd * phaseWidth;

  // Convert section-relative to viewport-relative for rendering
  const viewportStart = sectionToViewportRelative(sectionRelativeStart, section, viewportBounds);
  const viewportEnd = sectionToViewportRelative(sectionRelativeEnd, section, viewportBounds);

  const { left, width } = getBarDimensions(
    viewportStart,
    viewportEnd,
    timelineWidth
  );

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);
  const hasDragged = useRef(false);

  // Refs to avoid effect re-runs during drag (store latest values for use in event handlers)
  const elementRef = useRef({ relativeStart: element.relativeStart, relativeEnd: element.relativeEnd });
  const phaseRelativeStartRef = useRef(phase.relativeStart);
  elementRef.current = { relativeStart: element.relativeStart, relativeEnd: element.relativeEnd };
  phaseRelativeStartRef.current = phase.relativeStart;

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

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'element', element.id, section.id, phase.id);
  }, [openContextMenu, element.id, section.id, phase.id]);

  // Prevent double-click from propagating to parent (which would create a new element)
  const handleDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const handleDragStart = (edge: 'start' | 'end', _e?: React.MouseEvent): void => {
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
    // Calculate section-relative position and set drag date using section dates
    const relativeInPhase = edge === 'start' ? element.relativeStart : element.relativeEnd;
    const sectionPosition = phase.relativeStart + relativeInPhase * phaseWidth;
    const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionPosition);
    const dateStr = formatDate(date, 'MMM d');
    if (edge === 'start') {
      setStartDragDate(dateStr);
    } else {
      setEndDragDate(dateStr);
    }
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    // Calculate the pixel width of the phase in viewport coordinates
    const sectionDays = getDaysBetween(section.startDate, section.endDate);
    const sectionViewportWidth = viewportBounds.totalDays > 0
      ? (sectionDays / viewportBounds.totalDays) * timelineWidth
      : timelineWidth;
    const phasePixelWidth = phaseWidth * sectionViewportWidth;
    const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;

    if (edge === 'start') {
      const newStart = Math.max(
        0,
        Math.min(element.relativeEnd - 0.02, element.relativeStart + deltaRelative)
      );
      updateElementPosition(section.id, phase.id, element.id, newStart, element.relativeEnd);
      // Update drag date using section dates
      const sectionPosition = phase.relativeStart + newStart * phaseWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionPosition);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      const newEnd = Math.max(
        element.relativeStart + 0.02,
        Math.min(1, element.relativeEnd + deltaRelative)
      );
      updateElementPosition(section.id, phase.id, element.id, element.relativeStart, newEnd);
      // Update drag date using section dates
      const sectionPosition = phase.relativeStart + newEnd * phaseWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionPosition);
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

    // Smart weekend snapping: snap edge to next business day if on weekend (if enabled)
    // Element positions are relative to phase, so convert to section-relative for snapping
    if (settings.skipWeekends) {
      const relativeInPhase = edge === 'start' ? element.relativeStart : element.relativeEnd;
      const sectionPosition = phase.relativeStart + relativeInPhase * phaseWidth;
      const snappedSectionPosition = snapRelativeToBusinessDay(sectionPosition, section.startDate, section.endDate);
      if (snappedSectionPosition !== sectionPosition) {
        // Convert back to phase-relative
        const snappedPhaseRelative = phaseWidth > 0 ? (snappedSectionPosition - phase.relativeStart) / phaseWidth : relativeInPhase;
        const clampedSnapped = Math.max(0, Math.min(1, snappedPhaseRelative));
        if (edge === 'start') {
          updateElementPosition(section.id, phase.id, element.id, clampedSnapped, element.relativeEnd);
        } else {
          updateElementPosition(section.id, phase.id, element.id, element.relativeStart, clampedSnapped);
        }
      }
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

  // Calculate the pixel width of the phase in viewport coordinates (memoized for effect)
  const sectionDays = useMemo(() => getDaysBetween(section.startDate, section.endDate), [section.startDate, section.endDate]);
  const phasePixelWidth = useMemo(() => {
    const sectionViewportWidth = viewportBounds.totalDays > 0
      ? (sectionDays / viewportBounds.totalDays) * timelineWidth
      : timelineWidth;
    return phaseWidth * sectionViewportWidth;
  }, [sectionDays, viewportBounds.totalDays, timelineWidth, phaseWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMoving.current) return;
      const deltaX = e.clientX - moveLastX.current;
      moveLastX.current = e.clientX;

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;
      // Use refs to get latest values without causing effect re-runs
      const { relativeStart, relativeEnd } = elementRef.current;
      const barWidth = relativeEnd - relativeStart;

      let newStart = relativeStart + deltaRelative;
      let newEnd = relativeEnd + deltaRelative;

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

      // Smart weekend snapping: snap both edges to next business day if on weekend (if enabled)
      // Convert element positions to section-relative for snapping
      if (settings.skipWeekends) {
        // Use refs to get latest values
        const { relativeStart, relativeEnd } = elementRef.current;
        const phaseStart = phaseRelativeStartRef.current;
        const startSectionPosition = phaseStart + relativeStart * phaseWidth;
        const endSectionPosition = phaseStart + relativeEnd * phaseWidth;
        const snappedStartSection = snapRelativeToBusinessDay(startSectionPosition, section.startDate, section.endDate);
        const snappedEndSection = snapRelativeToBusinessDay(endSectionPosition, section.startDate, section.endDate);

        if (snappedStartSection !== startSectionPosition || snappedEndSection !== endSectionPosition) {
          // Convert back to phase-relative
          const snappedStartPhase = phaseWidth > 0 ? (snappedStartSection - phaseStart) / phaseWidth : relativeStart;
          const snappedEndPhase = phaseWidth > 0 ? (snappedEndSection - phaseStart) / phaseWidth : relativeEnd;
          updateElementPosition(
            section.id,
            phase.id,
            element.id,
            Math.max(0, Math.min(1, snappedStartPhase)),
            Math.max(0, Math.min(1, snappedEndPhase))
          );
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [section.id, section.startDate, section.endDate, phase.id, element.id, phaseWidth, phasePixelWidth, updateElementPosition, setDragging, settings.skipWeekends]);

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
        className={`flex items-center ${isMasterSection ? 'pl-9' : 'pl-12'} pr-3 border-b border-[var(--color-border)]/15 cursor-pointer row-selectable focus-ring ${
          isSelected ? 'selected' : ''
        }`}
        style={{ height: ELEMENT_ROW_HEIGHT }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        role="listitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`${element.name} element${isSelected ? ', selected' : ''}`}
      >
        <span className="text-sm text-[var(--color-text-secondary)] truncate">{element.name}</span>
      </div>
    );
  }

  // Get effective color for element (80% opacity)
  const effectiveColor = getPhaseColor(phase, section);
  const elementColor = effectiveColor + 'CC';

  return (
    <div
      className="relative border-b border-[var(--color-border)]/15 overflow-visible"
      style={{ height: ELEMENT_ROW_HEIGHT }}
      role="listitem"
    >
      <div
        className={`absolute top-1 bottom-1 rounded-[10px] cursor-grab active:cursor-grabbing timeline-bar group overflow-visible ${
          isSelected ? 'ring-2 ring-[var(--color-focus)] ring-offset-1' : ''
        }`}
        style={{
          left,
          width,
          backgroundColor: elementColor,
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
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
          onDragStart={(e) => handleDragStart('start', e)}
          onDrag={(deltaX) => handleDrag('start', deltaX)}
          onDragEnd={() => handleDragEnd('start')}
          label={`Resize ${element.name} start`}
          dragDate={startDragDate}
          color={elementColor}
        />

        {/* Right drag handle */}
        <DragHandle
          edge="end"
          onDragStart={(e) => handleDragStart('end', e)}
          onDrag={(deltaX) => handleDrag('end', deltaX)}
          onDragEnd={() => handleDragEnd('end')}
          label={`Resize ${element.name} end`}
          dragDate={endDragDate}
          color={elementColor}
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
