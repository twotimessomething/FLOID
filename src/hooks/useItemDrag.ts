import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { DropTarget, TimelineItem } from '../types/timeline';
import { dropTargetKey } from '../types/timeline';
import { DEFAULT_PROJECT_SETTINGS } from '../types/project';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { addDaysToKey, dayKeyDiff, snapKeyToBusinessDay } from '../utils/dayKeys';
import { formatShortDay } from '../utils/dateUtils';
import { collectIds, locateItem } from '../utils/itemTree';
import { HEADER_HEIGHT } from '../utils/timelineUtils';
import type { ClipRect } from '../utils/dragCluster';
import {
  createDragCluster,
  finishDragMotion,
  settleDuration,
  type ClusterSource,
  type DragCluster,
  type LandingTarget,
} from '../utils/dragCluster';
import { captureLayout, playLayout, type LayoutSnapshot } from '../utils/layoutFlip';
import {
  columnRoot,
  findDragElement,
  homeTargets,
  landingTargets,
  visibleDescendants,
  type DragColumn,
} from '../utils/dragLanding';

/**
 * Dragging an item.
 *
 * One gesture does three things at once, and shows all three live: the bar
 * follows the cursor at its own size, the horizontal distance becomes a whole
 * number of days, and whatever is under the pointer becomes the new parent or
 * the new slot. Nothing is written to the store until the mouse comes up, so
 * the rows underneath never reflow while the user is still choosing.
 *
 * What follows the pointer is the item and everything under it that is on
 * screen, drawn in a little as one cluster (`dragCluster.ts`). Letting go is
 * never a cut: the store is written once, the rows slide to their new places
 * (`layoutFlip.ts`), and the cluster flies to the rows it became and opens back
 * out on the way. Calling the drag off flies it home the same way.
 */

/** Movement, in px, before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** How close to the scroller's edge before the timeline follows the pointer. */
const EDGE_SCROLL_ZONE_PX = 72;
const EDGE_SCROLL_MAX_PX = 24;
/** Rows are shorter than the sheet is wide, so the vertical zone is too. */
const EDGE_SCROLL_ZONE_Y_PX = 56;
const EDGE_SCROLL_MAX_Y_PX = 18;
/** The edge speeds are px per frame of a 60 Hz display. */
const EDGE_SCROLL_FRAME_MS = 1000 / 60;
/** A stalled frame scrolls as far as a few would, never as far as the stall. */
const EDGE_SCROLL_MAX_FRAMES = 3;

export interface StartItemDragArgs {
  readonly item: TimelineItem;
  readonly sectionId: string;
  readonly pixelsPerDay: number;
  /** The element to clone for the preview; defaults to the event target. */
  readonly barElement?: HTMLElement;
}

interface DragSession {
  /** The pointer this gesture belongs to; any other is someone else's. */
  pointerId: number;
  item: TimelineItem;
  sectionId: string;
  /** Where the item sits before the drop, to tell a move from a no-op. */
  origin: DragOrigin;
  pixelsPerDay: number;
  /** Which column the press began in — the one the cluster is cloned from. */
  column: DragColumn;
  element: HTMLElement;
  startClientX: number;
  startClientY: number;
  /** Ids in the dragged subtree — none of them may become its own parent. */
  subtreeIds: Set<string>;
  barRect: DOMRect;
  grabOffsetX: number;
  grabOffsetY: number;
  cluster: DragCluster | null;
  /** The ids actually travelling in the cluster, leader first. */
  memberIds: string[];
  target: DropTarget | null;
  dayDelta: number;
  active: boolean;
  /** Latest pointer position, so the edge-scroll loop can re-aim each frame. */
  pointerX: number;
  pointerY: number;
  /** Where the sheet was scrolled to when the press landed. */
  startScrollLeft: number;
  /**
   * The pointer has left the timeline altogether — over the sidebar, outside
   * the window. Letting go there is letting go of nothing, and the item goes
   * home rather than taking whatever travel the edge scroll piled up.
   */
  isOutside: boolean;
  /** The last thing under the pointer refused the drop — a lock. */
  isRefused: boolean;
  /**
   * Whether leaning on the top or bottom edge scrolls yet. A press that lands
   * right under the axis has not asked to go anywhere; only travel into the
   * edge zone from outside it — or leaving and coming back — says so.
   */
  edgeYArmed: boolean;
  scrollFrame: number | null;
  /** When the edge scroll last stepped, so each step can be scaled by its frame. */
  scrollFrameAt: number | null;
  cleanup: () => void;
}

