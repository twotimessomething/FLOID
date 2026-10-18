import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Section } from '../types';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import {
  createDragCluster,
  finishDragMotion,
  settleDuration,
  type ClusterSource,
  type DragCluster,
  type LandingTarget,
} from '../utils/dragCluster';
import { captureLayout, playLayout } from '../utils/layoutFlip';
import { columnRoot, findScheduleLabel } from '../utils/dragLanding';
import {
  edgeScrollSpeedY,
  labelsWindow,
  stickyBandsBottom,
  syncLabelsToSheet,
} from './useItemDrag';

/**
 * Reordering schedules by their grip.
 *
 * The same bargain an item drag strikes, one level up. The schedule's names —
 * its own row and every row under it — lift off the labels column as one
 * card, drawn in a little, and follow the pointer straight up and down; the
 * schedule left behind drains in both columns. A single line between two
 * schedules says where it will go, measured against the schedules' real
 * heights. Nothing is written until the drop; then every schedule slides into
 * the new order and the card settles into the one that moved.
 */

/** Movement, in px, before a press on the grip becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

interface ScheduleDragSession {
  readonly sectionId: string;
  readonly pointerId: number;
  readonly startY: number;
  active: boolean;
  /** The pointer has left both columns: letting go there changes nothing. */
  isOutside: boolean;
  cluster: DragCluster | null;
  sources: ClusterSource[];
  grabOffsetY: number;
  leaderX: number;
  pointerX: number;
  pointerY: number;
  /** Where in the order of the *other* schedules this one would go. */
  insertAt: number;
  /** Its own place in that order — dropping there changes nothing. */
  ownIndex: number;
  edgeArmed: boolean;
  scrollFrame: number | null;
  cleanup: () => void;
}

interface UseScheduleDragResult {
  /** The schedule in the hand, so both of its columns can drain. */
  readonly draggingId: string | null;
  readonly startScheduleDrag: (event: React.PointerEvent, sectionId: string) => void;
  /** The insertion lines, one per column. Written to directly while dragging. */
  readonly labelsLineRef: React.RefObject<HTMLDivElement>;
  readonly plotLineRef: React.RefObject<HTMLDivElement>;
}

function timelineScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.timeline-scroll-container');
}

