import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { Milestone, Section, ViewportBounds } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate, sectionToViewportRelative, getDaysBetween, snapRelativeToBusinessDay, findNearestPhaseBoundary } from '../../utils/dateUtils';

interface MilestoneMarkerProps {
  readonly milestone: Milestone;
  readonly section: Section;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly lineHeight?: number; // Height of the vertical line extending down
}

export default function MilestoneMarker({
  milestone,
  section,
  timelineWidth,
  viewportBounds,
  lineHeight = 0,
}: MilestoneMarkerProps) {
  const { updateMilestone } = useSectionStore();
  const { selection, selectItem, setDragging, openContextMenu } = useUIStore();

  const isSelected = selection.type === 'milestone' && selection.id === milestone.id;
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const hasDragged = useRef(false);
  const [dragDate, setDragDate] = useState<string | undefined>(undefined);

  // Convert section-relative position to viewport-relative for rendering
  const viewportPosition = sectionToViewportRelative(milestone.relativePosition, section, viewportBounds);
  const milestoneLeft = viewportPosition * timelineWidth;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't trigger selection if we just finished dragging
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    selectItem('milestone', milestone.id, section.id, null, { x: e.clientX, y: e.clientY });
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'milestone', milestone.id, section.id);
  }, [openContextMenu, milestone.id, section.id]);

  // Prevent double-click from propagating to parent
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');

      // Initialize drag date using section dates
      const date = getDateFromRelativePosition(section.startDate, section.endDate, milestone.relativePosition);
      setDragDate(formatDate(date, 'MMM d'));
    },
    [setDragging, milestone.relativePosition, section.startDate, section.endDate]
  );

  // Memoize section viewport width for the effect
  const sectionDays = useMemo(() => getDaysBetween(section.startDate, section.endDate), [section.startDate, section.endDate]);
  const sectionViewportWidth = useMemo(
    () => viewportBounds.totalDays > 0 ? (sectionDays / viewportBounds.totalDays) * timelineWidth : timelineWidth,
    [sectionDays, viewportBounds.totalDays, timelineWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      // Convert pixel delta to section-relative position
      const deltaSectionRelative = sectionViewportWidth > 0 ? deltaX / sectionViewportWidth : 0;
      const newPosition = Math.max(0, Math.min(1, milestone.relativePosition + deltaSectionRelative));

      updateMilestone(section.id, milestone.id, { relativePosition: newPosition });

      // Update drag date using section dates
      const date = getDateFromRelativePosition(section.startDate, section.endDate, newPosition);
      setDragDate(formatDate(date, 'MMM d'));
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setDragging(false);
      setDragDate(undefined);
      document.body.classList.remove('no-select');

      // Apply smart snapping behaviors
      let finalPosition = milestone.relativePosition;

      // 1. Milestone gravity: snap to nearby phase boundary (within 5%)
      const nearestBoundary = findNearestPhaseBoundary(finalPosition, section.phases, 0.05);
      if (nearestBoundary !== null) {
        finalPosition = nearestBoundary;
      }

      // 2. Weekend snapping: snap to next business day if on weekend
      const snappedPosition = snapRelativeToBusinessDay(finalPosition, section.startDate, section.endDate);
      if (snappedPosition !== finalPosition) {
        finalPosition = snappedPosition;
      }

      // Update if position changed
      if (finalPosition !== milestone.relativePosition) {
        updateMilestone(section.id, milestone.id, { relativePosition: finalPosition });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [section.id, section.startDate, section.endDate, milestone.relativePosition, milestone.id, sectionViewportWidth, updateMilestone, setDragging]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('milestone', milestone.id, section.id, null, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, milestone.id, section.id]
  );

  return (
    <div
      className="absolute z-30 cursor-pointer group focus-ring"
      style={{
        left: milestoneLeft,
        top: 0,
        height: ROW_HEIGHT,
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${milestone.name} milestone at ${Math.round(milestone.relativePosition * 100)}%`}
      aria-selected={isSelected}
    >
      {/* Drag date bubble */}
      {dragDate && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 px-2 py-1 bg-[var(--color-tooltip)] text-white text-xs font-medium rounded shadow-lg whitespace-nowrap z-50 pointer-events-none"
          aria-hidden="true"
        >
          {dragDate}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-tooltip)]" />
        </div>
      )}

      {/* Diamond marker */}
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }`}
        aria-hidden="true"
      >
        <div
          className={`w-3 h-3 rotate-45 ${
            isSelected
              ? 'bg-[var(--color-focus)] ring-2 ring-[var(--color-focus)]/40'
              : 'bg-[var(--color-text-primary)] group-hover:bg-gray-800'
          }`}
        />
      </div>

      {/* Short vertical line extending down from marker */}
      <div
        className={`absolute top-1/2 left-0 -translate-x-1/2 w-0.5 h-3 ${
          isSelected ? 'bg-[var(--color-focus)]' : 'bg-[var(--color-text-primary)] group-hover:bg-gray-800'
        }`}
        aria-hidden="true"
      />

      {/* Extended vertical line through content rows */}
      {lineHeight > 0 && (
        <div
          className="absolute left-0 -translate-x-1/2 w-px bg-[var(--color-gridline)] pointer-events-none"
          style={{
            top: ROW_HEIGHT,
            height: lineHeight,
          }}
          aria-hidden="true"
        />
      )}

      {/* Always visible title - below the marker */}
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 -mt-2 px-2 py-0.5 bg-white/70 backdrop-blur-[2px] text-[var(--color-text-primary)] text-xs rounded-md whitespace-nowrap pointer-events-none border border-white/50"
        role="tooltip"
      >
        {milestone.name}
      </div>
    </div>
  );
}
