import { memo, useCallback } from 'react';
import type { Section, TimelineItem } from '../../types';
import type { LabelPlacement } from '../../utils/labelLayoutUtils';
import { ROW_HEIGHT } from '../../utils/timelineUtils';
import { useUIStore } from '../../stores/uiStore';
import { useItemDrag } from '../../hooks/useItemDrag';
import { useIsDragged } from '../../hooks/useDropState';
import { resistLockedDrag } from '../../utils/lockedResist';
import { MilestoneGlyph } from './MilestoneGlyph';
import { MilestoneLabel } from './MilestoneLabel';

interface StickyMilestoneProps {
  readonly item: TimelineItem;
  readonly section: Section;
  readonly left: number;
  readonly pixelsPerDay: number;
  readonly isSelected: boolean;
  readonly labelPlacement?: LabelPlacement;
}

/**
 * A root milestone as the band under the axis prints it.
 *
 * While its schedule is held there, this is the only copy of the marker on
 * screen — the one on the schedule's own row has scrolled away — so it has to
 * be the whole marker: it selects, opens its menu, and picks up and moves
 * exactly as the one on the sheet does.
 */
export const StickyMilestone = memo(function StickyMilestone({
  item,
  section,
  left,
  pixelsPerDay,
  isSelected,
  labelPlacement,
}: StickyMilestoneProps): JSX.Element {
  const selectItem = useUIStore((s) => s.selectItem);
  const isDragged = useIsDragged(item.id);
  const { startDrag, hasDraggedRef } = useItemDrag();
  const isLocked = section.isLocked === true || item.isLocked === true;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (useUIStore.getState().isDragging) return;
      if (e.button === 0 && !e.ctrlKey) {
        selectItem(item.id, section.id, { x: e.clientX, y: e.clientY }, { openEditor: false });
      }
      if (isLocked) {
        resistLockedDrag(e, e.currentTarget as HTMLElement);
        return;
      }
      startDrag(e, { item, sectionId: section.id, pixelsPerDay });
    },
    [isLocked, selectItem, item, section.id, startDrag, pixelsPerDay]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false;
        return;
      }
      selectItem(item.id, section.id, { x: e.clientX, y: e.clientY });
    },
    [hasDraggedRef, selectItem, item.id, section.id]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      useUIStore.getState().openContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: 'item',
        targetId: item.id,
        sectionId: section.id,
        location: 'bar',
      });
    },
    [item.id, section.id]
  );
  return (
    <div
      className={`absolute hover:z-10 group timeline-point touch-none ${
        isLocked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${isDragged ? 'timeline-point--lifted' : ''}`}
      style={{ left, top: 0, height: ROW_HEIGHT }}
      data-drag-item={item.id}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      aria-label={`${item.name} milestone (sticky)`}
    >
      <MilestoneGlyph isSelected={isSelected} />
      <MilestoneLabel name={item.name} placement={labelPlacement} forceVisible={isSelected} />
    </div>
  );
});
