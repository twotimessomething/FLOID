import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVelocityTracker,
  projectMomentum,
  startMomentumGlide,
} from '../utils/momentum';

/** Drives `performance.now()` by hand so a flick can be described exactly. */
function useClock(): { advance: (ms: number) => void } {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function mockReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('projectMomentum', () => {
  it('projects roughly 500x the per-millisecond velocity', () => {
    // 2 px/ms is a brisk 2000 px/s flick
    expect(projectMomentum(2)).toBeCloseTo(998, 0);
  });

  it('carries the sign of the throw', () => {
    expect(projectMomentum(-1)).toBeCloseTo(-499, 0);
  });

  it('projects nothing from a standstill', () => {
    expect(projectMomentum(0)).toBe(0);
  });
});

describe('createVelocityTracker', () => {
  let clock: ReturnType<typeof useClock>;

  beforeEach(() => {
    clock = useClock();
  });

  it('has no velocity from a single sample', () => {
    const tracker = createVelocityTracker();
    tracker.reset(0, 0);
    expect(tracker.velocity()).toEqual({ x: 0, y: 0 });
  });

  it('measures px per millisecond across the window', () => {
    const tracker = createVelocityTracker();
    tracker.reset(0, 0);
    clock.advance(10);
    tracker.sample(20, 10);
    clock.advance(10);
    tracker.sample(40, 20);

    const { x, y } = tracker.velocity();
    expect(x).toBeCloseTo(2, 5);
    expect(y).toBeCloseTo(1, 5);
  });

  it('reads zero once the pointer has been still longer than the window', () => {
    const tracker = createVelocityTracker();
    tracker.reset(0, 0);
    clock.advance(10);
    tracker.sample(40, 0);
    // Held in place before letting go — that is a placement, not a throw
    clock.advance(200);

    expect(tracker.velocity()).toEqual({ x: 0, y: 0 });
  });

  it('forgets samples older than the window', () => {
    const tracker = createVelocityTracker();
    tracker.reset(0, 0);
    // A slow opening drag...
    clock.advance(500);
    tracker.sample(10, 0);
    // ...then a fast finish, which is the only part the release should reflect
    clock.advance(10);
    tracker.sample(60, 0);
    clock.advance(10);
    tracker.sample(110, 0);

    expect(tracker.velocity().x).toBeCloseTo(5, 5);
  });

  it('starts clean on reset', () => {
    const tracker = createVelocityTracker();
    tracker.reset(0, 0);
    clock.advance(10);
    tracker.sample(100, 0);
    tracker.reset(0, 0);

    expect(tracker.velocity()).toEqual({ x: 0, y: 0 });
  });
});

describe('startMomentumGlide', () => {
  beforeEach(() => {
    mockReducedMotion(false);
    // Frame timestamps and `performance.now()` share a time origin in the
    // browser; the fake frames below start at zero, so this must too.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('does not start when the user has asked for reduced motion', () => {
    mockReducedMotion(true);
    startMomentumGlide({ velocity: { x: 5, y: 0 }, step: () => ({ movedX: true, movedY: true }) });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not start for a release too slow to travel', () => {
    startMomentumGlide({ velocity: { x: 0.004, y: 0 }, step: () => ({ movedX: true, movedY: true }) });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('starts for a real flick', () => {
    startMomentumGlide({ velocity: { x: 1.5, y: 0 }, step: () => ({ movedX: true, movedY: true }) });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('decays toward rest and stops on its own', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn().mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      })
    );

    const travelled: number[] = [];
    startMomentumGlide({
      velocity: { x: 1, y: 0 },
      step: (dx) => {
        travelled.push(dx);
        return { movedX: true, movedY: true };
      },
    });

    let now = 0;
    // Well past the point a 1 px/ms throw should have settled
    for (let i = 0; i < 500 && frames.length > 0; i += 1) {
      const next = frames.shift();
      now += 16;
      next?.(now);
    }

    expect(travelled.length).toBeGreaterThan(10);
    // Each frame covers less ground than the one before it
    expect(travelled[travelled.length - 1]).toBeLessThan(travelled[0]);
    // And it came to a stop rather than running until the loop gave up
    expect(frames).toHaveLength(0);
  });

  it('stops an axis that has run out of room without stopping the other', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn().mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      })
    );

    const steps: Array<{ dx: number; dy: number }> = [];
    startMomentumGlide({
      velocity: { x: 1, y: 1 },
      // X is hard against an end from the very first frame
      step: (dx, dy) => {
        steps.push({ dx, dy });
        return { movedX: false, movedY: true };
      },
    });

    let now = 0;
    for (let i = 0; i < 5 && frames.length > 0; i += 1) {
      now += 16;
      frames.shift()?.(now);
    }

    expect(steps.length).toBeGreaterThan(1);
    expect(steps[steps.length - 1].dx).toBe(0);
    expect(steps[steps.length - 1].dy).toBeGreaterThan(0);
  });
});
