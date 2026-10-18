import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { GhostBar } from '../../timeline/GhostBar';
import type { CreateReadoutHandle } from '../../../hooks/useCreateGhost';
import { describeDrawnSpan, resolveDrawnSpan } from '../../../utils/creationUtils';
import { PHASE_COLORS } from '../../../constants/colors';
import { EASE_OUT_CSS, prefersReducedMotion } from '../../../utils/easing';
import { barInsetForDepth, ROW_HEIGHT } from '../../../utils/timelineUtils';
import { dayKeyDiff } from '../../../utils/dayKeys';
import { useMeasuredWidth } from './useMeasuredWidth';
import { WalkthroughFrame } from './WalkthroughFrame';
import { WalkthroughSheet, SheetLabel, SheetRow, SheetBar } from './WalkthroughSheet';
import { SHEET_DAYS, createSheetWindow, dayToFraction, fractionToDay } from './sheetWindow';
import { ghostSpan, morphFrames, travelledFarEnough, type PxSpan } from './gestures';

/** Where the resting invitation sits, in days across the sheet. */
const INVITE_FROM_DAY = 14;
const INVITE_TO_DAY = 42;

/**
 * The ghost setting into ink, and the ghost leaving when the draw is called
 * off. `--duration-fast`: both are the answer to a gesture that just ended,
 * and an answer should not keep anyone waiting.
 */
const MORPH_MS = 120;
const RETRACT_MS = 120;

/**
 * `retracting`: the draw has been called off and its ghost is fading. The
 * lesson is already waiting again — the line says so at once — but the ghost
 * stays on the paper until it has gone.
 */
type Stage = 'waiting' | 'drawing' | 'retracting' | 'drawn';

interface DrawLessonProps {
  readonly onDone: () => void;
}

/** One press on the paper. Held in a ref because every frame of it writes the DOM. */
interface Draw {
  readonly pointerId: number;
  readonly anchorPx: number;
  /** Past the threshold: a draw rather than a click. */
  moved: boolean;
  /** The span last painted on the ghost — what the person is looking at. */
  shown: PxSpan;
  /** Lets go of the pointer and every listener the press added. */
  end: () => void;
}

function canAnimate(element: Element): boolean {
  return typeof element.animate === 'function' && !prefersReducedMotion();
}

/**
 * Lesson one: a bar comes from the paper.
 *
 * This is the first of exactly two gestures in FLOID that cannot be discovered
 * by looking at the sheet, and it is invisible for the same reason everything
 * else here is quiet: a new project is blank paper, and blank paper does not
 * advertise. So the screen makes one invitation — the app's own dashed ghost,
 * breathing on an empty row — and keeps making it until the press has
 * actually become a draw. A finger resting on the paper has not drawn
 * anything yet, and taking the invitation away under it would say it had.
 *
 * The gesture is the real one, down to the four-pixel threshold that separates
 * a click from a draw, and the preview is the real component, so the dates and
 * the length the person reads while drawing are the ones the bar would get. The
 * draw itself never goes through React: geometry is written straight to the
 * ghost, and only the moments the line changes reach the store of state.
 *
 * Nothing cuts. The invitation fades as the draw begins and fades back when it
 * is called off; the ghost appears already spanning the distance travelled,
 * not at the paper's edge; on release the bar comes out of the ghost, the two
 * easing together from where the pointer left them to the whole days the bar
 * really covers while the sketch fades from under the ink (`createHandoff`'s
 * idiom on the real sheet); and Escape takes the ghost away with a fade rather
 * than a blink.
 */