export function useItemDrag(): {
  startDrag: (event: React.PointerEvent, args: StartItemDragArgs) => void;
  /** True when the press turned into a drag, so click handlers can stand down. */
  hasDraggedRef: React.MutableRefObject<boolean>;
} {
  const sessionRef = useRef<DragSession | null>(null);
  const hasDraggedRef = useRef(false);

  // A press that never became a drag dies with the row. A drag in progress
  // does not: a marker in the band under the axis unmounts the moment its
  // schedule scrolls out of the band — the drag's own edge scroll can do that —
  // and the gesture has to carry on, and land, without it.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session && !session.active) session.cleanup();
    },
    []
  );

  const startDrag = useCallback((event: React.PointerEvent, args: StartItemDragArgs): void => {
    // One gesture at a time, app-wide: a second finger on another bar, or a
    // ctrl-click — the Mac's secondary click, which belongs to the menu.
    if (event.button !== 0 || event.ctrlKey || sessionRef.current) return;
    if (useUIStore.getState().isDragging) return;
    const element = args.barElement ?? (event.currentTarget as HTMLElement);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    hasDraggedRef.current = false;

    // Where the bar is drawn right now — possibly mid-slide from the last
    // drop. The grab is measured against this, the bar the user actually
    // pressed, before anything settling is finished underneath it.
    const drawnRect = element.getBoundingClientRect();

    // A landing still in flight belongs to the last gesture. This one starts
    // from the sheet as it will be, not as it was halfway through settling.
    finishDragMotion();

    // The gesture is claimed from the press, not from the first move: the
    // keyboard, the menu and every other pointer stand down while a press may
    // still become a drag. A zoom or an undo between the press and the
    // threshold would otherwise move the sheet under a drag measured before it.
    useUIStore.getState().setDragging(true, 'move');

    // The bar is small, the travel is not: capture addresses the rest of the
    // gesture to it however far the pointer goes, and a finger or a pen that
    // wanders off the element keeps the same drag rather than starting a new
    // one. The document listeners below still see everything — captured events
    // bubble — so nothing depends on the element outliving the drag.
    element.setPointerCapture?.(event.pointerId);

    const barRect = drawnRect;

    const section = useSectionStore.getState().sections.find((s) => s.id === args.sectionId);
    const located = section ? locateItem(section.items, args.item.id) : null;
    const originParentId = located?.parent?.id ?? null;
    const originIndex = located?.index ?? 0;
    const origin: DragOrigin = {
      sectionId: args.sectionId,
      parentId: originParentId,
      index: originIndex,
      ...(located
        ? stayRange(located.siblings, originIndex, originParentId === null)
        : { stayFrom: originIndex, stayTo: originIndex + 1 }),
    };

    const session: DragSession = {
      pointerId: event.pointerId,
      item: args.item,
      sectionId: args.sectionId,
      origin,
      pixelsPerDay: args.pixelsPerDay,
      column: args.pixelsPerDay > 0 ? 'plot' : 'labels',
      element,
      startClientX: event.clientX,
      startClientY: event.clientY,
      subtreeIds: collectIds(args.item),
      barRect,
      grabOffsetX: event.clientX - barRect.left,
      grabOffsetY: event.clientY - barRect.top,
      cluster: null,
      memberIds: [args.item.id],
      target: null,
      dayDelta: 0,
      active: false,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startScrollLeft: timelineScroller()?.scrollLeft ?? 0,
      isOutside: false,
      isRefused: false,
      edgeYArmed: false,
      scrollFrame: null,
      scrollFrameAt: null,
      cleanup: () => undefined,
    };

    const activate = (): void => {
      session.active = true;
      hasDraggedRef.current = true;
      // Cloned before anything drains, so the cluster carries the real ink
      const followers = visibleDescendants(args.item, session.column);
      session.memberIds = [args.item.id, ...followers.map((follower) => follower.id)];
      session.cluster = createDragCluster(
        { id: args.item.id, element },
        followers,
        session.column,
        { clip: session.column === 'plot' ? sheetWindow : labelsWindow }
      );
      // stopPropagation on the press kept the menu's click-outside from
      // hearing it; a drag is as good a reason to close it as a click.
      useUIStore.getState().closeContextMenu();
      // Nothing is written until the drop, so there is no transaction to
      // open: the drop is one store write and one undo step, and a drag that
      // is called off has nothing to take back.
      useUIStore
        .getState()
        .beginItemDrag(args.item.id, args.sectionId, args.item.kind, session.subtreeIds);
      document.body.classList.add('no-select');
      document.body.classList.add('dragging-item');
    };

    const render = (clientX: number, clientY: number): void => {
      // Resolve the target first: whether the pointer is over a bar decides
      // whether its horizontal travel counts as a change of dates at all.
      session.isOutside = !isOverTimeline(clientX, clientY, session.column);
      const resolved: ResolvedDrop = session.isOutside
        ? NOTHING
        : resolveDrop(clientX, clientY, {
            subtreeIds: session.subtreeIds,
            currentParentId: session.origin.parentId,
          });
      const target = resolved.target;
      session.target = target;
      session.isRefused = resolved.surface === 'locked';
      useUIStore
        .getState()
        .setItemDropKey(dropIndicatorKey(resolved, session.item.kind, session.origin));

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

      session.cluster?.moveTo(clientX - session.grabOffsetX, clientY - session.grabOffsetY);
      // The date it will actually land on — after "skip weekends" — rather
      // than the one under the pointer, or the readout would promise a Saturday
      // and the drop would deliver a Monday. The labels column has no time
      // axis, and off the sheet nothing lands, so neither shows a date.
      session.cluster?.setLabel(
        session.column === 'plot' && !session.isOutside && !session.isRefused
          ? formatShortDay(
              addDaysToKey(session.item.start, snappedDayDelta(session.item.start, days))
            )
          : null
      );
    };

    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== session.pointerId) return;
      // No button held: the release happened somewhere the page never heard
      // (off the window, under a native dialog). Whatever is in the hand goes
      // home rather than following the bare hover until the next click.
      if (moveEvent.buttons === 0) {
        abandon();
        return;
      }
      if (!session.active) {
        const dx = Math.abs(moveEvent.clientX - session.startClientX);
        const dy = Math.abs(moveEvent.clientY - session.startClientY);
        if (dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return;
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
     *
     * Up and down as well as along: a schedule further down the sheet is as
     * much somewhere to take an item as next month is. Only a drag from the
     * plot scrolls sideways — the labels column sits left of the sheet, so a
     * pointer there would otherwise read as leaning on its left edge the whole
     * time and run the timeline back to its start.
     */
    const edgeScrollTick = (now: number): void => {
      const scroller = timelineScroller();
      if (!scroller || !session.active) {
        session.scrollFrame = null;
        session.scrollFrameAt = null;
        return;
      }

      const rect = scroller.getBoundingClientRect();
      const speedX = session.column === 'plot' ? edgeScrollSpeed(rect, session.pointerX) : 0;
      const rawSpeedY = edgeScrollSpeedY(rect, session.pointerY, stickyBandsBottom());
      if (rawSpeedY === 0) session.edgeYArmed = true;
      const speedY = session.edgeYArmed ? rawSpeedY : 0;
      if (speedX === 0 && speedY === 0) {
        session.scrollFrame = null;
        session.scrollFrameAt = null;
        return;
      }

      const elapsed = session.scrollFrameAt === null ? null : now - session.scrollFrameAt;
      session.scrollFrameAt = now;
      const beforeX = scroller.scrollLeft;
      const beforeY = scroller.scrollTop;
      if (speedX !== 0) scroller.scrollLeft = beforeX + edgeScrollStep(speedX, elapsed);
      if (speedY !== 0) scroller.scrollTop = beforeY + edgeScrollStep(speedY, elapsed);
      if (scroller.scrollTop !== beforeY) syncLabelsToSheet(scroller);
      if (scroller.scrollLeft !== beforeX || scroller.scrollTop !== beforeY) {
        render(session.pointerX, session.pointerY);
      }

      session.scrollFrame = requestAnimationFrame(edgeScrollTick);
    };

    const startEdgeScroll = (): void => {
      if (session.scrollFrame === null) {
        session.scrollFrame = requestAnimationFrame(edgeScrollTick);
      }
    };

    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== session.pointerId) return;
      // Off the timeline, or onto something locked: nothing to land on, so
      // the item goes home with nothing written
      if (session.active && (session.isOutside || session.isRefused)) {
        abandon();
        return;
      }
      const cluster = session.cluster;
      session.cluster = null;
      if (!session.active || !cluster) {
        session.cleanup();
        return;
      }

      // One write, then the sheet slides to it. The commit and the end of the
      // drag state land in the same render, so the rows the item left are
      // already back to full ink by the time anything is measured.
      const snapshot = captureLayout();
      try {
        flushSync(() => {
          commitDrag(session.item, session.origin, session.target, session.dayDelta);
          session.cleanup();
        });
      } finally {
        // Whatever the commit did, the gesture is over: no listener or drag
        // state may outlive it. Idempotent when the render above already ran.
        session.cleanup();
        land(
          cluster,
          snapshot,
          landingTargets(
            session.memberIds,
            session.column,
            useSectionStore.getState().sections
          ),
          session.column,
          session.subtreeIds
        );
      }
    };

    /**
     * A drag that is called off goes home. Nothing was written, so the rows
     * have not moved and the cluster simply flies back into them — the user
     * sees the item return rather than reappear.
     */
    const abandon = (): void => {
      const cluster = session.cluster;
      session.cluster = null;
      const wasActive = session.active;
      if (!wasActive || !cluster) {
        session.cleanup();
        return;
      }
      const sources = session.memberIds
        .map((id) => ({
          id,
          element: id === session.item.id ? session.element : findDragElement(session.column, id),
        }))
        .filter((source): source is ClusterSource => source.element !== null);
      flushSync(() => session.cleanup());
      const targets = homeTargets(sources, session.column);
      cluster.settle(targets, settleFor(cluster, targets));
    };

    /**
      * A gesture the system took away — a finger the browser decided was a
      * scroll, a pen leaving the tablet. It is not a drop, so nothing lands.
      */
    const onCancel = (cancelEvent: PointerEvent): void => {
      if (cancelEvent.pointerId === session.pointerId) abandon();
    };

    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape') return;
      // The drag owns this Escape; it is not also a request to close the editor
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      abandon();
    };

    // Focus leaving the window takes the pointerup with it: the drag would
    // otherwise still be following the hover when the user comes back.
    const onBlur = (): void => abandon();

    // A wheel or a trackpad moves the sheet under a pointer that has not
    // moved; what is under it has changed all the same.
    const onScroll = (): void => {
      if (session.active) render(session.pointerX, session.pointerY);
    };

    session.cleanup = (): void => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      timelineScroller()?.removeEventListener('scroll', onScroll);
      if (session.scrollFrame !== null) cancelAnimationFrame(session.scrollFrame);
      session.cluster?.destroy();
      session.cluster = null;
      useUIStore.getState().setDragging(false);
      if (session.active) {
        useUIStore.getState().endItemDrag();
        document.body.classList.remove('no-select');
        document.body.classList.remove('dragging-item');
      }
    };

    sessionRef.current = session;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    // Capture phase, so the drag hears Escape before the shortcuts do
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    timelineScroller()?.addEventListener('scroll', onScroll, { passive: true });
  }, []);

  return { startDrag, hasDraggedRef };
}

