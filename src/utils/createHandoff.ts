import { EASE_OUT_CSS, easeOut, prefersReducedMotion } from './easing';
import { findDragElement } from './dragLanding';
import { registerMotionFinisher } from './dragCluster';

/**
 * The moment a create gesture's preview becomes the thing it made.
 *
 * A ghost and the bar it promises are two different elements, drawn by two
 * different renders: the ghost is a sketch in the row the pointer is in,
 * following the pointer exactly, and the bar is solid ink on whole days in
 * the row it was made into — which for a row with something already in it is
 * the row below. Shown as-is, the release is a cut: the sketch vanishes, a
 * solid bar appears a row lower and up to half a day to either side (whole
 * days further where weekends are skipped), and every row beneath jumps down
 * to make room.
 *
 * The rows are `layoutFlip`'s to slide. This is the other half: the made thing
 * appears to come *out of* the ghost. A copy of the real element is laid over
 * the ghost's last box, with a copy of the ghost itself under it, and the pair
 * flies into the real element's live box on the rows' own clock and curve —
 * sliding down into its row, squaring up onto its days, and solidifying from
 * the dashed sketch into ink on the way. The real element stays hidden until
 * the flight lands on it, then takes over in the same frame.
 *
 * **How the ghost reaches the creation.** The gesture hook and the code that
 * writes the store never meet: rows wire one to the other through callbacks
 * that only carry pixels and a point. So the hook records the ghost —
 * `captureCreateSource` — and runs its callback inside `withCreateSource`;
 * `creationUtils` takes the source back out with `takeCreateSource` during
 * that same synchronous call. Nothing outlives the call, so a creation that
 * did not come from a gesture (the context menu) finds nothing and simply
 * fades its new row in where it stands, once the rows have opened room.
 */

export type CreateShape = 'span' | 'point';

export interface HandoffRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CreateSource {
  /** A span stretches into its box; a point keeps its own size and moves. */
  readonly shape: CreateShape;
  /** Where the gesture committed, in viewport px: the click, or the release. */
  readonly point: { readonly x: number; readonly y: number };
  /** The preview's box at that moment — null when none was on screen. */
  readonly rect: HandoffRect | null;
  /** A detached copy of the preview, cross-faded out as the flight lands. */
  readonly preview: HTMLElement | null;
  /**
   * A copy of a preview of the *other* shape that the surface happened to be
   * showing — the bar ghost under a click that made a task, because ⌥ was
   * already down when the window took focus and the row never heard it. It is
   * not what was made, so nothing flies out of it; it only fades where it was.
   */
  readonly stray: HTMLElement | null;
  /** The surface the gesture was made on. */
  readonly surface: HTMLElement | null;
}

/**
 * Marks a create preview so the gesture can find it inside its own row. The
 * value is the preview's shape: `span` on `GhostBar`, `point` on `GhostTask`
 * and `GhostMilestone`.
 */
export const CREATE_PREVIEW_ATTR = 'data-create-ghost';

/** The share of a fade-in spent waiting for the rows to open the gap. */
const APPEAR_HOLD = 0.25;
/** A preview that is called off goes out on the fast duration. */
const DISMISS_MS = 120;
/**
 * Over the sheet, under everything that floats above it: the wash rows
 * dissolve into under the axis (z-30), the sticky schedule bands (z-40), the
 * axis itself and the editor that opens on the new item (z-50). The rows the
 * flight crosses are isolated inside the plot, so any positive layer clears
 * them.
 */
const FLIGHT_Z_INDEX = '29';
/** Same hide the drag landing uses: `opacity: 0 !important` until hand-over. */
const LANDING_ATTR = 'data-drag-landing';
const SCROLLPORT_SELECTOR = '.timeline-scroll-container';
const PLOT_SELECTOR = '[data-flip-column="plot"]';

// -- the hand from gesture to creation ---------------------------------------

let pendingSource: CreateSource | null = null;

/** Run a create callback with the gesture's preview available to it. */
export function withCreateSource<T>(source: CreateSource, create: () => T): T {
  pendingSource = source;
  try {
    return create();
  } finally {
    pendingSource = null;
  }
}

/** The preview of the gesture making this item, once — or null. */
export function takeCreateSource(): CreateSource | null {
  const source = pendingSource;
  pendingSource = null;
  return source;
}

/** Attributes that make an element findable or focusable — no copy keeps them. */
function stripCopy(root: HTMLElement): void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const node of nodes) {
    for (const { name } of Array.from(node.attributes)) {
      if (
        name === 'id' ||
        name === 'tabindex' ||
        name === 'role' ||
        name.startsWith('aria-') ||
        name.startsWith('data-')
      ) {
        node.removeAttribute(name);
      }
    }
    // An entrance replays on every new element; a copy is already there
    node.classList.remove('ghost-enter');
  }
  root.setAttribute('aria-hidden', 'true');
}

