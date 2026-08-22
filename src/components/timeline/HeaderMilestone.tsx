import { memo, useCallback } from 'react';
import type { Section, TimelineItem, ViewportBounds } from '../../types';
import type { LabelPlacement } from '../../utils/labelLayoutUtils';
import { dayToX } from '../../utils/timelineUtils';
import { formatDayKey } from '../../utils/dateUtils';
import { useUIStore } from '../../stores/uiStore';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useItemDrag } from '../../hooks/useItemDrag';
import { useIsDragged } from '../../hooks/useDropState';
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
      onClick={handleClick}
      onContextMenu={handleBarContextMenu}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={`${item.name || 'Milestone'}, ${formatDayKey(item.start)}`}
    >
      <MilestoneGlyph isSelected={isSelected} />
      <MilestoneLabel name={item.name} placement={labelPlacement} forceVisible={isSelected} />
    </div>
  );
});
