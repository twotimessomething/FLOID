import { useCallback, useEffect, useRef } from 'react';
import type { DropTarget, TimelineItem } from '../types/timeline';
import { dropTargetKey } from '../types/timeline';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { addDaysToKey } from '../utils/dayKeys';
import { formatDayKey } from '../utils/dateUtils';
import { collectIds } from '../utils/itemTree';
import { createDragPreview, type DragPreview } from '../utils/dragPreview';

/**
 * Dragging an item.
 *
 * One gesture does three things at once, and shows all three live: the bar
 * follows the cursor at its own size, the horizontal distance becomes a whole
 * number of days, and whatever is under the pointer becomes the new parent or
 * the new slot. Nothing is written to the store until the mouse comes up, so
 * the rows underneath never reflow while the user is still choosing.
 */

/** Movement, in px, before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** How close to the scroller's edge before the timeline follows the pointer. */
const EDGE_SCROLL_ZONE_PX = 72;
const EDGE_SCROLL_MAX_PX = 24;

export interface StartItemDragArgs {
  readonly item: TimelineItem;
  readonly sectionId: string;
  readonly pixelsPerDay: number;
  /** The element to clone for the preview; defaults to the event target. */
  readonly barElement?: HTMLElement;
}

interface DragSession {
  item: TimelineItem;
  sectionId: string;
  pixelsPerDay: number;
  startClientX: number;
  startClientY: number;
  /** Ids in the dragged subtree — none of them may become its own parent. */
  subtreeIds: Set<string>;
  barRect: DOMRect;
  grabOffsetX: number;
  grabOffsetY: number;
  preview: DragPreview | null;
  target: DropTarget | null;
  dayDelta: number;
  active: boolean;
  /** Latest pointer position, so the edge-scroll loop can re-aim each frame. */
  pointerX: number;
  pointerY: number;
  /** Where the sheet was scrolled to when the press landed. */
  startScrollLeft: number;
  scrollFrame: number | null;
  cleanup: () => void;
}

