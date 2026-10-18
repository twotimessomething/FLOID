/**
 * The app's motion curve, evaluated in script.
 *
 * Most motion here is CSS or the Web Animations API, which read the curve as a
 * string. A drag's landing is neither: the clone chases an element that is
 * itself still moving, so its position has to be computed every frame — and it
 * has to arrive on the same curve the rows around it are sliding on, or the
 * two drift apart for the length of the settle.
 */

/** `--ease-out` in `index.css`. A fast start that eases into place. */
export const EASE_OUT_CSS = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * A CSS `cubic-bezier()` as a function of progress.
 *
 * The curve is parametric, so finding y for a given x means solving x(t) = x
 * for t first: a few Newton steps from a linear guess, with bisection as the
 * fallback where the slope is too flat for Newton to trust.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (sampleX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveT(x));
  };
}

export const easeOut = cubicBezier(0.23, 1, 0.32, 1);

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
