import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { PHASE_COLORS } from '../../../constants/colors';
import {
  createDragCluster,
  finishDragMotion,
  settleDuration,
  type DragCluster,
  type LandingTarget,
} from '../../../utils/dragCluster';
import { WalkthroughFrame } from './WalkthroughFrame';
import { WalkthroughSheet, SheetLabel, SheetRow, SheetBar } from './WalkthroughSheet';
import { SHEET_DAYS, createSheetWindow } from './sheetWindow';
import { hasTravelled } from './gestures';

const PARENT = {
  dropId: 'parent',
  name: 'Tooling',
  color: PHASE_COLORS.orange,
  from: 8 / SHEET_DAYS,
  to: 58 / SHEET_DAYS,
};
const CHILD = {
  id: 'samples',
  name: 'Samples',
  color: PHASE_COLORS.ochre,
  from: 34 / SHEET_DAYS,
  to: 68 / SHEET_DAYS,
};

/**
 * The breath between the two beats of a drop: the bar has landed, and only
 * then does its ink change hands. Short, because the landing itself already
 * took the time the row needed to settle.
 */
const INK_BEAT_MS = 60;

type Stage = 'waiting' | 'dragging' | 'grouped';

interface GroupLessonProps {
  readonly onDone: () => void;
}

/** One press on the bar, from the moment it lands to the moment it is answered. */
interface Gesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** Where on the bar it was taken, so the same spot stays under the pointer. */
  readonly grabX: number;
  readonly grabY: number;
  /** Where the pointer was last seen, for asking again when the sheet moves under it. */
  lastX: number;
  lastY: number;
  /** Null until the press has travelled far enough to be a drag. */
  cluster: DragCluster | null;
  /** Lets go of the pointer and every listener the press added. */
  end: () => void;
}

/**
 * Whether a release here would land on the parent.
 *
 * Asked of the sheet itself, as the real drag asks it, and asked again at the
 * moment of release rather than trusted from the last move: a pointer can come
 * up somewhere it never moved to. The clone is `pointer-events: none`, so it
 * never stands between the pointer and the bar under it.
 */
function isOverParent(clientX: number, clientY: number): boolean {
  return document
    .elementsFromPoint(clientX, clientY)
    .some((el) => el.getAttribute('data-drop-bar') === PARENT.dropId);
}

/**
 * Lesson two: a bar dropped on a bar joins it.
 *
 * The second and last gesture with no affordance. There is deliberately no
 * "add child" button anywhere in FLOID, so nothing on the sheet says a bar
 * will take one — which makes this the only thing a person could use the app
 * for months without finding.
 *
 * The drag is the app's own, not a picture of it: the same clone lifted off
 * the sheet (`createDragCluster`), the same four-pixel threshold before a press
 * becomes a drag, the same drained outline left in the row, and the same
 * landing — the clone flies down into the place the bar now occupies and hands
 * over to it there, so the bar is never seen to vanish or to reappear. A drag
 * that misses, or is called off with Escape, flies home the same way.
 *
 * The drop is where the rule is taught, and it is taught by movement rather
 * than by a sentence: the row settles in under its new parent, indented and
 * shorter, with the clone coming down into it, and only once it has arrived
 * does its ink change hands. Two beats, never overlapping — overlapping beats
 * read as a figure playing at you, sequenced ones read as things happening.
 * Losing the colour is the whole point, since joining a parent is what clears
 * an item's own colour in the store too; the name survives it, because a bar
 * is layers and only the fill changed.
 *
 * Everything else about grouping is true and cut. Carrying the parent carries
 * its children; dragging back out un-groups. Both are a third idea on a
 * two-idea screen, and both are one gesture away from being found.
 */
