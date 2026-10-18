/**
 * The arithmetic under the walkthrough's two gestures, kept apart from the
 * components so it can be held to the real app's numbers without a browser.
 */

/** The real threshold: below it a press is a click, not a draw or a drag. */
export const GESTURE_THRESHOLD_PX = 4;

/** A horizontal run on the paper, in px from its left edge. */
export interface PxSpan {
  readonly left: number;
  readonly width: number;
}

/**
 * Whether a press has travelled far enough to be a drag rather than a click.
 * Either axis will do, as in `useItemDrag`: a bar can be carried straight
 * down a row as well as along one.
 */
export function hasTravelled(dx: number, dy: number): boolean {
  return Math.abs(dx) >= GESTURE_THRESHOLD_PX || Math.abs(dy) >= GESTURE_THRESHOLD_PX;
}

/**
 * Whether a draw has begun. Only distance along the paper counts — a draw is
 * a span of days, and up and down is not a day.
 */
export function travelledFarEnough(anchorPx: number, pointerPx: number): boolean {
  return Math.abs(pointerPx - anchorPx) >= GESTURE_THRESHOLD_PX;
}

/**
 * The span a draw covers: from wherever the press landed to wherever the
 * pointer is now, whichever way it went. Never anchored at the paper's edge —
 * a ghost seeded at zero is a bar flashing in from the left on the first frame.
 */
export function ghostSpan(anchorPx: number, pointerPx: number): PxSpan {
  return { left: Math.min(anchorPx, pointerPx), width: Math.abs(pointerPx - anchorPx) };
}

/**
 * The ghost setting into the bar: from the px span the pointer left it at to
 * the whole days the bar really covers. Both ends in px, so the animation
 * never has to reconcile a pixel with a percentage mid-flight.
 */
export function morphFrames(from: PxSpan, to: PxSpan): Keyframe[] {
  return [
    { left: `${from.left}px`, width: `${from.width}px` },
    { left: `${to.left}px`, width: `${to.width}px` },
  ];
}