function boxOf(element: Element): HandoffRect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Record the preview a gesture on `surface` is showing, before the render that
 * removes it. Called the instant a gesture commits.
 *
 * Only a preview of the gesture's own shape is something to fly out of. A task
 * flown from the middle of a thirty-day bar ghost would start a long way from
 * the click that made it.
 */
export function captureCreateSource(
  surface: HTMLElement | null,
  shape: CreateShape,
  point: { readonly x: number; readonly y: number }
): CreateSource {
  const none: CreateSource = { shape, point, rect: null, preview: null, stray: null, surface };
  const element = surface?.querySelector<HTMLElement>(`[${CREATE_PREVIEW_ATTR}]`) ?? null;
  if (!element?.isConnected) return none;
  const isSameShape = element.getAttribute(CREATE_PREVIEW_ATTR) === shape;
  const copy = element.cloneNode(true) as HTMLElement;
  stripCopy(copy);
  if (!isSameShape) return { ...none, stray: copy };
  return { ...none, rect: boxOf(element), preview: copy };
}

// -- geometry ------------------------------------------------------------------

/**
 * Where the flight starts, given the box it is landing in.
 *
 * A span starts as the ghost's own box. A point starts at its own size,
 * centred where the ghost's centre was: a task circle or a milestone diamond
 * is the same glyph in the preview and on the sheet, and only its place
 * changes. With no preview on screen the gesture's point stands in for it —
 * a span grows out of it sideways, as the hover ghost does when it appears.
 */
export function handoffOrigin(
  source: Pick<CreateSource, 'shape' | 'point' | 'rect'>,
  target: HandoffRect
): HandoffRect {
  if (source.shape === 'point') {
    const centreX = source.rect ? source.rect.left + source.rect.width / 2 : source.point.x;
    const centreY = source.rect ? source.rect.top + source.rect.height / 2 : source.point.y;
    return {
      left: centreX - target.width / 2,
      top: centreY - target.height / 2,
      width: target.width,
      height: target.height,
    };
  }
  if (source.rect) return source.rect;
  return {
    left: source.point.x,
    top: source.point.y - target.height / 2,
    width: 0,
    height: target.height,
  };
}

/**
 * One frame of the flight.
 *
 * The flight chases the target's *live* box rather than the one it had at the
 * start, because the schedule around it is still settling. What decays is the
 * offset between where the flight began and where the target then was — so
 * whatever the target does meanwhile, the flight is on it when `progress`
 * reaches 1.
 */
export function handoffFrame(
  origin: HandoffRect,
  start: HandoffRect,
  live: HandoffRect,
  progress: number
): HandoffRect {
  const remaining = 1 - easeOut(Math.min(1, Math.max(0, progress)));
  return {
    left: live.left + (origin.left - start.left) * remaining,
    top: live.top + (origin.top - start.top) * remaining,
    width: Math.max(0, live.width + (origin.width - start.width) * remaining),
    height: Math.max(0, live.height + (origin.height - start.height) * remaining),
  };
}

// -- motion ---------------------------------------------------------------------

/** Every flight and fade still running, so a new gesture can finish them. */
const finishers = new Set<() => void>();
let isWatching = false;

/**
 * A press anywhere while something is still landing finishes it first — a
 * new gesture wins, and nothing it picks up should be half-hidden.
 */
function handleInterrupt(): void {
  finishCreateMotion();
}

function watch(finish: () => void): void {
  finishers.add(finish);
  if (isWatching) return;
  isWatching = true;
  window.addEventListener('pointerdown', handleInterrupt, true);
}

function unwatch(finish: () => void): void {
  finishers.delete(finish);
  if (finishers.size > 0 || !isWatching) return;
  isWatching = false;
  window.removeEventListener('pointerdown', handleInterrupt, true);
}

/** End every handoff still in flight, at its end state. A new gesture wins. */
export function finishCreateMotion(): void {
  Array.from(finishers).forEach((finish) => finish());
}

function canAnimate(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function'
  );
}

/** Track a Web Animation as a handoff, so it can be finished early. */
function trackAnimation(animation: Animation): void {
  const finish = (): void => {
    unwatch(finish);
    if (animation.playState !== 'finished') animation.finish();
  };
  watch(finish);
  const forget = (): void => unwatch(finish);
  animation.addEventListener('finish', forget);
  animation.addEventListener('cancel', forget);
}

/**
 * Fade an element in where it already stands, once the rows around it have
 * mostly opened the gap it sits in — a row fading in on top of the one still
 * sliding out of its way reads as two names printed over each other.
 */
