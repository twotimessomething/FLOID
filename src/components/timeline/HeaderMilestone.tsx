import { memo, useCallback } from 'react';
import type { DependencyAnchor, Section, TimelineItem, ViewportBounds } from '../../types';
import type { LabelPlacement } from '../../utils/labelLayoutUtils';
import { dayToX } from '../../utils/timelineUtils';
import { formatDayKey } from '../../utils/dateUtils';
import { useUIStore } from '../../stores/uiStore';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useItemDrag } from '../../hooks/useItemDrag';
import { useDependencyDraw } from '../../hooks/useDependencyDraw';
import { useItemConnected } from '../../hooks/useDependencyState';
import { reportDependencyHover, reportDependencyLeave } from '../../utils/dependencyHover';
import { useIsDragged } from '../../hooks/useDropState';
import { DependencyDot } from './DependencyDot';
import { MilestoneGlyph } from './MilestoneGlyph';
import { MilestoneLabel } from './MilestoneLabel';

interface HeaderMilestoneProps {
  readonly item: TimelineItem;
  readonly section: Section;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly isHidden?: boolean;
  readonly labelPlacement?: LabelPlacement;
}

/**
 * A milestone at the root of a schedule: it lives on the schedule's own row,
 * above the reference line `MilestoneLines` rules down past everything below
 * it. Drag it sideways to move the date, or onto a bar to make it that bar's —
 * at which point it stops being a header marker and takes a row of its own.
 *
 * Only the marker hides when the schedule scrolls under the axis and the
 * sticky strip takes it over; the line it stands on is drawn elsewhere and
 * stays.
 */
export const HeaderMilestone = memo(function HeaderMilestone({
  item,
  section,
  viewport,
  pixelsPerDay,
  isHidden,
  labelPlacement,
}: HeaderMilestoneProps): JSX.Element | null {
  const selectItem = useUIStore((s) => s.selectItem);
  const isSelected = useUIStore((s) => s.selection.type === 'item' && s.selection.id === item.id);
  const isDragged = useIsDragged(item.id);
  const { startDrag, hasDraggedRef } = useItemDrag();
  const { handleBarContextMenu } = useContextMenu('item', item.id, section.id);

  const left = dayToX(item.start, viewport, pixelsPerDay);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (section.isLocked || item.isLocked) return;
      startDrag(e, { item, sectionId: section.id, pixelsPerDay });
    },
    [section.isLocked, section.id, item, startDrag, pixelsPerDay]
  );

  // -- dependencies --------------------------------------------------------

  const { startDraw: startDependencyDraw } = useDependencyDraw();
  const isConnected = useItemConnected(item.id);

  const handleDependencyDraw = useCallback(
    (e: React.PointerEvent, anchor: DependencyAnchor): void => {
      const dotRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      startDependencyDraw(e, {
        origin: { x: dotRect.left + dotRect.width / 2, y: dotRect.top + dotRect.height / 2 },
        fixed: { end: 'from', itemId: item.id, anchor },
      });
    },
    [startDependencyDraw, item.id]
  );

  const handleDependencyHoverEnter = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType === 'mouse') reportDependencyHover(item.id);
    },
    [item.id]
  );
  const handleDependencyHoverLeave = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType === 'mouse') reportDependencyLeave(item.id);
    },
    [item.id]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      // A nudge that ends on the marker it started from is a move, not a click
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false;
        return;
      }
      selectItem(item.id, section.id, { x: e.clientX, y: e.clientY });
    },
    [selectItem, item.id, section.id, hasDraggedRef]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const bounds = (e.target as HTMLElement).getBoundingClientRect();
        selectItem(item.id, section.id, { x: bounds.right, y: bounds.top });
      }
    },
    [selectItem, item.id, section.id]
  );

  if (isHidden) return null;

  return (
    <div
      className={`absolute top-0 bottom-0 group cursor-grab active:cursor-grabbing hover:z-10 touch-none ${
        isDragged ? 'opacity-30' : ''
      }`}
      style={{ left }}
      onPointerDown={handlePointerDown}
      onPointerEnter={handleDependencyHoverEnter}
      onPointerLeave={handleDependencyHoverLeave}
      onClick={handleClick}
      onContextMenu={handleBarContextMenu}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={`${item.name || 'Milestone'}, ${formatDayKey(item.start)}`}
    >
      {/* A point is a small target; this box is what a drawn link lands on */}
      <span
        className="absolute top-0 bottom-0 -left-3 w-6"
        data-dep-milestone={item.id}
        data-drop-section={section.id}
        aria-hidden="true"
      />
      <MilestoneGlyph isSelected={isSelected} />
      <MilestoneLabel name={item.name} placement={labelPlacement} forceVisible={isSelected} />
      <DependencyDot
        anchor="end"
        variant="milestone"
        isConnected={isConnected}
        onStartDraw={handleDependencyDraw}
        label={`Link ${item.name || 'milestone'}`}
      />
    </div>
  );
});
