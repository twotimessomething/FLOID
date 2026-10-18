import { dayKeyDiff } from './dayKeys';
import { EASE_OUT_CSS, prefersReducedMotion } from './easing';
import { HEADER_HEIGHT } from './timelineUtils';

/**
 * Rows that slide into their new places instead of jumping there.
 *
 * A drop rewrites the tree in one store write, and React lays the result out
 * in one frame: every row below the gap the item left moves up a row, every
 * row below the slot it took moves down one, and two schedules change height.
 * Shown as-is that is the whole sheet twitching at once. This records where
 * everything stood, lets the commit happen, and then plays the difference out
 * on the app's own curve — First, Last, Invert, Play.
 *
 * Two kinds of thing move, and they move differently:
 *
 * - A **schedule** changes height, so its height is what animates. Pinning
 *   every schedule to the height it had before the commit means the browser
 *   never lays out the new sheet in one go — which matters at the bottom of a
 *   scroll, where a sheet that suddenly shrank would have its scroll position
 *   clamped and the whole view would drop by a row. Grown or shrunk a little
 *   each frame, the clamp happens a little each frame too, and reads as the
 *   sheet settling. Everything below follows by plain layout, tints and
 *   hairlines included. A schedule that changed *place* — a reorder — slides
 *   there with a transform.
 * - A **row** keeps its height and changes place inside its schedule, so it
 *   slides with a transform measured against its schedule. The schedule's own
 *   motion carries it the rest of the way; both run on one clock with one
 *   curve, so the sum is exactly a straight line from where the row was to
 *   where it now is.
 *
 * Both columns are recorded and played together, which is what keeps a
 * label beside its bar for every frame of the settle.
 *
 * Transforms go on the rows and schedules, never on the scroll container's
 * content as a whole (see `Timeline.tsx` on overscroll). A row moving within
 * the sheet does not change the sheet's own extent, so the scroll position is
 * never clamped by the animation itself.
 */

type ColumnName = 'labels' | 'plot';

interface SectionRecord {
  readonly top: number;
  readonly height: number;
}

interface ColumnRecord {
  readonly sections: Map<string, SectionRecord>;
  readonly rows: Map<string, number>;
  /** Each bar's ink, by item id — colour is resolved from position, so a drop recolours. */
  readonly inks: Map<string, string>;
  /** Screen x of the viewport's first day — moves when the sheet re-anchors. */
  readonly originX: number | null;
}

export interface LayoutSnapshot {
  readonly columns: ReadonlyMap<ColumnName, ColumnRecord>;
  /** Every schedule element held at its old height until the play begins. */
  readonly pinned: readonly HTMLElement[];
}

export interface PlayLayoutOptions {
  readonly duration: number;
  /** Rows another animation is already carrying — the drag clone's landing. */
  readonly skip?: { readonly column: ColumnName; readonly ids: ReadonlySet<string> };
}

const COLUMN_SELECTOR = '[data-flip-column]';
const SECTION_SELECTOR = '[data-flip-section]';
const ROW_SELECTOR = '[data-flip-item]';

/** Below this a difference is a rounding error, not a move. */
const MIN_DELTA_PX = 0.5;

const running = new Set<Animation>();
let settleTimer: number | null = null;

/** The body class that holds back whatever is drawn from data mid-settle. */
const SETTLING_CLASS = 'layout-settling';

function columnRoots(): Map<ColumnName, HTMLElement> {
  const roots = new Map<ColumnName, HTMLElement>();
  document.querySelectorAll<HTMLElement>(COLUMN_SELECTOR).forEach((root) => {
    const name = root.dataset.flipColumn;
    if (name === 'labels' || name === 'plot') roots.set(name, root);
  });
  return roots;
}

/**
 * Where a fixed date sits on screen. The sheet is anchored a month before its
 * first item, so a drop that moves the first item moves the anchor, and
 * `Timeline` scrolls to compensate — exactly, unless the scroll position runs
 * out at zero. Whatever the compensation could not absorb is a sideways jump
 * of the whole sheet, and this is how it is measured.
 */
function originX(root: HTMLElement): number | null {
  const start = root.dataset.flipOrigin;
  const pixelsPerDay = Number(root.dataset.flipPpd);
  if (!start || !(pixelsPerDay > 0)) return null;
  // Measured against a date that cannot move — the epoch — so two anchors can
  // be compared without either one being the reference.
  return root.getBoundingClientRect().left - dayKeyDiff('2000-01-01', start) * pixelsPerDay;
}