function appearInPlace(element: HTMLElement, duration: number): void {
  trackAnimation(
    element.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: APPEAR_HOLD, easing: EASE_OUT_CSS },
        { opacity: 1, offset: 1 },
      ],
      { duration, easing: 'linear' }
    )
  );
}

/**
 * A copy of the made thing exactly as it will be revealed — selected, its
 * link dots showing, its hover-only parts hidden — because the last frame of
 * the flight is the copy and the next is the element, and anything that
 * differs between them is a blink.
 */
function copyForFlight(element: HTMLElement): HTMLElement {
  const copy = element.cloneNode(true) as HTMLElement;
  stripCopy(copy);
  return copy;
}

/**
 * Hide the made element for the flight, or hand it back, without the opacity
 * transition it may carry on the sheet.
 *
 * A milestone or a task fades when it is lifted (`.timeline-point`), and that
 * same transition would run here too, both ways: the real glyph fading *out*
 * at its destination while its copy is still flying there — two glyphs on the
 * sheet at once — and fading back *in* after the copy has gone, which is a
 * blink at the very moment of hand-over. The new opacity is resolved with the
 * transition switched off, so it simply is.
 */
function setLanding(element: HTMLElement, isLanding: boolean): void {
  if (element.hasAttribute(LANDING_ATTR) === isLanding) return;
  const previous = element.style.transition;
  element.style.transition = 'none';
  if (isLanding) element.setAttribute(LANDING_ATTR, '');
  else element.removeAttribute(LANDING_ATTR);
  void getComputedStyle(element).opacity;
  element.style.transition = previous;
}

/** Stretch a copy to fill the flight box, whatever offsets it carried. */
function fillBox(layer: HTMLElement): HTMLElement {
  // `inset` first: it is shorthand for all four offsets, and setting it after
  // left/top would blank them.
  layer.style.inset = 'auto';
  layer.style.position = 'absolute';
  layer.style.left = '0';
  layer.style.top = '0';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.margin = '0';
  layer.style.pointerEvents = 'none';
  // The flight writes opacity every frame; a transition the element carries
  // on the sheet (a point fades when lifted) would trail behind each write.
  layer.style.transition = 'none';
  return layer;
}

/**
 * The ghost's layer in the flight box.
 *
 * A span's ghost *is* its box, so it stretches with it. A point's ghost is a
 * zero-width strip as tall as the row it was in, with its glyph on the strip's
 * centre line and a hint or a reference line laid out against that row; it
 * keeps that size and rides centred on the flying glyph, so on the first frame
 * every part of it is exactly where it was on the sheet.
 */
function sketchLayer(preview: HTMLElement, source: CreateSource): HTMLElement {
  const layer = fillBox(preview);
  if (source.shape === 'point' && source.rect) {
    const { width, height } = source.rect;
    layer.style.left = `calc(50% - ${width / 2}px)`;
    layer.style.top = `calc(50% - ${height / 2}px)`;
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
  }
  return layer;
}

/**
 * The window the flight is seen through: the sheet's scrollport. A bar that
 * runs past the visible part of the sheet is cut off by it on the sheet, and
 * must be in flight too, rather than painting over the panels beside it.
 */
function makeViewport(): {
  readonly element: HTMLElement;
  readonly left: number;
  readonly top: number;
} {
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true');
  // The copy of a bar carries its handles and link dots, which are buttons;
  // for the moment it is in the air none of them should take focus or a click
  element.setAttribute('inert', '');
  const scrollport = document.querySelector<HTMLElement>(SCROLLPORT_SELECTOR);
  const bounds = scrollport
    ? scrollport.getBoundingClientRect()
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  Object.assign(element.style, {
    position: 'fixed',
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: FLIGHT_Z_INDEX,
  });
  document.body.appendChild(element);
  return { element, left: bounds.left, top: bounds.top };
}