export function GroupLesson({ onDone }: GroupLessonProps): ReactElement {
  const sheet = useMemo(createSheetWindow, []);
  const rowRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const inkTimer = useRef<number>();
  /** True while a clone is still on its way down. */
  const isLandingRef = useRef(false);
  const isMountedRef = useRef(true);

  const [stage, setStage] = useState<Stage>('waiting');
  const [isOver, setIsOver] = useState(false);
  const [wasNudged, setWasNudged] = useState(false);
  /** The invitation stops the first time the bar is picked up, for good. */
  const [hasLifted, setHasLifted] = useState(false);
  /** Beat two: the ink changes hands once the bar has landed. */
  const [hasParentInk, setHasParentInk] = useState(false);

  /**
   * Bring the clone down onto the bar, wherever the bar now is.
   *
   * The target is the bar element itself. React keeps the same node through
   * the drop, so on a hit it is already easing into its nested row when the
   * landing begins, and the landing chases it there; on a miss it is still in
   * the row it left. Either way the bar is held unseen under
   * `[data-drag-landing]` until the clone is on top of it.
   */
  const land = useCallback((cluster: DragCluster, onLanded?: () => void): void => {
    const resolve = (): HTMLElement | null => barRef.current;
    const element = resolve();
    const from = cluster.leaderPosition();
    const rect = element?.getBoundingClientRect();
    const duration = rect ? settleDuration(Math.hypot(rect.left - from.x, rect.top - from.y)) : 0;
    const targets = new Map<string, LandingTarget>([[CHILD.id, { mode: 'exact', resolve }]]);
    isLandingRef.current = true;
    cluster.settle(targets, duration, () => {
      isLandingRef.current = false;
      if (isMountedRef.current) onLanded?.();
    });
  }, []);

  /** A drop on the parent: the row moves in under it, and the clone follows it there. */
  const group = useCallback(
    (cluster: DragCluster): void => {
      // The DOM has to be in its new shape before the landing measures it
      flushSync(() => {
        setStage('grouped');
        setIsOver(false);
      });
      land(cluster, () => {
        inkTimer.current = window.setTimeout(() => setHasParentInk(true), INK_BEAT_MS);
      });
    },
    [land]
  );

  /**
   * A drag that did not take goes back where it came from. Nothing changed on
   * the sheet, so the bar is still in its row and the clone simply returns to
   * it — the person sees the bar go home rather than reappear there.
   */
  const goHome = useCallback(
    (cluster: DragCluster, isMiss: boolean): void => {
      flushSync(() => {
        setStage('waiting');
        setIsOver(false);
        if (isMiss) setWasNudged(true);
      });
      land(cluster);
    },
    [land]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const row = rowRef.current;
      // A control-click is a right-click on a Mac, as `useItemDrag` reads it:
      // the menu's press, not the start of a drag.
      if (e.button !== 0 || e.ctrlKey || gestureRef.current || !row) return;
      const bar = e.currentTarget;

      // A landing still in flight belongs to the last gesture. This one starts
      // from the sheet as it will be, not from halfway through settling.
      finishDragMotion();
      // No text selection, no native drag image: this press is ours.
      e.preventDefault();

      const rect = bar.getBoundingClientRect();
      const gesture: Gesture = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        lastX: e.clientX,
        lastY: e.clientY,
        cluster: null,
        end: () => undefined,
      };

      /**
       * Picked up. The bar is drained before it is cloned so the clone does
       * not carry the invitation's breath with it; the clone sheds the drained
       * state on its own, so it still leaves in full ink.
       */
      const lift = (): DragCluster => {
        flushSync(() => {
          setStage('dragging');
          setHasLifted(true);
        });
        document.body.classList.add('dragging-item');
        return createDragCluster({ id: CHILD.id, element: bar }, [], 'plot');
      };

      /**
       * Called off — Escape, the system taking the pointer away, the window
       * losing focus. Never a drop: whatever was under the pointer, the bar
       * goes home.
       */
      const abandon = (): void => {
        const { cluster } = gesture;
        gesture.end();
        if (cluster) goHome(cluster, false);
      };

      /** Over the parent or not, asked of wherever the pointer was last seen. */
      const track = (): void => {
        const over = isOverParent(gesture.lastX, gesture.lastY);
        setIsOver((was) => (was === over ? was : over));
      };

      const handleMove = (me: PointerEvent): void => {
        if (me.pointerId !== gesture.pointerId) return;
        // No button held means the release happened somewhere this page was
        // never told about — another window, a system gesture — as the app's
        // own draw reads it. Without this the clone would go on following a
        // hover that is no longer holding anything.
        if (me.buttons === 0) {
          abandon();
          return;
        }
        gesture.lastX = me.clientX;
        gesture.lastY = me.clientY;
        if (!gesture.cluster) {
          if (!hasTravelled(me.clientX - gesture.startX, me.clientY - gesture.startY)) return;
          gesture.cluster = lift();
        }
        // Written straight to the clone: sixty moves a second and none of them
        // re-renders a row. Only the answer to "over the parent?" reaches React.
        gesture.cluster.moveTo(me.clientX - gesture.grabX, me.clientY - gesture.grabY);
        track();
      };

      const handleUp = (me: PointerEvent): void => {
        if (me.pointerId !== gesture.pointerId) return;
        const { cluster } = gesture;
        gesture.end();
        // A press that never travelled is a click. Nothing was lifted, so
        // there is nothing to put back and nothing to call a miss.
        if (!cluster) return;
        if (isOverParent(me.clientX, me.clientY)) group(cluster);
        else goHome(cluster, true);
      };

      const handleCancel = (pe: PointerEvent): void => {
        if (pe.pointerId === gesture.pointerId) abandon();
      };

      // The drag owns this Escape once something is in the hand, so nothing
      // behind it — the app's own shortcuts — answers the same press.
      const handleKey = (ke: KeyboardEvent): void => {
        if (ke.key !== 'Escape') return;
        if (gesture.cluster) {
          ke.preventDefault();
          ke.stopPropagation();
        }
        abandon();
      };

      // The release will land in another window, if it is reported at all
      const handleBlur = (): void => abandon();
      const handleVisibility = (): void => {
        if (document.visibilityState === 'hidden') abandon();
      };

      // A wheel moves the lesson under a pointer that has not moved, and what
      // is under the pointer changes all the same.
      const handleScroll = (): void => {
        if (gesture.cluster) track();
      };

      gesture.end = (): void => {
        if (gestureRef.current !== gesture) return;
        gestureRef.current = null;
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleCancel);
        row.removeEventListener('lostpointercapture', handleCancel);
        window.removeEventListener('keydown', handleKey, true);
        window.removeEventListener('blur', handleBlur);
        document.removeEventListener('visibilitychange', handleVisibility);
        document.removeEventListener('scroll', handleScroll, true);
        if (row.hasPointerCapture?.(gesture.pointerId)) {
          row.releasePointerCapture(gesture.pointerId);
        }
        document.body.classList.remove('dragging-item');
      };

      gestureRef.current = gesture;
      // Captured on the row rather than on the bar. A captured element is
      // given `:hover`, and a bar holding `:hover` for the whole drag would
      // sit at hover ink instead of draining. Captured events still bubble, so
      // the document listeners hear every one of them, wherever the pointer
      // goes.
      row.setPointerCapture?.(e.pointerId);
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleCancel);
      // Capture lost without a pointerup — the row unmounted, the window lost
      // the pointer — is a gesture taken away, not a drop.
      row.addEventListener('lostpointercapture', handleCancel);
      // Capture phase, on the window: the first to hear Escape
      window.addEventListener('keydown', handleKey, true);
      window.addEventListener('blur', handleBlur);
      document.addEventListener('visibilitychange', handleVisibility);
      // Scroll does not bubble; the capture phase hears every scroller's
      document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    },
    [group, goHome]
  );

  // Leaving mid-gesture takes everything the gesture put on the page with it.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      window.clearTimeout(inkTimer.current);
      const gesture = gestureRef.current;
      if (gesture) {
        gesture.cluster?.destroy();
        gesture.end();
      }
      if (isLandingRef.current) finishDragMotion();
    };
  }, []);

  const isGrouped = stage === 'grouped';
  const childColor = hasParentInk ? PARENT.color : CHILD.color;

  const line = isGrouped
    ? `${CHILD.name} is inside ${PARENT.name}.`
    : stage === 'dragging'
      ? isOver
        ? 'Let go.'
        : `Onto ${PARENT.name}.`
      : wasNudged
        ? `Land it on ${PARENT.name} itself.`
        : `Drag ${CHILD.name} onto ${PARENT.name}.`;

  return (
    <WalkthroughFrame line={line} onContinue={isGrouped ? onDone : undefined}>
      <WalkthroughSheet
        sheet={sheet}
        labels={
          <>
            <SheetLabel name="Engineering" isSchedule />
            <SheetLabel name={PARENT.name} hasChildren={isGrouped} />
            <SheetLabel
              name={CHILD.name}
              depth={isGrouped ? 1 : 0}
              isLifted={stage === 'dragging'}
            />
          </>
        }
      >
        <SheetRow />
        <SheetRow>
          <SheetBar
            dropId={PARENT.dropId}
            from={PARENT.from}
            to={PARENT.to}
            color={PARENT.color}
            name={PARENT.name}
            isReceiving={isOver}
          />
        </SheetRow>
        <SheetRow depth={isGrouped ? 1 : 0}>
          <div ref={rowRef} className="absolute inset-0">
            <SheetBar
              ref={barRef}
              from={CHILD.from}
              to={CHILD.to}
              color={childColor}
              name={CHILD.name}
              depth={isGrouped ? 1 : 0}
              isInviting={stage === 'waiting' && !hasLifted}
              isLifted={stage === 'dragging'}
              onPointerDown={stage === 'waiting' ? handlePointerDown : undefined}
            />
          </div>
        </SheetRow>
      </WalkthroughSheet>
    </WalkthroughFrame>
  );
}