export function useItemDrag(): {
  startDrag: (event: React.MouseEvent, args: StartItemDragArgs) => void;
  /** True when the press turned into a drag, so click handlers can stand down. */
  hasDraggedRef: React.MutableRefObject<boolean>;
} {
  const sessionRef = useRef<DragSession | null>(null);
  const hasDraggedRef = useRef(false);

  useEffect(() => () => sessionRef.current?.cleanup(), []);

  const startDrag = useCallback((event: React.MouseEvent, args: StartItemDragArgs): void => {
    if (event.button !== 0 || sessionRef.current) return;
    const element = args.barElement ?? (event.currentTarget as HTMLElement);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    hasDraggedRef.current = false;

    const barRect = element.getBoundingClientRect();

    const session: DragSession = {
      item: args.item,
      sectionId: args.sectionId,
      pixelsPerDay: args.pixelsPerDay,
      startClientX: event.clientX,
      startClientY: event.clientY,
      subtreeIds: collectIds(args.item),
      barRect,
      grabOffsetX: event.clientX - barRect.left,
      grabOffsetY: event.clientY - barRect.top,
      preview: null,
      target: null,
      dayDelta: 0,
      active: false,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startScrollLeft: timelineScroller()?.scrollLeft ?? 0,
      scrollFrame: null,
      cleanup: () => undefined,
    };

    const activate = (): void => {
      session.active = true;
      hasDraggedRef.current = true;
      session.preview = createDragPreview(element, barRect);
      useSectionStore.getState().beginDragTransaction();
      useUIStore.getState().beginItemDrag(args.item.id, args.sectionId, args.item.kind);
      useUIStore.getState().setDragging(true, 'move');
      document.body.classList.add('no-select');
      document.body.classList.add('dragging-item');
    };

    const render = (clientX: number, clientY: number): void => {
      // Resolve the target first: whether the pointer is over a bar decides
      // whether its horizontal travel counts as a change of dates at all.
      const target = resolveDropTarget(clientX, clientY, session.subtreeIds);
      session.target = target;
      useUIStore.getState().setItemDropKey(dropTargetKey(target));

      // Travel is measured in days of sheet, not pixels of screen: when the
      // edge has been scrolling the timeline along under a pointer that barely
      // moved, that scroll is most of the distance the item actually covered.
      const scrolled = (timelineScroller()?.scrollLeft ?? 0) - session.startScrollLeft;
      const days = dayDeltaForDrop(
        target,
        clientX - session.startClientX + scrolled,
        session.pixelsPerDay
      );
      session.dayDelta = days;

      session.preview?.moveTo(
        clientX - session.grabOffsetX,
        clientY - session.grabOffsetY,
        formatDayKey(addDaysToKey(session.item.start, days), 'MMM d')
      );
    };

    const onMove = (moveEvent: MouseEvent): void => {
      if (!session.active) {
        const dx = Math.abs(moveEvent.clientX - session.startClientX);
        const dy = Math.abs(moveEvent.clientY - session.startClientY);
        if (dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return;
        // A hold the playhead already claimed is a scrub, not a drag
        if (useUIStore.getState().playheadPosition !== null) {
          session.cleanup();
          return;
        }
        activate();
      }
      session.pointerX = moveEvent.clientX;
      session.pointerY = moveEvent.clientY;
      startEdgeScroll();
      render(moveEvent.clientX, moveEvent.clientY);
    };

    /**
     * Following the pointer past the edge of the sheet.
     *
     * Both halves of this have to happen every frame. The speed is read from
     * where the pointer is *now*, so leaning further into the edge really does
     * go faster; and the drop target is resolved again, because the rows are
     * travelling under a pointer that is standing still and the answer under it
     * keeps changing. On the display's own clock, since it is chasing paint.
     */
    const edgeScrollTick = (): void => {
      const scroller = timelineScroller();
      if (!scroller || !session.active) {
        session.scrollFrame = null;
        return;
      }

      const speed = edgeScrollSpeed(scroller.getBoundingClientRect(), session.pointerX);
      if (speed === 0) {
        session.scrollFrame = null;
        return;
      }

      const before = scroller.scrollLeft;
      scroller.scrollLeft = before + speed;
      if (scroller.scrollLeft !== before) render(session.pointerX, session.pointerY);

      session.scrollFrame = requestAnimationFrame(edgeScrollTick);
    };

    const startEdgeScroll = (): void => {
      if (session.scrollFrame === null) {
        session.scrollFrame = requestAnimationFrame(edgeScrollTick);
      }
    };

    const onUp = (): void => {
      const wasActive = session.active;
      const target = session.target;
      const dayDelta = session.dayDelta;
      // Joining a group keeps the item's own dates, so the bar reappears
      // wherever it already sat — usually nowhere near the cursor that let go
      // of it. Keep the clone alive and fly it there instead of cutting, so the
      // rule the timeline runs on is something the user watches happen.
      //
      // Only from the timeline column: a drag started in the labels is a clone
      // of the label row, which arrives here as `pixelsPerDay` of 0. It has no
      // bar to land on, and flying it into the plot would land the wrong thing
      // in the wrong column.
      const canSettle = wasActive && target?.kind === 'into' && session.pixelsPerDay > 0;
      const flight = canSettle ? session.preview : null;
      if (flight) session.preview = null;
      session.cleanup();
      if (!wasActive) return;
      commitDrag(session.item, session.sectionId, target, dayDelta);
      if (flight) settleOnLandedBar(flight, session.item.id);
    };

    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape') return;
      const wasActive = session.active;
      session.cleanup();
      if (wasActive) useSectionStore.getState().rollbackDragTransaction();
    };

    session.cleanup = (): void => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKeyDown);
      if (session.scrollFrame !== null) cancelAnimationFrame(session.scrollFrame);
      session.preview?.destroy();
      if (session.active) {
        useUIStore.getState().endItemDrag();
        useUIStore.getState().setDragging(false);
        document.body.classList.remove('no-select');
        document.body.classList.remove('dragging-item');
      }
    };

    sessionRef.current = session;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKeyDown);
  }, []);

  return { startDrag, hasDraggedRef };
}

/**
 * Land the clone on the bar the store has just committed.
 *
 * The commit is not delayed for this: the row is already there, selection and
 * undo are already live, and the clone is only catching up with them. One frame
 * later is enough for React to have painted the landing row — and if there is
 * no row to land on, because the new parent is collapsed around it, the clone
 * simply goes as it always did.
 */
function settleOnLandedBar(preview: DragPreview, itemId: string): void {
  requestAnimationFrame(() => {
    const landed = document.querySelector<HTMLElement>(
      `[data-drop-bar="${CSS.escape(itemId)}"]`
    );
    if (!landed) {
      preview.destroy();
      return;
    }
    const rect = landed.getBoundingClientRect();
    preview.settleTo({ left: rect.left, top: rect.top, height: rect.height });
  });
}

function timelineScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.timeline-scroll-container');
}

/** Px per frame, ramped by how far into the edge zone the pointer has reached. */
function edgeScrollSpeed(rect: DOMRect, clientX: number): number {
  if (clientX < rect.left + EDGE_SCROLL_ZONE_PX) {
    return -scrollSpeed(rect.left + EDGE_SCROLL_ZONE_PX - clientX);
  }
  if (clientX > rect.right - EDGE_SCROLL_ZONE_PX) {
    return scrollSpeed(clientX - (rect.right - EDGE_SCROLL_ZONE_PX));
  }
  return 0;
}

function scrollSpeed(distanceIntoZone: number): number {
  const ratio = Math.min(1, distanceIntoZone / EDGE_SCROLL_ZONE_PX);
  return Math.ceil(ratio * EDGE_SCROLL_MAX_PX);
}

/**
 * How far, in days, a drop moves the item.
 *
 * Dropping onto a bar means putting the item in that bar's group, and reaching
 * a bar means travelling to wherever on the timeline it happens to sit — that
 * travel is aiming, not rescheduling, so joining a group leaves the item's
 * dates exactly where they were. A row is full width, so the pointer's
 * horizontal position along one really was chosen, and there it does move the
 * dates. A drag started from the labels column has no time axis under it at
 * all, which arrives here as `pixelsPerDay` of 0.
 */
export function dayDeltaForDrop(
  target: DropTarget | null,
  pointerDeltaPx: number,
  pixelsPerDay: number
): number {
  if (pixelsPerDay <= 0 || target?.kind === 'into') return 0;
  return Math.round(pointerDeltaPx / pixelsPerDay);
}

/** Apply the drop. A drag with nowhere to land still keeps its day shift. */
function commitDrag(
  item: TimelineItem,
  sectionId: string,
  target: DropTarget | null,
  dayDelta: number
): void {
  const store = useSectionStore.getState();

  if (!target) {
    store.shiftItem(sectionId, item.id, dayDelta);
    store.commitDragTransaction();
    return;
  }

  const parentId = target.kind === 'into' ? target.parentId : target.parentId;
  const index = target.kind === 'into' ? Number.MAX_SAFE_INTEGER : target.index;

  store.moveItem({
    itemId: item.id,
    fromSectionId: sectionId,
    toSectionId: target.sectionId,
    toParentId: parentId,
    toIndex: index,
    dayDelta,
  });
  store.commitDragTransaction();
}

/**
 * What is under the pointer, read straight off the DOM.
 *
 * Hit-testing beats re-deriving row geometry in JS: the rows already know where
 * they are, the preview is `pointer-events: none` so it never occludes them,
 * and the answer stays correct through scrolling, collapsing and zoom.
 */
export function resolveDropTarget(
  clientX: number,
  clientY: number,
  subtreeIds: ReadonlySet<string>
): DropTarget | null {
  const stack = document.elementsFromPoint(clientX, clientY) as HTMLElement[];

  for (const element of stack) {
    const data = element.dataset;

    // A bar takes the item inside it — this is how groups are made
    if (data.dropBar) {
      if (subtreeIds.has(data.dropBar) || !data.dropSection) continue;
      return { kind: 'into', sectionId: data.dropSection, parentId: data.dropBar };
    }

    // Empty space beside a row places the item next to that row
    if (data.dropRow) {
      if (!data.dropSection) continue;
      const parentId = data.dropParent || null;
      if (parentId && subtreeIds.has(parentId)) continue;
      const index = Number(data.dropIndex ?? 0);
      const rect = element.getBoundingClientRect();
      const after = clientY > rect.top + rect.height / 2;
      return {
        kind: 'slot',
        sectionId: data.dropSection,
        parentId,
        index: after ? index + 1 : index,
      };
    }

    // A schedule's milestone row, and the open space under its items
    if (data.dropHeader) {
      return { kind: 'slot', sectionId: data.dropHeader, parentId: null, index: 0 };
    }

    if (data.dropBody) {
      return {
        kind: 'slot',
        sectionId: data.dropBody,
        parentId: null,
        index: Number(data.dropCount ?? 0),
      };
    }
  }

  return null;
}
