import { useRef, useCallback, useEffect, useState } from 'react';
import {
  createVelocityTracker,
  startMomentumGlide,
  type Glide,
} from '../utils/momentum';
import {
  bounceDistance,
  bounceOverscroll,
  rubberBandOffset,
  settleOverscroll,
  spendAgainstPull,
  type OverscrollAnimation,
} from '../utils/rubberBand';

const PAN_THRESHOLD = 3;

interface UseTimelinePanOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Move the sheet horizontally past where it can scroll. Positive reveals air
   * before the first day, negative reveals air after the last.
   */
  applyOverscroll: (offset: number) => void;
}

interface UseTimelinePanReturn {
  isPanning: boolean;
}

/**
 * Dragging the sheet around, and letting go of it.
 *
 * The drag itself is 1:1 — the paper stays under the cursor for the whole
 * gesture. Release is where the physics starts: the sheet keeps the speed it
 * was thrown at and coasts down, so a long timeline can be crossed with a flick
 * instead of a series of drags. Anything the user does next stops the coast
 * where it stands, which is the only thing that makes it feel like an object
 * rather than a cutscene.
 *
 * Both ends of the timeline answer past their limit rather than stopping dead.
 * Pull is kept in raw gesture pixels and converted through the resistance curve
 * on the way to the screen, which is what lets a drag back out unwind exactly
 * the distance the drag in wound up.
 *
 * Only the time axis does this. Vertically the sheet is a list of schedules
 * with no ends worth dramatising, and the axis at the top would have to be
 * counter-moved to stay pinned — a lot of machinery for a bounce nobody is
 * looking for. `overscroll-behavior: none` keeps the browser out of it there.
 */
