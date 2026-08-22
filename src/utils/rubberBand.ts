/**
 * The edge of the sheet, when there is no more sheet.
 *
 * A hard stop reads as frozen: the gesture is still moving, the paper is not,
 * and for that moment the app looks like it has stopped listening. Resistance
 * says the same thing without the ambiguity — it keeps answering the pointer,
 * just less and less, so "there is nothing more here" arrives as a feeling
 * rather than as a failure.
 *
 * The curve is the one a scroll view uses: travel approaches a fraction of the
 * viewport asymptotically, so the first few pixels of pull are nearly free and
 * the hundredth costs almost nothing. Pull is tracked in raw gesture pixels and
 * converted to travel on the way out, which is what makes the return trip exact
 * — dragging back unwinds the same pixels it wound up.
 */

/** How hard the sheet pulls back. UIScrollView's constant. */
const RESISTANCE = 0.55;

/** Proportion of the remaining offset kept per millisecond as it settles. */
const SETTLE_RATE = 0.985;

/** Below this the offset is a rounding error, not a position. */
const MIN_OFFSET_PX = 0.5;

/** How far a flick that arrives at the end at 1px/ms carries past it. */
const BOUNCE_PX_PER_VELOCITY = 26;

/** No throw, however hard, opens more than this much air past the end. */
const MAX_BOUNCE_PX = 64;

/** How long the bounce takes to reach its far point. `--duration-fast`. */
const BOUNCE_OUT_MS = 120;

export interface OverscrollAnimation {
  cancel: () => void;
}

const NO_ANIMATION: OverscrollAnimation = { cancel: () => undefined };

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Travel, in px, for a given pull — the resistance curve itself.
 *
 * `dimension` is how much of the thing is on screen: resistance is relative to
 * the view, so the same pull feels the same on a laptop and on a wall display.
 * It is also the ceiling, since the curve approaches it and never reaches it.
 */
export function rubberBandOffset(pull: number, dimension: number): number {
  if (pull === 0 || dimension <= 0) return 0;
  const magnitude = Math.abs(pull);
  const travel = (1 - 1 / ((magnitude * RESISTANCE) / dimension + 1)) * dimension;
  return Math.sign(pull) * travel;
}

/**
 * Spend a scroll delta against an axis that may already be pulled out.
 *
 * The order matters and is the whole reason this is a function rather than two
 * lines at the call site: an axis holding 40px of pull has to give those back
 * before the sheet moves again, or the paper would start travelling while it
 * was still stretched and the return trip would not match the outward one.
 *
 * `scrollBy` applies whatever is left to the real scroller and returns how much
 * of it the scroller actually took; the remainder becomes new pull.
 */
export function spendAgainstPull(
  pull: number,
  delta: number,
  scrollBy: (amount: number) => number
): number {
  let remaining = delta;

  if (pull !== 0) {
    const unwound = pull + remaining;
    // Same side of zero: the whole delta went into stretching or unstretching
    if (unwound === 0 || Math.sign(unwound) === Math.sign(pull)) return unwound;
    // Crossed zero: the pull is spent and the rest is a real scroll
    remaining = unwound;
  }

  if (remaining === 0) return 0;
  return remaining - scrollBy(remaining);
}

/**
 * Let a stretched axis go.
 *
 * Exponential rather than eased: the offset is a position the user put there,
 * so it has to leave from wherever it is, at whatever size it is, without a
 * duration deciding how fast that looks.
 */
export function settleOverscroll(
  from: number,
  apply: (offset: number) => void
): OverscrollAnimation {
  if (Math.abs(from) < MIN_OFFSET_PX || prefersReducedMotion()) {
    apply(0);
    return NO_ANIMATION;
  }

  let offset = from;
  let last = performance.now();
  let frame = requestAnimationFrame(function tick(now: number): void {
    const dt = Math.max(0, Math.min(now - last, 32));
    last = now;
    offset *= SETTLE_RATE ** dt;
    if (Math.abs(offset) < MIN_OFFSET_PX) offset = 0;
    apply(offset);
    frame = offset === 0 ? 0 : requestAnimationFrame(tick);
  });

  return {
    cancel: () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** How far past the end a glide arriving at this speed should carry. */
export function bounceDistance(velocity: number): number {
  const distance = Math.min(Math.abs(velocity) * BOUNCE_PX_PER_VELOCITY, MAX_BOUNCE_PX);
  return Math.sign(velocity) * distance;
}

/**
 * A coast that has run out of timeline: out to the far point, then back.
 *
 * The outward half is short and eased so the sheet arrives rather than jumps;
 * the return is the same settle a released pull gets, so a bounce and a let-go
 * end identically no matter which one the user caused.
 */
export function bounceOverscroll(
  peak: number,
  apply: (offset: number) => void
): OverscrollAnimation {
  if (peak === 0 || prefersReducedMotion()) {
    apply(0);
    return NO_ANIMATION;
  }

  let settle: OverscrollAnimation | null = null;
  const start = performance.now();
  let frame = requestAnimationFrame(function tick(now: number): void {
    const t = Math.min(1, (now - start) / BOUNCE_OUT_MS);
    // Ease out cubic — the same shape `--ease-out` draws
    apply(peak * (1 - (1 - t) ** 3));
    if (t < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    frame = 0;
    settle = settleOverscroll(peak, apply);
  });

  return {
    cancel: () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      settle?.cancel();
      settle = null;
    },
  };
}
