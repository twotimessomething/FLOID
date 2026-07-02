import { useRef, useCallback, useEffect, useState, useMemo, memo } from 'react';
import type { Milestone, Section, ViewportBounds } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { ROW_HEIGHT } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate, sectionToViewportRelative, getDaysBetween, snapRelativeToBusinessDay, findNearestPhaseBoundary } from '../../utils/dateUtils';
import { useContextMenu } from '../../hooks/useContextMenu';
import { MilestoneGlyph } from './MilestoneGlyph';
import { MilestoneLabel } from './MilestoneLabel';
import type { LabelPlacement } from '../../utils/labelLayoutUtils';

interface MilestoneMarkerProps {
  readonly milestone: Milestone;
  readonly section: Section;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly lineHeight?: number; // Height of the vertical line extending down
  readonly isHidden?: boolean; // Hide when rendered as sticky
  readonly labelPlacement?: LabelPlacement;
}

export const MilestoneMarker = memo(function MilestoneMarker({
  milestone,
  section,
  timelineWidth,
  viewportBounds,
  lineHeight = 0,
  isHidden = false,
  labelPlacement,
}: MilestoneMarkerProps) {
  const updateMilestone = useSectionStore((s) => s.updateMilestone);
  const beginDragTransaction = useSectionStore((s) => s.beginDragTransaction);
  const commitDragTransaction = useSectionStore((s) => s.commitDragTransaction);
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const setDragging = useUIStore((s) => s.setDragging);
  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);

  const isSelected = selection.type === 'milestone' && selection.id === milestone.id;
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const hasDragged = useRef(false);
  const [dragDate, setDragDate] = useState<string | undefined>(undefined);

  // Refs to avoid callback/effect re-runs during drag
  const milestonePositionRef = useRef(milestone.relativePosition);
  milestonePositionRef.current = milestone.relativePosition;

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

  const { handleLabelContextMenu: handleContextMenu } = useContextMenu('milestone', milestone.id, section.id);

  // Prevent double-click from propagating to parent
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Begin undo transaction before any state changes
      beginDragTransaction();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');

      // Initialize drag date using section dates (use ref to avoid callback recreation)
      const date = getDateFromRelativePosition(section.startDate, section.endDate, milestonePositionRef.current);
      setDragDate(formatDate(date, 'MMM d'));
    },
    [beginDragTransaction, setDragging, section.startDate, section.endDate]
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

      // Convert pixel delta to section-relative position (use ref for latest position)
      const deltaSectionRelative = sectionViewportWidth > 0 ? deltaX / sectionViewportWidth : 0;
      const newPosition = Math.max(0, Math.min(1, milestonePositionRef.current + deltaSectionRelative));

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

      // Apply smart snapping behaviors (use ref for latest position)
      let finalPosition = milestonePositionRef.current;

      // 1. Milestone gravity: snap to nearby phase boundary (if enabled)
      if (settings.milestoneSnap) {
        // Use a pixel-based threshold (15px) converted to relative units
        const SNAP_PIXELS = 15;
        const snapThreshold = sectionViewportWidth > 0 ? SNAP_PIXELS / sectionViewportWidth : 0.02;
        const nearestBoundary = findNearestPhaseBoundary(finalPosition, section.phases, snapThreshold);
        if (nearestBoundary !== null) {
          finalPosition = nearestBoundary;
        }
      }

      // 2. Weekend snapping: snap to next business day if on weekend (if enabled)
      if (settings.skipWeekends) {
        const snappedPosition = snapRelativeToBusinessDay(finalPosition, section.startDate, section.endDate);
        if (snappedPosition !== finalPosition) {
          finalPosition = snappedPosition;
        }
      }

      // Update if position changed
      if (finalPosition !== milestonePositionRef.current) {
        updateMilestone(section.id, milestone.id, { relativePosition: finalPosition });
      }

      // Commit transaction to create single undo entry
      commitDragTransaction();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [section.id, section.startDate, section.endDate, section.phases, milestone.id, sectionViewportWidth, updateMilestone, setDragging, settings.milestoneSnap, settings.skipWeekends, commitDragTransaction]);

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
      className={`absolute z-30 hover:z-40 group focus-ring ${isHidden ? 'pointer-events-none' : 'cursor-pointer'}`}
      style={{
        left: milestoneLeft,
        top: 0,
        height: ROW_HEIGHT,
      }}
      onClick={isHidden ? undefined : handleClick}
      onContextMenu={isHidden ? undefined : handleContextMenu}
      onDoubleClick={isHidden ? undefined : handleDoubleClick}
      onMouseDown={isHidden ? undefined : handleMouseDown}
      onKeyDown={isHidden ? undefined : handleKeyDown}
      role={isHidden ? undefined : 'button'}
      tabIndex={isHidden ? -1 : 0}
      aria-label={`${milestone.name} milestone at ${Math.round(milestone.relativePosition * 100)}%`}
      aria-selected={isSelected}
    >
      {/* Drag date bubble - hidden when sticky */}
      {dragDate && !isHidden && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 px-2 py-1 bg-[var(--color-tooltip)] text-[var(--color-tooltip-text)] text-xs font-medium rounded shadow-lg whitespace-nowrap z-50 pointer-events-none"
          aria-hidden="true"
        >
          {dragDate}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-tooltip)]" />
        </div>
      )}

      {/* Diamond marker with tick - hidden when sticky */}
      {!isHidden && <MilestoneGlyph isSelected={isSelected} />}

      {/* Extended vertical line through content rows - ALWAYS visible */}
      {lineHeight > 0 && (
        <div
          className="absolute left-0 -translate-x-1/2 w-px bg-[var(--color-milestone-line)] pointer-events-none"
          style={{
            top: ROW_HEIGHT,
            height: lineHeight,
          }}
          aria-hidden="true"
        />
      )}

      {/* Title below the marker - placement from collision layout, hidden when sticky */}
      {!isHidden && (
        <MilestoneLabel
          name={milestone.name}
          placement={labelPlacement}
          forceVisible={isSelected}
        />
      )}
    </div>
  );
});
