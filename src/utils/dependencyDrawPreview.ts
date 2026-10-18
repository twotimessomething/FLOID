import { finishHeldDependency } from './dependencyHover';
import { easeOut, prefersReducedMotion } from './easing';

/**
 * The line in flight while a dependency is being drawn.
 *
 * Like the drag preview, it lives outside React and is written to directly:
 * the pointer moves sixty times a second and none of those frames should
 * re-render a row. It is a sketch until it finds a bar — dashed, following the
 * cursor — and becomes a committed-looking line the moment it snaps to an
 * anchor, so the hand knows before it lets go.
 *
 * It is never simply removed, because removing it is a cut. Every way a
 * gesture ends has its own motion:
 *
 * - **Lift.** Picking up the end of an existing link starts the line as that
 *   link's route and pulls it straight towards the hand, so the end visibly
 *   comes away from where it was.
 * - **Land.** A line that connected folds from straight into the elbow route
 *   the sheet is about to print, then hands over to that ink with a short
 *   crossfade. The two are drawn from the same corners, so the handover is
 *   the arrowhead arriving and nothing else.
 * - **Retract.** A line that connected nothing draws its free end back into
 *   the dot it came from and goes.
 *
 * All of it is position over time on one curve (`easeOut`), so it reads as
 * the same family of motion as a bar settling into its row.
 */

export interface DrawPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A route on the sheet. The corners are in `frame`'s own coordinates — the
 * dependency layer's SVG — so a route read once still follows the sheet if it
 * scrolls while the line is landing on it.
 */
export interface SheetRoute {
  readonly frame: Element;
  /** Corners from the pinned end to the moving one. */
  readonly points: readonly DrawPoint[];
}

export interface LandHandlers {
  /** The fold has (nearly) arrived: bring the real ink back in under it. */
  readonly onInk: () => void;
  /** The preview is gone; the sheet is all that is left. */
  readonly onDone: () => void;
}

export interface DependencyDrawPreview {
  /** Pinned end, moving end, and whether the moving end has snapped to an anchor. */
  readonly draw: (origin: DrawPoint, free: DrawPoint, snapped: boolean) => void;
  /** Begin as this route and pull straight over the next few frames. */
  readonly liftFrom: (route: SheetRoute) => void;
  /**
   * Fold into `route`, then cross over to the ink the sheet prints there. With
   * no route to fold into — the link is not on screen — it simply crossfades.
   */
  readonly land: (route: SheetRoute | null, handlers: LandHandlers) => void;
  /** Draw the free end back into the pinned one, then go. */
  readonly retract: (origin: () => DrawPoint, onDone?: () => void) => void;
  /** Gone, now, with no motion. */
  readonly destroy: () => void;
}

/** Picking an end up: the route pulling straight. `--duration-base`. */
export const LIFT_MS = 160;
/** The fold into the committed route. `--duration-slow` — the layout changing shape. */
export const LAND_MS = 200;
/** When the sheet's own ink starts coming back under the fold. */
export const INK_AT_MS = 120;
/** The crossfade from preview to ink. `--duration-fast`. */
export const FADE_MS = 120;
/** A free end going home. `--duration-base`. */
export const RETRACT_MS = 160;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Motion still answering a gesture that has ended — so a new one can finish it. */
const inFlight = new Set<() => void>();

/**
 * End every landing and retraction still playing, and let go of the link they
 * were landing on — it is shown at once, where it was going. A new gesture wins.
 */
export function finishDependencyDrawMotion(): void {
  Array.from(inFlight).forEach((finish) => finish());
  inFlight.clear();
  finishHeldDependency();
}

// -- shape arithmetic (pure) ---------------------------------------------------

