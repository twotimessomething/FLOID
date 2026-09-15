import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { GhostBar } from '../../timeline/GhostBar';
import type { CreateReadoutHandle } from '../../../hooks/useCreateGhost';
import { describeDrawnSpan, resolveDrawnSpan } from '../../../utils/creationUtils';
import { PHASE_COLORS } from '../../../constants/colors';
import { barInsetForDepth, ROW_HEIGHT } from '../../../utils/timelineUtils';
import { useMeasuredWidth } from './useMeasuredWidth';
import { WalkthroughFrame } from './WalkthroughFrame';
import { WalkthroughSheet, SheetLabel, SheetRow, SheetBar } from './WalkthroughSheet';
import { SHEET_DAYS, createSheetWindow, dayToFraction, fractionToDay } from './sheetWindow';

/** The real threshold: below it a press is a click, not a draw. */
const DRAW_THRESHOLD_PX = 4;

/** Where the resting invitation sits, in days across the sheet. */
const INVITE_FROM_DAY = 14;
const INVITE_TO_DAY = 42;

type Stage = 'waiting' | 'drawing' | 'drawn';

interface DrawLessonProps {
  readonly onDone: () => void;
}

/**
 * Lesson one: a bar comes from the paper.
 *
 * This is the first of exactly two gestures in FLOID that cannot be discovered
 * by looking at the sheet, and it is invisible for the same reason everything
 * else here is quiet: a new project is blank paper, and blank paper does not
 * advertise. So the screen makes one invitation — the app's own dashed ghost,
 * breathing on an empty row — and stops making it the moment a finger lands.
 *
 * The gesture is the real one, down to the four-pixel threshold that separates
 * a click from a draw, and the preview is the real component, so the dates and
 * the length the person reads while drawing are the ones the bar would get. The
 * draw itself never goes through React: geometry is written straight to the
 * ghost, and only the two moments the line changes reach the store of state.
 */
export function DrawLesson({ onDone }: DrawLessonProps): ReactElement {
  const sheet = useMemo(createSheetWindow, []);
  const plotRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<CreateReadoutHandle>(null);
  const plotWidth = useMeasuredWidth(plotRef);
  const pixelsPerDay = plotWidth / SHEET_DAYS;

  const [stage, setStage] = useState<Stage>('waiting');
  const [wasNudged, setWasNudged] = useState(false);
  const [drawn, setDrawn] = useState<{ from: number; to: number; duration: string } | null>(null);

  /** The live gesture. Held in a ref because every frame of it writes the DOM. */
  const drawRef = useRef<{ anchorPx: number; lastPx: number; moved: boolean } | null>(null);

  const paint = useCallback(
    (anchorPx: number, pointerPx: number): void => {
      const left = Math.min(anchorPx, pointerPx);
      const width = Math.abs(pointerPx - anchorPx);
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0 || stage === 'drawn' || plotWidth === 0) return;
      const rect = plotRef.current?.getBoundingClientRect();
      if (!rect) return;
      const anchorPx = e.clientX - rect.left;
      drawRef.current = { anchorPx, lastPx: anchorPx, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      setStage('drawing');
    },
    [stage, plotWidth]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const draw = drawRef.current;
      const rect = plotRef.current?.getBoundingClientRect();
      if (!draw || !rect) return;
      const pointerPx = Math.min(Math.max(e.clientX - rect.left, 0), plotWidth);
      draw.lastPx = pointerPx;
      if (Math.abs(pointerPx - draw.anchorPx) >= DRAW_THRESHOLD_PX) draw.moved = true;
      paint(draw.anchorPx, pointerPx);
    },
    [paint, plotWidth]
  );

  const handlePointerUp = useCallback((): void => {
    const draw = drawRef.current;
    drawRef.current = null;
    if (!draw) return;

    // A press that never travelled is a click, and a click on open paper makes
    // nothing in the real app either. Say so, and keep waiting.
    if (!draw.moved) {
      setWasNudged(true);
      setStage('waiting');
      return;
    }

    const span = resolveDrawnSpan(
      fractionToDay(sheet, Math.min(draw.anchorPx, draw.lastPx) / plotWidth),
      fractionToDay(sheet, Math.max(draw.anchorPx, draw.lastPx) / plotWidth)
    );
    setDrawn({
      from: dayToFraction(sheet, span.start),
      to: dayToFraction(sheet, span.end),
      duration: describeDrawnSpan(span.start, span.end).duration,
    });
    setStage('drawn');
  }, [sheet, plotWidth]);

  /** A cancelled pointer is an abort, never a drop. */
  const handlePointerCancel = useCallback((): void => {
    drawRef.current = null;
    setStage('waiting');
  }, []);

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
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {stage === 'waiting' && plotWidth > 0 && (
            <div className="walkthrough-invite absolute inset-0" aria-hidden="true">
              <GhostBar
                left={INVITE_FROM_DAY * pixelsPerDay}
                width={(INVITE_TO_DAY - INVITE_FROM_DAY) * pixelsPerDay}
                color={PHASE_COLORS.teal}
                verticalClassName=""
                style={{ top: barInsetForDepth(0), bottom: barInsetForDepth(0) }}
              />
            </div>
          )}

          {stage === 'drawing' && (
            <GhostBar
              ref={ghostRef}
              left={0}
              width={0}
              color={PHASE_COLORS.teal}
              verticalClassName=""
              style={{ top: barInsetForDepth(0), bottom: barInsetForDepth(0) }}
              isDrawing
              readoutRef={readoutRef}
            />
          )}

          {stage === 'drawn' && drawn && (
            <SheetBar from={drawn.from} to={drawn.to} color={PHASE_COLORS.teal} name="" />
          )}
        </div>
      </WalkthroughSheet>
    </WalkthroughFrame>
  );
}