/** First: where every schedule and row stands before the commit. */
export function captureLayout(): LayoutSnapshot {
  finishLayoutAnimations();

  const columns = new Map<ColumnName, ColumnRecord>();
  const pinned: HTMLElement[] = [];

  columnRoots().forEach((root, name) => {
    const sections = new Map<string, SectionRecord>();
    root.querySelectorAll<HTMLElement>(SECTION_SELECTOR).forEach((el) => {
      const id = el.dataset.flipSection;
      if (!id) return;
      const rect = el.getBoundingClientRect();
      sections.set(id, { top: rect.top, height: el.offsetHeight });
      pinned.push(el);
    });

    const rows = new Map<string, number>();
    root.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((el) => {
      const id = el.dataset.flipItem;
      if (id) rows.set(id, el.getBoundingClientRect().top);
    });

    const inks = new Map<string, string>();
    inkFills(root).forEach(({ id, fill }) => inks.set(id, getComputedStyle(fill).backgroundColor));

    columns.set(name, { sections, rows, inks, originX: originX(root) });
  });

  // All reads before any write, so recording costs one layout rather than one
  // per schedule. The pins are what keep the commit from laying out the new
  // sheet before the play has had a chance to take over.
  pinned.forEach((el) => {
    const record = columns
      .get(el.closest<HTMLElement>(COLUMN_SELECTOR)?.dataset.flipColumn as ColumnName)
      ?.sections.get(el.dataset.flipSection ?? '');
    if (record) el.style.height = `${record.height}px`;
  });

  return { columns, pinned };
}

/**
 * Every bar's fill on the sheet, rows and folded tape alike. A root bar's
 * colour comes from its place in the schedule, so moving one bar repaints the
 * ones it passed; they should be seen to change, not to have changed.
 */
function inkFills(root: HTMLElement): { id: string; fill: HTMLElement }[] {
  const found: { id: string; fill: HTMLElement }[] = [];
  root.querySelectorAll<HTMLElement>('[data-drop-bar], [data-tape-item]').forEach((bar) => {
    const id = bar.dataset.dropBar ?? bar.dataset.tapeItem;
    const fill = bar.querySelector<HTMLElement>(':scope > .timeline-bar__fill');
    if (id && fill) found.push({ id, fill });
  });
  return found;
}

/** A schedule's height if nothing were holding it: the stack of what it holds. */
export function naturalHeight(el: HTMLElement): number {
  const style = getComputedStyle(el);
  let height = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) height += child.offsetHeight;
  }
  return height;
}

function track(animation: Animation): void {
  running.add(animation);
  const forget = (): void => {
    running.delete(animation);
  };
  animation.addEventListener('finish', forget);
  animation.addEventListener('cancel', forget);
}

