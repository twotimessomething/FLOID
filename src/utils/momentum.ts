/**
 * Momentum, the way a scroll view does it.
 *
 * A flick should carry on at the speed it was released at and slow the way a
 * real thing slows, rather than stopping dead the instant contact is lost.
 * The whole model is one line — velocity keeps a fixed proportion of itself
 * every millisecond, and position is its integral:
 *
 *     v(t) = v₀ · rate^t
 *
 * Integrating that out to rest gives how far a flick will travel, which is how
 * an interface can aim at where a gesture is going instead of where it stopped.
 * The glide and that prediction live in the same file precisely so they can
 * never disagree about the same flick.
 *
 * Velocities here are px per millisecond throughout: it is the unit the raw
 * pointer samples arrive in, and converting once at the edges beats scaling by
 * a thousand at every use.
 */

/** Proportion of velocity kept per millisecond. A normal scroll's feel. */
const DECELERATION_RATE = 0.998;
/** Under a fifth of a pixel per frame is a stop, however you round it. */
const MIN_VELOCITY = 0.012;
/** How far back samples are worth trusting. Older than this is a different flick. */
const SAMPLE_WINDOW_MS = 60;

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** Where a flick released at this velocity would come to rest, in px travelled. */
export function projectMomentum(velocity: number): number {
  return (velocity * DECELERATION_RATE) / (1 - DECELERATION_RATE);
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

export interface VelocityTracker {
  reset: (x: number, y: number) => void;
  sample: (x: number, y: number) => void;
  /** Velocity over the trailing window, in px/ms. Zero if the pointer settled. */
  velocity: () => Vector2;
}

/**
 * Speed at release, measured over a window rather than from the last pair.
 *
 * Two adjacent pointer events can be a millisecond and a pixel apart, which
 * divides out to a wild number; and a gesture that stops moving before the
 * button comes up should read as zero, not as whatever the last twitch was.
 * A short trailing window gets both right.
 */
export function createVelocityTracker(): VelocityTracker {
  let samples: Sample[] = [];

  const push = (x: number, y: number): void => {
    const t = performance.now();
    samples.push({ x, y, t });
    const cutoff = t - SAMPLE_WINDOW_MS;
    while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
  };

  return {
    reset: (x, y) => {
      samples = [];
      push(x, y);
    },
    sample: push,
    velocity: () => {
      if (samples.length < 2) return { x: 0, y: 0 };
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = last.t - first.t;
      if (elapsed <= 0) return { x: 0, y: 0 };
      // A pointer that has been still for longer than the window has no speed,
      // whatever it was doing before that.
      if (performance.now() - last.t > SAMPLE_WINDOW_MS) return { x: 0, y: 0 };
      return { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed };
    },
  };
}

export interface Glide {
  cancel: () => void;
}

interface GlideOptions {
  /** Release velocity in px/ms, per axis. The two decay independently. */
  readonly velocity: Vector2;
  /**
   * Apply one frame's travel. Returns whether each axis actually moved — an
   * axis that has run out of room is finished, and its velocity is dropped
   * rather than integrated into a number nothing can consume.
   */
  readonly step: (dx: number, dy: number) => Vector2Moved;
}

interface Vector2Moved {
  readonly movedX: boolean;
  readonly movedY: boolean;
}

/** A glide that never starts, for the paths that decline to run one. */
const NO_GLIDE: Glide = { cancel: () => undefined };

/**
 * Carry a released gesture forward until it runs out of speed or room.
 *
 * X and Y decay as two independent springs would: a flick that was mostly
 * sideways keeps going sideways rather than being dragged around by a shared
 * magnitude. Cancelling is the whole interruption story — the next press stops
 * the glide where it stands and takes over from that exact position.
 */
export function startMomentumGlide({ velocity, step }: GlideOptions): Glide {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let vx = Math.abs(velocity.x) < MIN_VELOCITY ? 0 : velocity.x;
  let vy = Math.abs(velocity.y) < MIN_VELOCITY ? 0 : velocity.y;

  if (reduced || (vx === 0 && vy === 0)) return NO_GLIDE;
  // A throw too short to see is a stop that happens to have been quick
  if (Math.abs(projectMomentum(vx)) < 4 && Math.abs(projectMomentum(vy)) < 4) return NO_GLIDE;

  let frame = 0;
  let last = performance.now();

  const tick = (now: number): void => {
    // Frames dropped to a background tab or a long task must not teleport the
    // sheet across the timeline when it comes back — and a frame timestamp that
    // predates the release must never run the glide backwards.
    const dt = Math.max(0, Math.min(now - last, 32));
    last = now;

    const { movedX, movedY } = step(vx * dt, vy * dt);
    if (!movedX) vx = 0;
    if (!movedY) vy = 0;

    const decay = DECELERATION_RATE ** dt;
    vx *= decay;
    vy *= decay;

    if (Math.abs(vx) < MIN_VELOCITY) vx = 0;
    if (Math.abs(vy) < MIN_VELOCITY) vy = 0;
    if (vx === 0 && vy === 0) {
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  return {
    cancel: () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
