import { useRef, useCallback, useEffect, useState } from 'react';
import {
  createVelocityTracker,
  startMomentumGlide,
  type Glide,
} from '../utils/momentum';

const PAN_THRESHOLD = 3;

interface UseTimelinePanOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
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
 */
export function useTimelinePan({
  containerRef,
}: UseTimelinePanOptions): UseTimelinePanReturn {
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const pendingRef = useRef<{ startX: number; startY: number } | null>(null);
  const didPanRef = useRef(false);
  const trackerRef = useRef(createVelocityTracker());
  const glideRef = useRef<Glide | null>(null);

  const stopGlide = useCallback((): void => {
    glideRef.current?.cancel();
    glideRef.current = null;
  }, []);

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      stopGlide();
      isPanningRef.current = true;
      setIsPanning(true);
      lastPosRef.current = { x: clientX, y: clientY };
      trackerRef.current.reset(clientX, clientY);
    },
    [stopGlide]
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

    const handleMouseDownCapture = (e: MouseEvent): void => {
      if (!isOnSheet(e.target)) return;

      // Any approach to a sliding sheet stops it where it stands: the user is
      // reaching for something, not watching it
      stopGlide();

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
      }
    };

    const handleWheelCapture = (e: WheelEvent): void => {
      if (isOnSheet(e.target)) stopGlide();
    };

    document.addEventListener('mousedown', handleMouseDownCapture, true);
    document.addEventListener('wheel', handleWheelCapture, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', handleMouseDownCapture, true);
      document.removeEventListener('wheel', handleWheelCapture, true);
    };
  }, [startPan, stopGlide]);

  // Stop a coast that outlives the component
  useEffect(() => () => stopGlide(), [stopGlide]);

  // Document-level mousemove/mouseup for pan + contextmenu suppression
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
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

      if (!isPanningRef.current || !containerRef.current) return;

      const deltaX = e.clientX - lastPosRef.current.x;
      const deltaY = e.clientY - lastPosRef.current.y;

      containerRef.current.scrollLeft -= deltaX;
      containerRef.current.scrollTop -= deltaY;

      lastPosRef.current = { x: e.clientX, y: e.clientY };
      trackerRef.current.sample(e.clientX, e.clientY);
    };

    const handleMouseUp = (): void => {
      pendingRef.current = null;

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
      }
    };

    /**
     * Hand the release velocity to the glide.
     *
     * The sign flips because the sheet travels opposite to the cursor: dragging
     * left reveals what is to the right, so a leftward throw has to keep
     * increasing `scrollLeft` after the cursor has gone.
     */
    const releaseWithMomentum = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const { x, y } = trackerRef.current.velocity();
      // The glide's own position is kept as a float. A slow tail moves the
      // sheet a third of a pixel per frame, and `scrollLeft` rounds that away
      // — reading the position back each frame would grind the coast to a halt
      // well before its velocity had actually run out.
      let posX = el.scrollLeft;
      let posY = el.scrollTop;

      glideRef.current = startMomentumGlide({
        velocity: { x: -x, y: -y },
        step: (dx, dy) => {
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
          return { movedX: !clampedX, movedY: !clampedY };
        },
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (isPanningRef.current) {
        isPanningRef.current = false;
        document.body.classList.remove('no-select');
      }
    };
  }, [containerRef, startPan]);

  return { isPanning };
}