/** Last, Invert, Play: measure the committed sheet and slide it there. */
export function playLayout(snapshot: LayoutSnapshot, { duration, skip }: PlayLayoutOptions): void {
  // No Web Animations (jsdom, a very old WebView) is the same answer as asking
  // for less motion: the sheet is simply where the commit put it.
  const canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const reduced = !canAnimate || prefersReducedMotion() || duration <= 0;
  const roots = columnRoots();

  interface SectionPlan {
    readonly id: string;
    readonly el: HTMLElement;
    readonly from: number;
    readonly to: number;
    readonly shift: number;
  }
  interface RowPlan {
    readonly el: HTMLElement;
    readonly shift: number;
  }
  const sectionPlans: SectionPlan[] = [];
  const rowPlans: RowPlan[] = [];
  /** Rows the commit brought into view — a folded group a drop opened. */
  const arrivals: HTMLElement[] = [];
  const recolours: { fill: HTMLElement; from: string; to: string }[] = [];
  let sheetShift = 0;
  const scroller = document.querySelector<HTMLElement>('.timeline-scroll-container');
  // The top of what can be seen: under the date axis
  const visibleTop = scroller ? scroller.getBoundingClientRect().top + HEADER_HEIGHT : -Infinity;
  /**
   * Schedules wholly above the visible sheet that changed height. Animating
   * their height would slide everything on screen by the difference — a group
   * dragged out of a schedule three screens up would carry the view with it.
   * They take their new height at once, and the scroll position absorbs it.
   */
  const offscreen = new Set<string>();
  let absorbed = 0;

  // Last — every read, under the pins, before any animation is written.
  roots.forEach((root, name) => {
    const before = snapshot.columns.get(name);
    if (!before) return;

    const sectionTops = new Map<string, number>();
    root.querySelectorAll<HTMLElement>(SECTION_SELECTOR).forEach((el) => {
      const id = el.dataset.flipSection;
      if (!id) return;
      const top = el.getBoundingClientRect().top;
      sectionTops.set(id, top);
      const old = before.sections.get(id);
      const from = old?.height ?? el.offsetHeight;
      const to = naturalHeight(el);
      if (name === 'plot' && old && old.top + old.height <= visibleTop && from !== to) {
        offscreen.add(id);
        absorbed += to - from;
      }
      sectionPlans.push({
        id,
        el,
        from,
        to,
        // Under the pins every schedule still has its old height, so whatever
        // moved it now is a change of order, not of size.
        shift: old ? old.top - top : 0,
      });
    });

    root.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((el) => {
      const id = el.dataset.flipItem;
      if (!id || (skip && skip.column === name && skip.ids.has(id))) return;
      const oldTop = before.rows.get(id);
      const sectionEl = el.closest<HTMLElement>(SECTION_SELECTOR);
      const sectionId = sectionEl?.dataset.flipSection;
      if (oldTop === undefined) {
        arrivals.push(el);
        return;
      }
      if (!sectionId) return;
      const oldSection = before.sections.get(sectionId);
      const newSectionTop = sectionTops.get(sectionId);
      if (!oldSection || newSectionTop === undefined) return;
      // Measured from the schedule it is in *now*, as that schedule stood
      // before: a row that crossed schedules lands correctly because the
      // schedule's own slide supplies the rest of the trip.
      const shift = oldTop - oldSection.top - (el.getBoundingClientRect().top - newSectionTop);
      if (Math.abs(shift) >= MIN_DELTA_PX) rowPlans.push({ el, shift });
    });

    inkFills(root).forEach(({ id, fill }) => {
      if (skip && skip.column === name && skip.ids.has(id)) return;
      const from = before.inks.get(id);
      const to = getComputedStyle(fill).backgroundColor;
      if (from && from !== to) recolours.push({ fill, from, to });
    });

    if (name === 'plot' && before.originX !== null) {
      const after = originX(root);
      if (after !== null) sheetShift = after - before.originX;
    }
  });

  // Play.
  if (reduced) {
    snapshot.pinned.forEach((el) => {
      el.style.height = '';
    });
    return;
  }

  // `backwards`: an animation holds its first frame until it starts, so a
  // start moved later by `alignLayoutAnimations` never shows the final sheet early
  const timing: KeyframeAnimationOptions = { duration, easing: EASE_OUT_CSS, fill: 'backwards' };

  sectionPlans.forEach(({ id, el, from, to, shift }) => {
    if (Math.abs(from - to) >= MIN_DELTA_PX && !offscreen.has(id)) {
      track(el.animate([{ height: `${from}px` }, { height: `${to}px` }], timing));
    }
    if (Math.abs(shift) >= MIN_DELTA_PX) {
      track(
        el.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], timing)
      );
    }
  });
  // The animations hold the old heights from here; the pins can go.
  snapshot.pinned.forEach((el) => {
    el.style.height = '';
  });

  // What the schedules above the view gained or lost comes off the scroll
  // position in the same frame, so nothing on screen moves for it. The labels
  // column follows here rather than a frame late from the scroll event.
  if (scroller && Math.abs(absorbed) >= MIN_DELTA_PX) {
    scroller.scrollTop += absorbed;
    const labels = roots.get('labels');
    if (labels) labels.style.transform = `translateY(-${scroller.scrollTop}px)`;
  }

  rowPlans.forEach(({ el, shift }) => {
    track(el.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], timing));
  });

  // Nothing to slide from, so they arrive in place: the schedule opens to make
  // room for them and they fade up into it, rather than the room appearing
  // already full.
  // Held back for the first quarter, while the room opens, then faded in on
  // the curve — the same arrival a newly made item gets (`createHandoff.ts`).
  arrivals.forEach((el) => {
    track(
      el.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.25, easing: EASE_OUT_CSS },
          { opacity: 1, offset: 1 },
        ],
        { ...timing, easing: 'linear' }
      )
    );
  });

  recolours.forEach(({ fill, from, to }) => {
    track(fill.animate([{ backgroundColor: from }, { backgroundColor: to }], timing));
  });

  // The anchor ran out: slide the whole sheet the last few pixels instead of
  // jumping it. The scroll container is the one thing a transform can go on
  // without disturbing the scroll extent.
  if (scroller && Math.abs(sheetShift) >= MIN_DELTA_PX) {
    track(
      scroller.animate(
        [{ transform: `translateX(${-sheetShift}px)` }, { transform: 'none' }],
        timing
      )
    );
  }

  // Lines drawn from data — dependency ink — are already at their new places
  // while the rows are still travelling there. They step out of the way for
  // the settle and come back once the rows have arrived.
  if (running.size > 0) {
    document.body.classList.add(SETTLING_CLASS);
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      document.body.classList.remove(SETTLING_CLASS);
    }, duration);
  }
}

/**
 * Start every slide in flight at one moment.
 *
 * A slide's start is otherwise whenever the compositor first gets to it, and
 * a drop's landing flight starts on its own first frame. On a long trip a few
 * milliseconds apart on this curve is a fifth of the travel — enough for the
 * clone and the row it is chasing to visibly disagree. The flight calls this
 * with its own start, and both run on one clock.
 */
export function alignLayoutAnimations(startTime: number): void {
  running.forEach((animation) => {
    animation.startTime = startTime;
  });
}

/** Snap anything still settling to where it was going. A new gesture wins. */
export function finishLayoutAnimations(): void {
  Array.from(running).forEach((animation) => animation.finish());
  running.clear();
  if (settleTimer !== null) {
    window.clearTimeout(settleTimer);
    settleTimer = null;
  }
  document.body.classList.remove(SETTLING_CLASS);
}

/**
 * Commit a change to the sheet with its rows sliding into place.
 *
 * `commit` must leave the DOM in its final state when it returns — wrap the
 * store write in `flushSync` — because the measurement happens right after it.
 */
export function animateLayout(commit: () => void, duration: number): void {
  const snapshot = captureLayout();
  try {
    commit();
  } finally {
    playLayout(snapshot, { duration });
  }
}