export function useTimelinePan({
  containerRef,
  applyOverscroll,
}: UseTimelinePanOptions): UseTimelinePanReturn {
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const pendingRef = useRef<{ startX: number; startY: number } | null>(null);
  const didPanRef = useRef(false);
  /** A press-time context menu, held until release decides pan or click. */
  const deferredMenuRef = useRef<{ target: Element; x: number; y: number } | null>(null);
  const trackerRef = useRef(createVelocityTracker());
  const glideRef = useRef<Glide | null>(null);
  /** Unspent gesture travel at the end of the sheet, in pointer px. */
  const pullRef = useRef(0);
  const overscrollAnimationRef = useRef<OverscrollAnimation | null>(null);

  // Latest painter for the listeners, which outlive any one render
  const applyOverscrollRef = useRef(applyOverscroll);
  applyOverscrollRef.current = applyOverscroll;

  /** Push the current pull through the resistance curve and onto the screen. */
  const paintPull = useCallback((): void => {
    const el = containerRef.current;
    if (!el) return;
    applyOverscrollRef.current(-rubberBandOffset(pullRef.current, el.clientWidth));
  }, [containerRef]);

  const stopOverscrollAnimation = useCallback((): void => {
    overscrollAnimationRef.current?.cancel();
    overscrollAnimationRef.current = null;
  }, []);

  /** Drop any stretch immediately — for a gesture that is taking over. */
  const releasePull = useCallback((): void => {
    stopOverscrollAnimation();
    if (pullRef.current === 0) return;
    pullRef.current = 0;
    applyOverscrollRef.current(0);
  }, [stopOverscrollAnimation]);

  const stopGlide = useCallback((): void => {
    glideRef.current?.cancel();
    glideRef.current = null;
  }, []);

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      stopGlide();
      stopOverscrollAnimation();
      isPanningRef.current = true;
      setIsPanning(true);
      lastPosRef.current = { x: clientX, y: clientY };
      trackerRef.current.reset(clientX, clientY);
    },
    [stopGlide, stopOverscrollAnimation]
  );

  /**
   * Which presses belong to the sheet, decided from the event rather than from
   * a ref.
   *
   * The scroll container is not in the tree on the first render — the timeline
   * only appears once a project has finished loading — so an effect that reads
   * `containerRef.current` once binds to nothing and never runs again. Listening
   * on the document and asking the target where it lives has no such ordering to
   * get wrong, and matches how the item drag already finds the same element.
   */
  useEffect(() => {
    const isOnSheet = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('.timeline-scroll-container') !== null;

    const handlePointerDownCapture = (e: PointerEvent): void => {
      if (!isOnSheet(e.target)) return;

      // Any approach to a sliding sheet stops it where it stands: the user is
      // reaching for something, not watching it
      stopGlide();
      releasePull();

      if (e.button === 1) {
        // Middle button: immediate pan
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.add('no-select');
        startPan(e.clientX, e.clientY);
        return;
      }

      if (e.button === 2) {
        // Right button: pending — becomes pan on movement, contextmenu otherwise
        pendingRef.current = { startX: e.clientX, startY: e.clientY };
        didPanRef.current = false;
        deferredMenuRef.current = null;
      }
    };

    /**
     * When the menu is raised decides nothing here; who raised it does.
     *
     * macOS raises `contextmenu` at the press, before a drag has had any chance
     * to declare itself — so a menu arriving while the press is still pending
     * is held, and released (or discarded) by the pointerup below. Windows
     * raises it after release; that path arrives with nothing pending and
     * passes straight through, or is caught by the one-shot suppressor a
     * finished pan installs. The re-dispatch is not `isTrusted`, which is what
     * lets it back past this same handler.
     */
    const handleContextMenuCapture = (e: MouseEvent): void => {
      if (!e.isTrusted || !isOnSheet(e.target)) return;

      if (isPanningRef.current || didPanRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (pendingRef.current && e.target instanceof Element) {
        e.preventDefault();
        e.stopPropagation();
        deferredMenuRef.current = { target: e.target, x: e.clientX, y: e.clientY };
      }
    };

    const handleWheelCapture = (e: WheelEvent): void => {
      if (!isOnSheet(e.target)) return;
      stopGlide();
      releasePull();
    };

    document.addEventListener('pointerdown', handlePointerDownCapture, true);
    document.addEventListener('contextmenu', handleContextMenuCapture, true);
    document.addEventListener('wheel', handleWheelCapture, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownCapture, true);
      document.removeEventListener('contextmenu', handleContextMenuCapture, true);
      document.removeEventListener('wheel', handleWheelCapture, true);
    };
  }, [startPan, stopGlide, releasePull]);

  // Stop a coast that outlives the component
  useEffect(() => {
    return () => {
      stopGlide();
      stopOverscrollAnimation();
    };
  }, [stopGlide, stopOverscrollAnimation]);

  // Document-level pointermove/pointerup for pan + contextmenu suppression
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent): void => {
      if (pendingRef.current) {
        const dx = e.clientX - pendingRef.current.startX;
        const dy = e.clientY - pendingRef.current.startY;
        if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
          document.body.classList.add('no-select');
          startPan(e.clientX, e.clientY);
          didPanRef.current = true;
          pendingRef.current = null;
        }
        return;
      }

      const el = containerRef.current;
      if (!isPanningRef.current || !el) return;

      // The sheet travels opposite to the cursor, which is why these are
      // subtracted: dragging left reveals what is to the right of the sheet.
      pullRef.current = spendAgainstPull(
        pullRef.current,
        lastPosRef.current.x - e.clientX,
        (amount) => {
          const before = el.scrollLeft;
          el.scrollLeft = before + amount;
          const applied = el.scrollLeft - before;
          // `scrollLeft` quantizes to device pixels, so a fractional pointer
          // delta always comes back a hair short. That shortfall is rounding,
          // not the end of the sheet — and once it leaks into the pull, every
          // same-direction move after it feeds the rubber band instead of the
          // scroll and the pan freezes mid-drag. The glide below tolerates the
          // same pixel for the same reason.
          return Math.abs(amount - applied) < 1 ? amount : applied;
        }
      );
      el.scrollTop -= e.clientY - lastPosRef.current.y;
      paintPull();

      lastPosRef.current = { x: e.clientX, y: e.clientY };
      trackerRef.current.sample(e.clientX, e.clientY);
    };

    const handlePointerUp = (): void => {
      pendingRef.current = null;
      const deferredMenu = deferredMenuRef.current;
      deferredMenuRef.current = null;

      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        document.body.classList.remove('no-select');
        releaseWithMomentum();
      }

      // If a right-button pan occurred, suppress the trailing contextmenu event
      if (didPanRef.current) {
        const suppressContextMenu = (evt: MouseEvent): void => {
          evt.preventDefault();
          evt.stopPropagation();
          window.removeEventListener('contextmenu', suppressContextMenu, true);
        };
        window.addEventListener('contextmenu', suppressContextMenu, true);
        // Safety cleanup in case no contextmenu event fires
        window.setTimeout(() => {
          window.removeEventListener('contextmenu', suppressContextMenu, true);
        }, 100);
        didPanRef.current = false;
        return;
      }

      // A press-time menu the capture handler held back, released now that the
      // press has finished as a click. The synthetic event retraces the real
      // one — same target, same point — so the menu opens exactly where, and on
      // exactly what, the user pressed.
      if (deferredMenu) {
        deferredMenu.target.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: deferredMenu.x,
            clientY: deferredMenu.y,
          })
        );
      }
    };

    /**
     * Hand the release velocity to the glide, or to the way back.
     *
     * A pull that is still held has nowhere to coast to — the sheet is already
     * past its end — so letting go of one is a return trip, not a throw. The
     * two cannot both run sideways: an axis that was stretched keeps no speed.
     */
    const releaseWithMomentum = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const { x, y } = trackerRef.current.velocity();
      const stretched = pullRef.current !== 0;

      if (stretched) {
        const from = -rubberBandOffset(pullRef.current, el.clientWidth);
        pullRef.current = 0;
        stopOverscrollAnimation();
        overscrollAnimationRef.current = settleOverscroll(from, (offset) =>
          applyOverscrollRef.current(offset)
        );
      }

      // The glide's own position is kept as a float. A slow tail moves the
      // sheet a third of a pixel per frame, and `scrollLeft` rounds that away
      // — reading the position back each frame would grind the coast to a halt
      // well before its velocity had actually run out.
      let posX = el.scrollLeft;
      let posY = el.scrollTop;
      let lastStep = performance.now();

      glideRef.current = startMomentumGlide({
        velocity: { x: stretched ? 0 : -x, y: -y },
        step: (dx, dy) => {
          const now = performance.now();
          // This frame's travel divided by its length is the speed the sheet is
          // actually going, whatever the glide has decayed its velocity to.
          const dt = Math.max(1, Math.min(now - lastStep, 32));
          lastStep = now;
          posX += dx;
          posY += dy;
          el.scrollLeft = posX;
          el.scrollTop = posY;
          // Where the browser refuses to follow, the sheet has run out of
          // timeline on that axis and only that axis stops.
          const clampedX = Math.abs(el.scrollLeft - posX) > 1;
          const clampedY = Math.abs(el.scrollTop - posY) > 1;
          if (clampedX) posX = el.scrollLeft;
          if (clampedY) posY = el.scrollTop;
          // A coast that reaches the end of the timeline still has somewhere to
          // put its speed: out past the edge, and back.
          if (clampedX) startBounce(dx / dt);
          return { movedX: !clampedX, movedY: !clampedY };
        },
      });
    };

    /**
     * The far end of a throw. Only ever started once per coast — a bounce
     * already running owns the offset, and restarting it every frame while the
     * glide's other axis finishes would hold the sheet out there.
     *
     * Speed arrives in px per millisecond, the unit the whole momentum story is
     * told in.
     */
    const startBounce = (velocity: number): void => {
      if (overscrollAnimationRef.current) return;
      const peak = -bounceDistance(velocity);
      if (peak === 0) return;
      overscrollAnimationRef.current = bounceOverscroll(peak, (offset) =>
        applyOverscrollRef.current(offset)
      );
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      if (isPanningRef.current) {
        isPanningRef.current = false;
        document.body.classList.remove('no-select');
      }
    };
  }, [containerRef, startPan, paintPull, stopOverscrollAnimation]);

  return { isPanning };
}