function fly(
  target: HTMLElement,
  resolve: () => HTMLElement | null,
  source: CreateSource,
  duration: number
): void {
  const start = boxOf(target);
  const origin = handoffOrigin(source, start);
  const viewport = makeViewport();

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    margin: '0',
    pointerEvents: 'none',
    willChange: 'transform',
  });
  const sketch = source.preview ? sketchLayer(source.preview, source) : null;
  const solid = fillBox(copyForFlight(target));
  if (sketch) box.appendChild(sketch);
  box.appendChild(solid);
  viewport.element.appendChild(box);

  let element: HTMLElement | null = target;
  setLanding(element, true);
  let frame = 0;
  let isDone = false;
  let clock: Animation | null = null;

  const finish = (): void => {
    if (isDone) return;
    isDone = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    unwatch(finish);
    clock?.cancel();
    if (element) setLanding(element, false);
    viewport.element.remove();
  };

  const paint = (progress: number): void => {
    // React may have re-made the element (a re-key, a remount); follow it.
    if (!element?.isConnected) {
      element = resolve();
      if (!element) {
        finish();
        return;
      }
      setLanding(element, true);
    }
    const at = handoffFrame(origin, start, boxOf(element), progress);
    box.style.transform = `translate3d(${at.left - viewport.left}px, ${at.top - viewport.top}px, 0)`;
    box.style.width = `${at.width}px`;
    box.style.height = `${at.height}px`;
    // The sketch gives way to the ink on the same curve the box moves on, so
    // it becomes solid as it drops into place rather than after it arrives.
    const solidity = easeOut(Math.min(1, progress));
    solid.style.opacity = String(solidity);
    if (sketch) sketch.style.opacity = String(1 - solidity);
  };

  // The first frame is the ghost itself, painted before the browser draws the
  // commit, so there is never a frame with neither.
  paint(0);
  if (isDone) return;
  watch(finish);

  // The rows are Web Animations, and a Web Animation's clock starts on the
  // frame after it is created, not at the moment it is. Timing the flight off
  // `performance.now()` left it a frame behind the rows it travels with. A
  // silent animation made in the same task starts on the same frame, so its
  // `currentTime` is the rows' own clock — and the browser updates it before
  // any frame callback runs, so every frame reads the same instant the rows
  // are drawn at.
  const timer = box.animate([{ opacity: 1 }, { opacity: 1 }], { duration });
  clock = timer;
  const step = (): void => {
    frame = 0;
    if (isDone) return;
    const elapsed = Number(timer.currentTime ?? 0);
    const progress = timer.playState === 'finished' ? 1 : elapsed / duration;
    paint(progress);
    if (isDone) return;
    if (progress >= 1) {
      finish();
      return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

/** Where the made item is drawn, as seen from the surface the gesture was on. */
function findMade(itemId: string, surface: HTMLElement | null): HTMLElement | null {
  // A stand-in surface (a schedule's band held under the axis) is the only
  // place the gesture's author is looking; the sheet's own copy of the row
  // has scrolled away beneath it.
  if (surface && !surface.closest(PLOT_SELECTOR)) {
    return surface.querySelector<HTMLElement>(`[data-drag-item="${CSS.escape(itemId)}"]`);
  }
  return findDragElement('plot', itemId);
}

/**
 * A called-off preview fades where it stood instead of blinking out.
 *
 * The copy goes back into the gesture's own surface, at the offsets it was
 * drawn with, as the surface's first child — so it is under the row's bars,
 * exactly where the ghost was, for the moment it takes to go.
 */
export function dismissCreatePreview(source: CreateSource): void {
  if (source.preview) fadeWhereItStood(source.preview, source.surface);
  if (source.stray) fadeWhereItStood(source.stray, source.surface);
}

function fadeWhereItStood(copy: HTMLElement, surface: HTMLElement | null): void {
  if (!surface?.isConnected || !canAnimate() || prefersReducedMotion()) return;
  copy.style.pointerEvents = 'none';
  surface.insertBefore(copy, surface.firstChild);
  const animation = copy.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: DISMISS_MS,
    easing: EASE_OUT_CSS,
    fill: 'forwards',
  });
  const remove = (): void => copy.remove();
  animation.addEventListener('finish', remove);
  animation.addEventListener('cancel', remove);
  trackAnimation(animation);
}

/**
 * Play the handoff for an item that has just been committed and rendered.
 * Call it right after the commit, in the same task, so the first frame the
 * browser paints already has the flight in it.
 */
export function playCreateHandoff(
  itemId: string,
  source: CreateSource | null,
  duration: number
): void {
  if (!canAnimate() || prefersReducedMotion() || duration <= 0) return;

  // A preview of something other than what was made goes the way a called-off
  // one does
  if (source?.stray) fadeWhereItStood(source.stray, source.surface);

  // The name arrives in the labels column the way any new row does there
  const label = findDragElement('labels', itemId);
  if (label) appearInPlace(label, duration);

  const target = findMade(itemId, source?.surface ?? null);
  if (!target) {
    // Made somewhere that is not drawn — a folded schedule, a band's copy that
    // has no handle on it. The sketch fades where it was.
    if (source?.preview) fadeWhereItStood(source.preview, source.surface);
    return;
  }
  if (!source) {
    appearInPlace(target, duration);
    return;
  }
  fly(target, () => findMade(itemId, source.surface), source, duration);
}

// Anything that ends the sheet's other motions — a new drag, an undo, a
// keyboard move — ends a creation still flying out of its ghost too.
registerMotionFinisher(finishCreateMotion);