/**
 * How long the landing takes, from how far the item has to travel to get
 * home. A drop onto a group keeps the item's dates, so the bar may have weeks
 * of sheet to cross back to where it really sits; a drop beside a row is a
 * few pixels. Both should look like the same motion.
 */
function settleFor(cluster: DragCluster, targets: ReadonlyMap<string, LandingTarget>): number {
  const [first] = targets.values();
  const element = first?.resolve();
  if (!element) return settleDuration(0);
  const rect = element.getBoundingClientRect();
  const from = cluster.leaderPosition();
  return settleDuration(Math.hypot(rect.left - from.x, rect.top - from.y));
}

/**
 * The landing: the rows slide to where the commit put them, and the cluster
 * flies down into those same rows on the same clock. The column the drag came
 * from is the clone's to animate; the other column's copies of the same rows
 * slide like any other row.
 */
function land(
  cluster: DragCluster,
  snapshot: LayoutSnapshot,
  targets: ReadonlyMap<string, LandingTarget>,
  column: DragColumn,
  subtreeIds: ReadonlySet<string>
): void {
  const duration = settleFor(cluster, targets);
  playLayout(snapshot, { duration, skip: { column, ids: subtreeIds } });
  cluster.settle(targets, duration);
}

function timelineScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.timeline-scroll-container');
}