function lerp(a: DrawPoint, b: DrawPoint, t: number): DrawPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** How far along the polyline each corner sits, as a fraction of its length. */
export function arcFractions(points: readonly DrawPoint[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  const total = lengths[lengths.length - 1];
  if (total === 0) return points.map((_, i) => (points.length > 1 ? i / (points.length - 1) : 0));
  return lengths.map((length) => length / total);
}

/** The point a given fraction of the way along a polyline. */
export function pointAlong(points: readonly DrawPoint[], fraction: number): DrawPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || fraction <= 0) return points[0];
  if (fraction >= 1) return points[points.length - 1];
  const fractions = arcFractions(points);
  for (let i = 1; i < points.length; i += 1) {
    if (fraction <= fractions[i]) {
      const span = fractions[i] - fractions[i - 1];
      const t = span === 0 ? 0 : (fraction - fractions[i - 1]) / span;
      return lerp(points[i - 1], points[i], t);
    }
  }
  return points[points.length - 1];
}

/**
 * A route part-way between itself and another shape.
 *
 * Each corner of `route` is matched with the point the same fraction of the
 * way along `other`, and moved `weight` of the way from there to its own
 * place: at 0 the result lies exactly along `other` (a straight line, say), at
 * 1 it is the route. The corners never cross, because both shapes are walked
 * in the same order, so the in-between is a line visibly folding — not points
 * flying about.
 */
export function foldToward(
  route: readonly DrawPoint[],
  other: readonly DrawPoint[],
  weight: number
): DrawPoint[] {
  const fractions = arcFractions(route);
  return route.map((corner, i) => lerp(pointAlong(other, fractions[i]), corner, weight));
}