/** Over the labels column or the sheet — anywhere a schedule can be put down. */
function isOverColumns(clientX: number, clientY: number): boolean {
  const scroller = timelineScroller();
  if (!scroller) return false;
  const rect = scroller.getBoundingClientRect();
  const left = columnRoot('labels')?.getBoundingClientRect().left ?? rect.left;
  return clientX >= left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function scheduleBlock(column: 'labels' | 'plot', sectionId: string): HTMLElement | null {
  return (
    columnRoot(column)?.querySelector<HTMLElement>(
      `[data-flip-section="${CSS.escape(sectionId)}"]`
    ) ?? null
  );
}

/**
 * Where among the other schedules a pointer at this height puts the one being
 * dragged: past the middle of a schedule is after it. Measured on the page, so
 * a schedule of forty rows takes as much travel to pass as it is tall.
 */
export function insertionIndex(
  pointerY: number,
  others: readonly { readonly top: number; readonly height: number }[]
): number {
  let index = 0;
  others.forEach((block, position) => {
    if (pointerY > block.top + block.height / 2) index = position + 1;
  });
  return index;
}

/**
 * The drop as `reorderSections` wants it: indices into the full list, pinned
 * schedule included, with the target counted after the source is removed.
 */
export function reorderIndices(
  all: readonly Pick<Section, 'id'>[],
  visible: readonly Pick<Section, 'id'>[],
  draggedId: string,
  insertAt: number
): { from: number; to: number } | null {
  const from = all.findIndex((section) => section.id === draggedId);
  if (from < 0) return null;
  const others = visible.filter((section) => section.id !== draggedId);
  const rest = all.filter((section) => section.id !== draggedId);
  if (others.length === 0) return null;
  const to =
    insertAt < others.length
      ? rest.findIndex((section) => section.id === others[insertAt].id)
      : rest.findIndex((section) => section.id === others[others.length - 1].id) + 1;
  if (to < 0) return null;
  return { from, to };
}

export function useScheduleDrag(visibleSections: readonly Section[]): UseScheduleDragResult {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const labelsLineRef = useRef<HTMLDivElement>(null);
  const plotLineRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ScheduleDragSession | null>(null);
  // Read at the drop, not captured at the press: the list the drop lands in
  // is the one on screen when the pointer comes up.
  const visibleRef = useRef(visibleSections);
  visibleRef.current = visibleSections;

  useEffect(() => () => sessionRef.current?.cleanup(), []);

  const startScheduleDrag = useCallback((event: React.PointerEvent, sectionId: string): void => {
    if (event.button !== 0 || event.ctrlKey || sessionRef.current) return;
    if (useUIStore.getState().isDragging) return;
    event.preventDefault();
    event.stopPropagation();

    // The schedule's name row as it is drawn now — perhaps still sliding from
    // the last drop. The grab is measured against what was pressed.
    const pressedRect = findScheduleLabel(sectionId)?.getBoundingClientRect() ?? null;
    finishDragMotion();
    // Claimed from the press: nothing else moves the sheet until this ends
    useUIStore.getState().setDragging(true, 'move');

    const grip = event.currentTarget as HTMLElement;
    grip.setPointerCapture?.(event.pointerId);

    const session: ScheduleDragSession = {
      sectionId,
      pointerId: event.pointerId,
      startY: event.clientY,
      active: false,
      isOutside: false,
      cluster: null,
      sources: [],
      grabOffsetY: 0,
      leaderX: 0,
      pointerX: event.clientX,
      pointerY: event.clientY,
      insertAt: 0,
      ownIndex: 0,
      edgeArmed: false,
      scrollFrame: null,
      cleanup: () => undefined,
    };

    const others = (): Section[] =>
      visibleRef.current.filter((section) => section.id !== sectionId);

    const hideLines = (): void => {
      [labelsLineRef.current, plotLineRef.current].forEach((line) => {
        line?.classList.remove('is-visible');
      });
    };

    /**
     * Put a column's line on the boundary the drop would take. Shown from
     * hidden, it appears in place; moved while shown, it glides there.
     */
    const placeLine = (
      line: HTMLDivElement | null,
      column: 'labels' | 'plot',
      insertAt: number
    ): void => {
      const list = others();
      if (!line || list.length === 0) return;
      const anchor =
        insertAt < list.length
          ? scheduleBlock(column, list[insertAt].id)
          : scheduleBlock(column, list[list.length - 1].id);
      const container = line.offsetParent as HTMLElement | null;
      if (!anchor || !container) return;
      const rect = anchor.getBoundingClientRect();
      const y = (insertAt < list.length ? rect.top : rect.bottom) - container.getBoundingClientRect().top;
      const wasVisible = line.classList.contains('is-visible');
      if (!wasVisible) line.style.transition = 'opacity var(--duration-fast) linear';
      line.style.transform = `translateY(${y}px)`;
      if (!wasVisible) {
        void line.offsetHeight;
        line.style.transition = '';
        line.classList.add('is-visible');
      }
    };

    const render = (): void => {
      const cluster = session.cluster;
      if (!cluster) return;
      cluster.moveTo(session.leaderX, session.pointerY - session.grabOffsetY);

      session.isOutside = !isOverColumns(session.pointerX, session.pointerY);
      if (session.isOutside) {
        hideLines();
        return;
      }

      const blocks = others()
        .map((section) => scheduleBlock('labels', section.id)?.getBoundingClientRect())
        .map((rect) => ({ top: rect?.top ?? 0, height: rect?.height ?? 0 }));
      const insertAt = insertionIndex(session.pointerY, blocks);
      session.insertAt = insertAt;
      if (insertAt === session.ownIndex) {
        hideLines();
        return;
      }
      placeLine(labelsLineRef.current, 'labels', insertAt);
      placeLine(plotLineRef.current, 'plot', insertAt);
    };

    const activate = (): void => {
      const leader = findScheduleLabel(sectionId);
      const block = scheduleBlock('labels', sectionId);
      if (!leader || !block) return;
      session.active = true;
      const followers = Array.from(block.querySelectorAll<HTMLElement>('[data-drag-item]')).map(
        (element) => ({ id: element.dataset.dragItem ?? '', element })
      );
      session.sources = [{ id: `section:${sectionId}`, element: leader }, ...followers];
      const rect = pressedRect ?? leader.getBoundingClientRect();
      session.grabOffsetY = session.startY - rect.top;
      session.leaderX = leader.getBoundingClientRect().left;
      session.ownIndex = visibleRef.current.findIndex((section) => section.id === sectionId);
      session.insertAt = session.ownIndex;
      session.cluster = createDragCluster(session.sources[0], followers, 'labels', {
        clip: labelsWindow,
      });
      setDraggingId(sectionId);
      useUIStore.getState().closeContextMenu();
      document.body.classList.add('no-select', 'dragging-item');
    };

    const edgeScrollTick = (): void => {
      const scroller = timelineScroller();
      if (!scroller || !session.active) {
        session.scrollFrame = null;
        return;
      }
      const raw = edgeScrollSpeedY(
        scroller.getBoundingClientRect(),
        session.pointerY,
        stickyBandsBottom()
      );
      if (raw === 0) session.edgeArmed = true;
      const speed = session.edgeArmed ? raw : 0;
      if (speed === 0) {
        session.scrollFrame = null;
        return;
      }
      const before = scroller.scrollTop;
      scroller.scrollTop = before + speed;
      if (scroller.scrollTop !== before) {
        syncLabelsToSheet(scroller);
        render();
      }
      session.scrollFrame = requestAnimationFrame(edgeScrollTick);
    };

    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== session.pointerId) return;
      // A release the page never heard: the card goes home
      if (moveEvent.buttons === 0) {
        abandon();
        return;
      }
      session.pointerX = moveEvent.clientX;
      session.pointerY = moveEvent.clientY;
      if (!session.active) {
        if (Math.abs(moveEvent.clientY - session.startY) < DRAG_THRESHOLD_PX) return;
        activate();
        if (!session.active) return;
      }
      if (session.scrollFrame === null) {
        session.scrollFrame = requestAnimationFrame(edgeScrollTick);
      }
      render();
    };

    /**
     * The captured grip is where the trailing click lands, and that click
     * bubbles to the schedule's row, which would open its editor over the
     * drop. A drag is not a click; swallow the one it leaves behind.
     */
    const swallowNextClick = (): void => {
      const swallow = (clickEvent: MouseEvent): void => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    };

    /**
     * A drag called off before the button came up still owes its release a
     * swallowed click — the grip keeps the capture, so that release lands on
     * the grip and its click would open the editor. Only a click on the grip
     * is swallowed: if the release happened off the page, the next click
     * anywhere else is the user's own.
     */
    const swallowClickAfterRelease = (): void => {
      const arm = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId !== session.pointerId) return;
        window.removeEventListener('pointerup', arm, true);
        const swallow = (clickEvent: MouseEvent): void => {
          if (clickEvent.target instanceof Node && grip.contains(clickEvent.target)) {
            clickEvent.stopPropagation();
            clickEvent.preventDefault();
          }
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      };
      window.addEventListener('pointerup', arm, true);
    };

    const settleHome = (cluster: DragCluster): void => {
      flushSync(() => setDraggingId(null));
      const targets = new Map<string, LandingTarget>();
      session.sources.forEach(({ id, element }) => {
        targets.set(id, { mode: 'exact', resolve: () => (element.isConnected ? element : null) });
      });
      cluster.settle(targets, settleDuration(0));
    };

    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== session.pointerId) return;
      const cluster = session.cluster;
      const wasActive = session.active;
      session.cluster = null;
      session.cleanup();
      if (!wasActive || !cluster) return;
      swallowNextClick();

      const store = useSectionStore.getState();
      const indices =
        session.isOutside || session.insertAt === session.ownIndex
          ? null
          : reorderIndices(store.sections, visibleRef.current, sectionId, session.insertAt);
      if (!indices) {
        settleHome(cluster);
        return;
      }

      const snapshot = captureLayout();
      const targets = new Map<string, LandingTarget>();
      session.sources.forEach(({ id }) => {
        targets.set(id, {
          mode: 'exact',
          resolve: () =>
            id.startsWith('section:')
              ? findScheduleLabel(sectionId)
              : (scheduleBlock('labels', sectionId)?.querySelector<HTMLElement>(
                  `[data-drag-item="${CSS.escape(id)}"]`
                ) ?? null),
        });
      });
      try {
        flushSync(() => {
          store.reorderSections(indices.from, indices.to);
          setDraggingId(null);
        });
      } finally {
        const landed = findScheduleLabel(sectionId)?.getBoundingClientRect();
        const from = cluster.leaderPosition();
        const duration = settleDuration(
          landed ? Math.hypot(landed.left - from.x, landed.top - from.y) : 0
        );
        playLayout(snapshot, {
          duration,
          skip: { column: 'labels', ids: new Set(session.sources.map(({ id }) => id)) },
        });
        cluster.settle(targets, duration);
      }
    };

    /** Called off — Escape, a cancelled pointer, the window losing focus. */
    const abandon = (): void => {
      const cluster = session.cluster;
      const wasActive = session.active;
      session.cluster = null;
      session.cleanup();
      if (wasActive && cluster) {
        swallowClickAfterRelease();
        settleHome(cluster);
      }
    };

    const onCancel = (cancelEvent: PointerEvent): void => {
      if (cancelEvent.pointerId === session.pointerId) abandon();
    };

    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      abandon();
    };

    const onBlur = (): void => abandon();
    const onScroll = (): void => {
      if (session.active) render();
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
      hideLines();
      session.cluster?.destroy();
      session.cluster = null;
      useUIStore.getState().setDragging(false);
      if (session.active) document.body.classList.remove('no-select', 'dragging-item');
    };

    sessionRef.current = session;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    timelineScroller()?.addEventListener('scroll', onScroll, { passive: true });
  }, []);

  return { draggingId, startScheduleDrag, labelsLineRef, plotLineRef };
}