/**
 * Keep the labels column level with the sheet while the drag scrolls it.
 *
 * The column follows the sheet from the scroll event, which arrives a frame
 * after the scroll itself: harmless for a wheel, but an edge scroll moves the
 * sheet every frame, and the two columns would ride a frame — up to a full
 * step of the scroll — apart for as long as it ran. Writing the same transform
 * here, in the frame that scrolled, keeps a row's name beside its bar.
 */
export function syncLabelsToSheet(scroller: HTMLElement): void {
  const labels = columnRoot('labels');
  if (labels) labels.style.transform = `translateY(-${scroller.scrollTop}px)`;
}

/** The bottom of the schedules held under the axis, or 0 when none are. */
export function stickyBandsBottom(): number {
  let bottom = 0;
  document.querySelectorAll<HTMLElement>('[data-drop-sticky]').forEach((band) => {
    bottom = Math.max(bottom, band.getBoundingClientRect().bottom);
  });
  return bottom;
}

/**
 * The labels column's window: under the axis and the held schedules, like the
 * sheet's — a row flying home under them slides beneath them — but open to
 * either side, since a labels drag may cross into the sheet to reach a bar.
 */
export function labelsWindow(): ClipRect | null {
  const sheet = sheetWindow();
  if (!sheet) return null;
  return { ...sheet, left: 0, right: window.innerWidth };
}