/** The route in screen coordinates, or `null` once its frame has left the page. */
function routeOnScreen(route: SheetRoute): DrawPoint[] | null {
  if (!route.frame.isConnected) return null;
  const rect = route.frame.getBoundingClientRect();
  return route.points.map((p) => ({ x: rect.left + p.x, y: rect.top + p.y }));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// -- the preview -----------------------------------------------------------------

export function createDependencyDrawPreview(): DependencyDrawPreview {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'dependency-draw-preview');
  svg.style.position = 'fixed';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '9999';
  svg.style.overflow = 'visible';

  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('stroke-width', '1.25');
  line.setAttribute('fill', 'none');

  const originDot = document.createElementNS(SVG_NS, 'circle');
  originDot.setAttribute('r', '2.5');

  const targetDot = document.createElementNS(SVG_NS, 'circle');
  targetDot.setAttribute('r', '3');

  svg.appendChild(line);
  svg.appendChild(originDot);
  svg.appendChild(targetDot);
  document.body.appendChild(svg);

  /** What is on screen now — every motion starts from exactly here. */
  let shape: DrawPoint[] = [];
  let lastPath = '';
  let lastSnapped: boolean | null = null;
  let lift: { route: SheetRoute; start: number } | null = null;
  let frame = 0;
  let removed = false;
  /** The outcome of the closing motion, owed whether it plays out or is cut short. */
  let pendingFinish: (() => void) | null = null;

  const paint = (points: DrawPoint[], snapped: boolean): void => {
    if (points.length === 0) return;
    shape = points;
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`).join(' ');
    if (d !== lastPath) {
      line.setAttribute('d', d);
      lastPath = d;
    }

    const first = points[0];
    const last = points[points.length - 1];
    originDot.setAttribute('cx', String(round(first.x)));
    originDot.setAttribute('cy', String(round(first.y)));
    targetDot.setAttribute('cx', String(round(last.x)));
    targetDot.setAttribute('cy', String(round(last.y)));

    if (snapped === lastSnapped) return;
    lastSnapped = snapped;
    const ink = snapped ? 'var(--color-text-primary)' : 'var(--color-text-secondary)';
    line.setAttribute('stroke', ink);
    if (snapped) line.removeAttribute('stroke-dasharray');
    else line.setAttribute('stroke-dasharray', '4 4');
    originDot.setAttribute('fill', ink);
    targetDot.setAttribute('fill', ink);
    targetDot.style.display = snapped ? '' : 'none';
  };

  /**
   * Off the page, and whatever the closing motion owed the sheet is paid —
   * so cutting a landing short still reveals the link it was landing on.
   */
  const destroy = (): void => {
    if (!removed) {
      removed = true;
      lift = null;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      inFlight.delete(destroy);
      svg.remove();
    }
    const finish = pendingFinish;
    pendingFinish = null;
    finish?.();
  };

  /**
   * Run the closing motion. `step` paints a frame and says whether it was the
   * last; `finish` is the outcome, which `destroy` pays out early when a new
   * gesture cuts the motion short.
   */
  const play = (step: (elapsed: number) => boolean, finish: () => void): void => {
    if (removed) return;
    lift = null;
    if (frame !== 0) cancelAnimationFrame(frame);
    pendingFinish = finish;
    inFlight.add(destroy);
    const start = performance.now();
    const tick = (now: number): void => {
      frame = 0;
      if (removed) return;
      if (step(Math.max(0, now - start))) {
        destroy();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  return {
    draw: (origin, free, snapped) => {
      if (removed) return;
      const straight = [origin, free];
      if (lift) {
        const elapsed = performance.now() - lift.start;
        const route = routeOnScreen(lift.route);
        if (route && elapsed < LIFT_MS) {
          paint(foldToward(route, straight, 1 - easeOut(elapsed / LIFT_MS)), snapped);
          return;
        }
        lift = null;
      }
      paint(straight, snapped);
    },

    liftFrom: (route) => {
      if (removed || route.points.length < 2 || prefersReducedMotion()) return;
      const onScreen = routeOnScreen(route);
      if (!onScreen) return;
      lift = { route, start: performance.now() };
      paint(onScreen, false);
    },

    land: (route, { onInk, onDone }) => {
      if (removed) return;
      let inked = false;
      const ink = (): void => {
        if (inked) return;
        inked = true;
        onInk();
      };
      const finish = (): void => {
        ink();
        onDone();
      };

      // Nothing to fold into, or no motion wanted: a crossfade, in place
      if (!route || route.points.length < 2 || shape.length === 0 || prefersReducedMotion()) {
        ink();
        play((elapsed) => {
          svg.style.opacity = String(Math.max(0, 1 - elapsed / FADE_MS));
          return elapsed >= FADE_MS;
        }, finish);
        return;
      }

      const source = shape;
      // A line that connected is already solid. One going home unconnected
      // stays a sketch all the way back, and the crossfade hands it to the
      // printed ink — no frame where it turns solid in mid-air.
      const snapped = lastSnapped ?? true;
      let target = routeOnScreen(route) ?? source;
      play((elapsed) => {
        const progress = Math.min(1, elapsed / LAND_MS);
        // Chased, not frozen: the sheet may still be scrolling under the line
        target = routeOnScreen(route) ?? target;
        paint(foldToward(target, source, easeOut(progress)), snapped);
        if (elapsed >= INK_AT_MS) ink();
        const fade = Math.min(1, Math.max(0, (elapsed - INK_AT_MS) / FADE_MS));
        svg.style.opacity = String(1 - fade);
        return progress >= 1 && fade >= 1;
      }, finish);
    },

    retract: (origin, onDone) => {
      if (removed) return;
      const finish = (): void => onDone?.();

      if (shape.length === 0 || prefersReducedMotion()) {
        play((elapsed) => {
          svg.style.opacity = String(Math.max(0, 1 - elapsed / FADE_MS));
          return elapsed >= FADE_MS;
        }, finish);
        return;
      }

      // Every corner drawn back into the pinned end. A straight line is just
      // its free end travelling home; a line let go while it was still
      // lifting off its route keeps that bend and gathers it in, rather than
      // springing straight in the first frame.
      const from = shape.slice(1);
      play((elapsed) => {
        const progress = Math.min(1, elapsed / RETRACT_MS);
        const home = origin();
        const t = easeOut(progress);
        paint([home, ...from.map((corner) => lerp(corner, home, t))], false);
        // The last of it goes as it reaches the dot, so nothing is left to cut
        svg.style.opacity = String(Math.min(1, 2 - 2 * progress));
        return progress >= 1;
      }, finish);
    },

    destroy,
  };
}