export function DrawLesson({ onDone }: DrawLessonProps): ReactElement {
  const sheet = useMemo(createSheetWindow, []);
  const plotRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<CreateReadoutHandle>(null);
  const drawRef = useRef<Draw | null>(null);
  /** A cancelled ghost on its way out. A new press finishes it at once. */
  const retractRef = useRef<Animation | null>(null);
  /** The ghost fading from under the bar it became. */
  const handoffRef = useRef<Animation | null>(null);
  const plotWidth = useMeasuredWidth(plotRef);
  const pixelsPerDay = plotWidth / SHEET_DAYS;

  const [stage, setStage] = useState<Stage>('waiting');
  const [wasNudged, setWasNudged] = useState(false);
  const [drawn, setDrawn] = useState<{ from: number; to: number; duration: string } | null>(null);
  /** The ghost is still on the paper under the new bar, fading out. */
  const [isHandingOff, setIsHandingOff] = useState(false);
  /**
   * Where the ghost first appears: the span already travelled when the press
   * crossed the threshold. Written once, as a prop, so the ghost's first frame
   * is the right one; from then on the gesture writes the element itself, and
   * a prop that never changes again is one React never writes back over it.
   */
  const [seed, setSeed] = useState<PxSpan>({ left: 0, width: 0 });

  const paint = useCallback(
    (anchorPx: number, pointerPx: number): void => {
      const { left, width } = ghostSpan(anchorPx, pointerPx);
      const node = ghostRef.current;
      if (node) {
        node.style.left = `${left}px`;
        node.style.width = `${width}px`;
      }
      readoutRef.current?.show(
        describeDrawnSpan(
          fractionToDay(sheet, left / plotWidth),
          fractionToDay(sheet, (left + width) / plotWidth)
        ),
        width
      );
    },
    [sheet, plotWidth]
  );

  /** Snap a retracting ghost the rest of the way out. */
  const finishRetract = useCallback((): void => {
    const retract = retractRef.current;
    if (!retract) return;
    retractRef.current = null;
    retract.cancel();
    flushSync(() => setStage('waiting'));
  }, []);

  /**
   * The draw called off. The line answers at once; the ghost fades where it
   * stands — exits are quieter than entrances — while the invitation fades
   * back in beside it.
   */
  const retract = useCallback((): void => {
    const ghost = ghostRef.current;
    if (!ghost || !canAnimate(ghost)) {
      setStage('waiting');
      return;
    }
    flushSync(() => setStage('retracting'));
    const animation = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: RETRACT_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    retractRef.current = animation;
    animation.onfinish = (): void => {
      if (retractRef.current !== animation) return;
      retractRef.current = null;
      setStage('waiting');
    };
  }, []);

  /**
   * The ghost becomes the bar. The bar mounts on top of the ghost, in the
   * ghost's own box and with no ink yet, so the first frame is the last one
   * the person saw; then the two ease together to the whole days the bar
   * really covers while the ink comes up and the sketch — its dashed edge, its
   * dates — fades out from under it. The snap to the day grid and the change
   * from sketch to ink are both seen to happen, rather than cut.
   */
  const commit = useCallback(
    (anchorPx: number, releasePx: number, from: PxSpan): void => {
      const span = resolveDrawnSpan(
        fractionToDay(sheet, Math.min(anchorPx, releasePx) / plotWidth),
        fractionToDay(sheet, Math.max(anchorPx, releasePx) / plotWidth)
      );
      const ghost = ghostRef.current;
      const isAnimated = ghost !== null && canAnimate(ghost);
      flushSync(() => {
        setDrawn({
          from: dayToFraction(sheet, span.start),
          to: dayToFraction(sheet, span.end),
          duration: describeDrawnSpan(span.start, span.end).duration,
        });
        setStage('drawn');
        // Kept mounted — the same element, still where the pointer left it —
        // only when there is a fade to play on it.
        setIsHandingOff(isAnimated);
      });

      const bar = barRef.current;
      if (!bar || !ghost || !isAnimated) return;
      // Counted in whole days, which is what the bar is made of
      const pxPerDay = plotWidth / SHEET_DAYS;
      const to: PxSpan = {
        left: dayKeyDiff(sheet.start, span.start) * pxPerDay,
        width: dayKeyDiff(span.start, span.end) * pxPerDay,
      };
      const timing: KeyframeAnimationOptions = { duration: MORPH_MS, easing: EASE_OUT_CSS };
      const frames = morphFrames(from, to);
      bar.animate(frames, timing);
      bar.querySelector('.timeline-bar__fill')?.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      // Held at the end, so the sketch does not spring back to the pointer's
      // span in the frame between its fade ending and React removing it
      ghost.animate(frames, { ...timing, fill: 'forwards' });
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: MORPH_MS,
        easing: 'linear',
        fill: 'forwards',
      });
      handoffRef.current = fade;
      fade.onfinish = (): void => {
        if (handoffRef.current !== fade) return;
        handoffRef.current = null;
        setIsHandingOff(false);
      };
    },
    [sheet, plotWidth]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0 || stage === 'drawn' || plotWidth === 0 || drawRef.current) return;
      const plot = plotRef.current;
      if (!plot) return;
      const row = e.currentTarget;
      // A ghost still fading from the last draw belongs to that one
      finishRetract();
      // No text selection starting under a draw that wanders off the paper
      e.preventDefault();

      const clampPx = (clientX: number): number =>
        Math.min(Math.max(clientX - plot.getBoundingClientRect().left, 0), plotWidth);
      const anchorPx = clampPx(e.clientX);

      const draw: Draw = {
        pointerId: e.pointerId,
        anchorPx,
        moved: false,
        shown: { left: anchorPx, width: 0 },
        end: () => undefined,
      };

      /**
       * Escape, the system taking the pointer away, the window losing focus.
       * An abort, never a drop.
       */
      const abandon = (): void => {
        draw.end();
        if (draw.moved) retract();
      };

      const handleMove = (me: PointerEvent): void => {
        if (me.pointerId !== draw.pointerId) return;
        // No button held means the release happened somewhere this page was
        // never told about, as the app's own draw reads it. The press is
        // over; without this the ghost would go on drawing under a hover.
        if (me.buttons === 0) {
          abandon();
          return;
        }
        const pointerPx = clampPx(me.clientX);
        if (!draw.moved) {
          if (!travelledFarEnough(draw.anchorPx, pointerPx)) return;
          draw.moved = true;
          // The one render a draw costs. Flushed, so the ghost and its readout
          // exist before the paint below writes to them, and the first frame
          // anyone sees is the span already travelled.
          flushSync(() => {
            setSeed(ghostSpan(draw.anchorPx, pointerPx));
            setStage('drawing');
          });
        }
        draw.shown = ghostSpan(draw.anchorPx, pointerPx);
        paint(draw.anchorPx, pointerPx);
      };

      const handleUp = (me: PointerEvent): void => {
        if (me.pointerId !== draw.pointerId) return;
        draw.end();

        // A press that never travelled is a click, and a click on open paper
        // makes nothing in the real app either. Say so, and keep waiting.
        if (!draw.moved) {
          setWasNudged(true);
          return;
        }
        // The morph starts from where the ghost was last painted, which is
        // where the person saw it, even if the pointer came up a pixel past it.
        commit(draw.anchorPx, clampPx(me.clientX), draw.shown);
      };

      const handleCancel = (pe: PointerEvent): void => {
        if (pe.pointerId === draw.pointerId) abandon();
      };

      // The draw owns this Escape once there is a ghost, so nothing behind it
      // — the app's own shortcuts — answers the same press.
      const handleKey = (ke: KeyboardEvent): void => {
        if (ke.key !== 'Escape') return;
        if (draw.moved) {
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

      draw.end = (): void => {
        if (drawRef.current !== draw) return;
        drawRef.current = null;
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleCancel);
        row.removeEventListener('lostpointercapture', handleCancel);
        window.removeEventListener('keydown', handleKey, true);
        window.removeEventListener('blur', handleBlur);
        document.removeEventListener('visibilitychange', handleVisibility);
        if (row.hasPointerCapture?.(draw.pointerId)) row.releasePointerCapture(draw.pointerId);
      };

      drawRef.current = draw;
      row.setPointerCapture?.(e.pointerId);
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleCancel);
      row.addEventListener('lostpointercapture', handleCancel);
      // Capture phase, on the window: the first to hear Escape
      window.addEventListener('keydown', handleKey, true);
      window.addEventListener('blur', handleBlur);
      document.addEventListener('visibilitychange', handleVisibility);
    },
    [stage, plotWidth, paint, commit, retract, finishRetract]
  );

  // Leaving mid-draw takes the gesture's listeners, and its fades, with it.
  useEffect(
    () => () => {
      drawRef.current?.end();
      retractRef.current?.cancel();
      retractRef.current = null;
      handoffRef.current?.cancel();
      handoffRef.current = null;
    },
    []
  );

  const isWaiting = stage === 'waiting' || stage === 'retracting';
  const hasGhost = stage === 'drawing' || stage === 'retracting' || isHandingOff;

  const line =
    stage === 'drawn'
      ? `${drawn?.duration ?? ''}. That's a bar.`
      : stage === 'drawing'
        ? 'Let go to set the end.'
        : wasNudged
          ? 'Press and drag — the distance is the dates.'
          : 'Drag to draw a bar.';

  return (
    <WalkthroughFrame line={line} onContinue={stage === 'drawn' ? onDone : undefined}>
      <WalkthroughSheet
        ref={plotRef}
        sheet={sheet}
        labels={
          <>
            <SheetLabel name="Design" isSchedule />
            <SheetLabel name="" />
          </>
        }
      >
        <SheetRow />
        {/* The whole row is the target: a row spans the sheet, so wherever the
            press lands along one really was chosen. `touch-action: none`
            belongs here and not on the real plot — this paper does not scroll,
            so a finger on it can only be drawing. */}
        <div
          className="relative touch-none cursor-crosshair"
          style={{ height: ROW_HEIGHT }}
          onPointerDown={handlePointerDown}
        >
          {/* The invitation steps aside for the draw rather than blinking out
              under it, and comes back the same way. Its own layer breathes, so
              the fade rides a wrapper of its own. */}
          {stage !== 'drawn' && plotWidth > 0 && (
            <div
              className={`absolute inset-0 pointer-events-none transition-opacity duration-fast ${
                isWaiting ? 'opacity-100' : 'opacity-0'
              }`}
              data-walkthrough-invite={isWaiting ? 'shown' : 'hidden'}
              aria-hidden="true"
            >
              <div className="walkthrough-invite absolute inset-0">
                <GhostBar
                  left={INVITE_FROM_DAY * pixelsPerDay}
                  width={(INVITE_TO_DAY - INVITE_FROM_DAY) * pixelsPerDay}
                  color={PHASE_COLORS.teal}
                  verticalClassName=""
                  style={{ top: barInsetForDepth(0), bottom: barInsetForDepth(0) }}
                />
              </div>
            </div>
          )}

          {/* One element from the first frame of the draw to the last frame
              of its handoff: it stays in this slot, so React keeps the node
              the gesture has been writing to. */}
          {hasGhost && (
            <GhostBar
              ref={ghostRef}
              left={seed.left}
              width={seed.width}
              color={PHASE_COLORS.teal}
              verticalClassName=""
              style={{ top: barInsetForDepth(0), bottom: barInsetForDepth(0) }}
              isDrawing
              readoutRef={readoutRef}
            />
          )}

          {stage === 'drawn' && drawn && (
            <SheetBar
              ref={barRef}
              from={drawn.from}
              to={drawn.to}
              color={PHASE_COLORS.teal}
              name=""
            />
          )}
        </div>
      </WalkthroughSheet>
    </WalkthroughFrame>
  );
}