/** What of the sheet is on screen: under the axis and the held schedules. */
export function sheetWindow(): ClipRect | null {
  const scroller = timelineScroller();
  if (!scroller) return null;
  const rect = scroller.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.left + scroller.clientWidth,
    top: Math.max(rect.top + HEADER_HEIGHT, stickyBandsBottom()),
    bottom: rect.top + scroller.clientHeight,
  };
}

/**
 * Whether the pointer is over somewhere a drop can mean anything: the sheet
 * for a drag from the sheet, or either column for a drag from the labels —
 * which may cross into the sheet to reach a bar. Above the rows (the date
 * axis) still counts, since leaning on it is how the edge scroll is asked for.
 */
function isOverTimeline(clientX: number, clientY: number, column: DragColumn): boolean {
  const scroller = timelineScroller();
  if (!scroller) return false;
  const rect = scroller.getBoundingClientRect();
  const left = column === 'labels' ? (columnRoot('labels')?.getBoundingClientRect().left ?? rect.left) : rect.left;
  return clientX >= left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/** Px per frame, ramped by how far into the edge zone the pointer has reached. */
export function edgeScrollSpeed(rect: DOMRect, clientX: number): number {
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
 * The same, up and down. The top of the scroller is the date axis, which the
 * rows pass under, so the zone starts below it — a pointer resting on the axis
 * itself is leaning as far into the edge as it can.
 *
 * Schedules held under the axis stand between the two, and they are drop
 * targets: a pointer over one of them is aiming at it, not asking to scroll,
 * so the zone starts under the last of them.
 */
export function edgeScrollSpeedY(rect: DOMRect, clientY: number, bandsBottom = 0): number {
  const axis = rect.top + HEADER_HEIGHT;
  const ratio = (distance: number): number =>
    Math.ceil(Math.min(1, distance / EDGE_SCROLL_ZONE_Y_PX) * EDGE_SCROLL_MAX_Y_PX);
  if (clientY < axis) return -EDGE_SCROLL_MAX_Y_PX;
  // With schedules held under the axis, reaching the lowest of them means
  // passing just under it — a zone there would scroll the band away from
  // the pointer aiming at it. The axis alone scrolls up then.
  if (bandsBottom > axis) {
    if (clientY < rect.bottom - EDGE_SCROLL_ZONE_Y_PX) return 0;
  } else if (clientY < axis + EDGE_SCROLL_ZONE_Y_PX) {
    return -ratio(axis + EDGE_SCROLL_ZONE_Y_PX - clientY);
  }
  if (clientY > rect.bottom - EDGE_SCROLL_ZONE_Y_PX) {
    return ratio(clientY - (rect.bottom - EDGE_SCROLL_ZONE_Y_PX));
  }
  return 0;
}

/**
 * One frame's share of an edge speed, by how long the frame actually took —
 * so a 120 Hz display runs the sheet no faster than a 60 Hz one. `null` is the
 * first frame of a run, which has nothing to measure against and counts as
 * one. Whole pixels, and at least one while there is any speed at all: a
 * sub-pixel write can round away to nothing.
 */
export function edgeScrollStep(speedPerFrame: number, elapsedMs: number | null): number {
  if (speedPerFrame === 0) return 0;
  const frames =
    elapsedMs === null
      ? 1
      : Math.min(EDGE_SCROLL_MAX_FRAMES, Math.max(0, elapsedMs) / EDGE_SCROLL_FRAME_MS);
  return Math.sign(speedPerFrame) * Math.max(1, Math.round(Math.abs(speedPerFrame) * frames));
}

/** Travel, in px, that is still a wobble rather than a change of date. */
export const DATE_DEAD_ZONE_PX = 6;

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
 *
 * A few pixels of sideways drift are a hand re-ordering rows, not one moving
 * dates: at a quarter's zoom a day is two pixels, and without a dead zone the
 * steadiest vertical drag still nudged the item a day or two.
 */
export function dayDeltaForDrop(
  target: DropTarget | null,
  pointerDeltaPx: number,
  pixelsPerDay: number
): number {
  if (pixelsPerDay <= 0 || target?.kind === 'into') return 0;
  if (Math.abs(pointerDeltaPx) < DATE_DEAD_ZONE_PX) return 0;
  return Math.round(pointerDeltaPx / pixelsPerDay);
}

/** Where the dragged item sits right now, among its own siblings. */
export interface DragOrigin {
  readonly sectionId: string;
  readonly parentId: string | null;
  readonly index: number;
  /**
   * The sibling slots that all mean "where it already is". Root milestones
   * have no row, so the edges either side of the item stand for every slot
   * between it and the rows around it; dropping into any of them changes
   * nothing anyone can see. Defaults to just before and just after itself.
   */
  readonly stayFrom?: number;
  readonly stayTo?: number;
}

/**
 * A drop that would put the item back exactly where it is: a slot either
 * side of itself, or onto the group it is already in — reaching your own
 * group is not asking to move.
 */
export function isNoOpSlot(target: DropTarget | null, origin: DragOrigin): boolean {
  if (!target || target.sectionId !== origin.sectionId) return false;
  if (target.kind === 'into') return target.parentId === origin.parentId;
  const from = origin.stayFrom ?? origin.index;
  const to = origin.stayTo ?? origin.index + 1;
  return target.parentId === origin.parentId && target.index >= from && target.index <= to;
}

/** The slots around an item that all leave it where it is. */
export function stayRange(
  siblings: readonly TimelineItem[],
  index: number,
  isRoot: boolean
): { stayFrom: number; stayTo: number } {
  const hasRow = (item: TimelineItem): boolean => !isRoot || item.kind !== 'milestone';
  let stayFrom = index;
  while (stayFrom > 0 && !hasRow(siblings[stayFrom - 1])) stayFrom -= 1;
  let stayTo = index + 1;
  while (stayTo < siblings.length && !hasRow(siblings[stayTo])) stayTo += 1;
  return { stayFrom, stayTo };
}

/**
 * Apply the drop. A drag with nowhere to land still keeps its day shift.
 * Returns whether anything was written: a drop that changes nothing must not
 * cost an undo step or touch the schedule's revision.
 *
 * "Skip weekends" is honoured here and nowhere earlier: the store is not
 * written to until mouseup, so squaring the dates up any sooner would move the
 * bar under a pointer that is still choosing. One delta covers the whole move —
 * the item's end and everything under it travel on the same number of days — so
 * landing the start on a business day cannot stretch or shrink anything.
 */
function commitDrag(
  item: TimelineItem,
  origin: DragOrigin,
  target: DropTarget | null,
  dayDelta: number
): boolean {
  const store = useSectionStore.getState();
  const days = snappedDayDelta(item.start, dayDelta);

  if (!target || isNoOpSlot(target, origin)) {
    if (days === 0) return false;
    store.shiftItem(origin.sectionId, item.id, days);
    return true;
  }

  store.moveItem({
    itemId: item.id,
    fromSectionId: origin.sectionId,
    toSectionId: target.sectionId,
    toParentId: target.parentId,
    toIndex: target.kind === 'into' ? Number.MAX_SAFE_INTEGER : target.index,
    dayDelta: days,
  });
  // The editor and the keyboard address the selection by schedule; a bar that
  // crossed into another one takes its selection with it.
  if (target.sectionId !== origin.sectionId) {
    useUIStore.getState().retargetSelection(item.id, target.sectionId);
  }
  return true;
}

/**
 * The shift a drop actually commits, once "skip weekends" has had its say.
 *
 * A delta of zero is a drop that never asked to move — joining a group, a plain
 * re-order, a drag out of the labels column — and nudging that onto a Monday
 * would be the app rescheduling work nobody touched. Anything else lands its
 * start on a weekday and hands the rest of the move the same delta.
 */
export function snappedDayDelta(start: string, dayDelta: number): number {
  if (dayDelta === 0) return 0;
  const skipWeekends =
    useProjectStore.getState().project?.settings?.skipWeekends ??
    DEFAULT_PROJECT_SETTINGS.skipWeekends;
  if (!skipWeekends) return dayDelta;
  return dayKeyDiff(start, snapKeyToBusinessDay(addDaysToKey(start, dayDelta)));
}

/** What a drag is allowed to land on, beyond the plain geometry. */
export interface DropContext {
  /** Ids in the dragged subtree — none of them may become its own parent. */
  readonly subtreeIds: ReadonlySet<string>;
  /** Reaching the group an item is already in is not asking to move it. */
  readonly currentParentId: string | null;
}

/**
 * Which kind of surface answered — the indicator can differ from the target.
 * `locked` is a surface that refused: letting go there sends the item home,
 * rather than keeping the travel it took to reach the refusal.
 */
export type DropSurface = 'bar' | 'row' | 'header' | 'folded-header' | 'band' | 'body' | 'locked';

export interface ResolvedDrop {
  readonly target: DropTarget | null;
  readonly surface: DropSurface | null;
}

const NOTHING: ResolvedDrop = { target: null, surface: null };
const REFUSED: ResolvedDrop = { target: null, surface: 'locked' };

/** The middle of a label row is its bar; the outer quarters are its edges. */
const LABEL_NEST_BAND = 0.25;

/**
 * What is under the pointer, read straight off the DOM.
 *
 * Hit-testing beats re-deriving row geometry in JS: the rows already know where
 * they are, the preview is `pointer-events: none` so it never occludes them,
 * and the answer stays correct through scrolling, collapsing and zoom. Both
 * columns answer: a row in the labels column is the same row as on the sheet,
 * with its middle standing in for the bar it has no room to draw.
 */
export function resolveDrop(clientX: number, clientY: number, context: DropContext): ResolvedDrop {
  const { subtreeIds, currentParentId } = context;
  const stack = document.elementsFromPoint(clientX, clientY) as HTMLElement[];

  for (const element of stack) {
    const data = element.dataset;

    // A bar takes the item inside it — this is how groups are made. A locked
    // bar takes nothing, and the item's own group is where it already is; both
    // fall through to the row beneath, which offers the slot beside it.
    if (data.dropBar) {
      if (subtreeIds.has(data.dropBar) || !data.dropSection) continue;
      // Its own group: the drop means "where it is", not the slot beside it
      if (data.dropBar === currentParentId) {
        return {
          target: { kind: 'into', sectionId: data.dropSection, parentId: data.dropBar },
          surface: 'bar',
        };
      }
      if (data.dropLocked !== undefined) return REFUSED;
      return {
        target: { kind: 'into', sectionId: data.dropSection, parentId: data.dropBar },
        surface: 'bar',
      };
    }

    // Empty space beside a row places the item next to that row
    if (data.dropRow) {
      const sectionId = data.dropSection;
      if (!sectionId) continue;
      const parentId = data.dropParent || null;
      if (parentId && subtreeIds.has(parentId)) continue;
      const rowId = data.dropRow;
      const index = Number(data.dropIndex ?? 0);
      const rect = element.getBoundingClientRect();
      const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
      const canNest = !subtreeIds.has(rowId) && data.dropInto === rowId;

      if (canNest && fraction > LABEL_NEST_BAND && fraction < 1 - LABEL_NEST_BAND) {
        return { target: { kind: 'into', sectionId, parentId: rowId }, surface: 'row' };
      }

      // The lower half of an open group is the edge between it and its first
      // child, so that is the slot it offers: first in the group. "After the
      // group" belongs to the row that follows the group's last descendant.
      if (fraction >= 0.5 && data.dropExpanded !== undefined && !subtreeIds.has(rowId)) {
        if (data.dropIntoLocked !== undefined) return REFUSED;
        return {
          target: { kind: 'slot', sectionId, parentId: rowId, index: 0 },
          surface: 'row',
        };
      }

      if (data.dropSlotLocked !== undefined) return REFUSED;
      return {
        target: {
          kind: 'slot',
          sectionId,
          parentId,
          index: fraction >= 0.5 ? index + 1 : index,
        },
        surface: 'row',
      };
    }

    // A schedule's own row, and the open space under its items
    if (data.dropHeader) {
      if (data.dropSlotLocked !== undefined) return REFUSED;
      const surface: DropSurface =
        data.dropSticky !== undefined
          ? 'band'
          : data.dropCollapsed !== undefined
            ? 'folded-header'
            : 'header';
      return {
        target: { kind: 'slot', sectionId: data.dropHeader, parentId: null, index: 0 },
        surface,
      };
    }

    if (data.dropBody) {
      if (data.dropSlotLocked !== undefined) return REFUSED;
      return {
        target: {
          kind: 'slot',
          sectionId: data.dropBody,
          parentId: null,
          index: Number(data.dropCount ?? 0),
        },
        surface: 'body',
      };
    }
  }

  return NOTHING;
}

/**
 * What the sheet should show for a drop, which is not always the drop itself.
 *
 * A slot that changes nothing shows nothing. A milestone headed for the root
 * prints on its schedule's own row, so that row is what lights up — a line
 * between two bars would promise a place it is never going to stand. And a
 * drop on a folded schedule, or on the band that holds one under the axis, has
 * no rows on screen to draw a line beside, so the schedule's row answers.
 */
export function dropIndicatorKey(
  resolved: ResolvedDrop,
  kind: TimelineItem['kind'],
  origin: DragOrigin
): string | null {
  const { target, surface } = resolved;
  if (!target || isNoOpSlot(target, origin)) return null;
  if (target.kind === 'into') return dropTargetKey(target);
  if (target.parentId === null && kind === 'milestone') return `header:${target.sectionId}`;
  if (surface === 'band' || surface === 'folded-header') return `header:${target.sectionId}`;
  return dropTargetKey(target);
}
