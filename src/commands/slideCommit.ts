import { flushSync } from 'react-dom';
import { captureLayout, naturalHeight, playLayout } from '../utils/layoutFlip';
import { finishDragMotion, settleDuration } from '../utils/dragCluster';
import { finishCreateMotion } from '../utils/createHandoff';
import { EASE_OUT_CSS, prefersReducedMotion } from '../utils/easing';
import { dayKeyDiff } from '../utils/dayKeys';

/**
 * Store writes that rearrange the sheet without a pointer in hand.
 *
 * Move up, Move out of group, Pin to top, Delete, Undo: each is one store
 * write, and each would otherwise lay the new sheet out in a single frame —
 * the rows under the change jumping a row, a pinned schedule teleporting to
 * the top. A drop gets its rows slid into place by `layoutFlip`; these owe the
 * user the same courtesy, and they get it from the same code, on the same
 * clock and curve, so a keyboard move and a dropped bar settle identically.
 *
 * A drop only ever moves rows. History and the menus can change more than
 * that, and every one of those changes is played out here rather than cut:
 *
 * - **Dates.** Undoing a sideways drag or a resize puts a bar back on other
 *   days. It glides there — position on `translate`, which composes with the
 *   centring transforms point glyphs already carry, and length on `width`.
 * - **Folding a schedule.** Its bars become the tape on its own row, and the
 *   tape becomes bars again: each one flies between its row and its strip —
 *   the two are the same item, so the eye sees the schedule fold up into its
 *   header rather than the rows vanishing and a tape appearing.
 * - **Arrivals.** Undoing a delete, expanding a group: what comes back waits
 *   for the rows to open its gap and then fades up into it — the same timing
 *   a newly made item gets (`createHandoff`), and for the same reason: a row
 *   fading in over the one still sliding out of its way reads as two names
 *   printed over each other.
 * - **Departures.** What a delete or a fold takes away stays where it stood
 *   and fades, cut off along the edge of the paper closing over it, so the
 *   row sliding up never prints over the one leaving (see `Wipe`).
 * - **Depth.** Moving something in or out of a group changes its label's
 *   indent; the name slides to its new depth.
 */

type ColumnName = 'labels' | 'plot';

const COLUMN_SELECTOR = '[data-flip-column]';
/** Everything with an identity on the sheet: schedules, rows, the ink in them, the tape. */
const IDENTITY_SELECTOR =
  '[data-flip-section], [data-flip-item], [data-drag-item], [data-tape-item]';
const SECTION_SELECTOR = '[data-flip-section]';
const ROW_SELECTOR = '[data-flip-item]';
/** `layoutFlip`'s class for "ink drawn from data is ahead of the rows". */
const SETTLING_CLASS = 'layout-settling';
/** A date that cannot move, to measure the sheet's own re-anchoring out. */
const EPOCH = '2000-01-01';
/** Below this a difference is a rounding error, not a move. */
const MIN_DELTA_PX = 0.5;
/** The share of an arrival spent waiting for the rows to open its gap — as `createHandoff`'s. */
const APPEAR_HOLD = 0.25;
/** `--duration-fast`: ink that leaves with no gap closing over it goes quickly. */
const EXIT_MS = 120;

const APPEAR_KEYFRAMES: Keyframe[] = [
  { opacity: 0, offset: 0 },
  { opacity: 0, offset: APPEAR_HOLD, easing: EASE_OUT_CSS },
  { opacity: 1, offset: 1 },
];
/**
 * Holds a row at full ink over `layoutFlip`'s own arrival fade, which it plays
 * on every new row: a row whose bar is flying in from the tape must not fade
 * out from under the bar while it flies.
 */
const STEADY_KEYFRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

/** `d:` an item's ink, `t:` its strip on a folded schedule's tape, `r:` a row, `s:` a schedule. */
function identityOf(el: HTMLElement): string | null {
  const { flipSection, flipItem, dragItem, tapeItem } = el.dataset;
  if (flipSection) return `s:${flipSection}`;
  if (flipItem) return `r:${flipItem}`;
  if (dragItem) return `d:${dragItem}`;
  if (tapeItem) return `t:${tapeItem}`;
  return null;
}

const isInk = (key: string): boolean => key.startsWith('d:') || key.startsWith('t:');
const itemIdOf = (key: string): string => key.slice(2);

function columnRoots(): Map<ColumnName, HTMLElement> {
  const roots = new Map<ColumnName, HTMLElement>();
  document.querySelectorAll<HTMLElement>(COLUMN_SELECTOR).forEach((root) => {
    const name = root.dataset.flipColumn;
    if (name === 'labels' || name === 'plot') roots.set(name, root);
  });
  return roots;
}

/**
 * Where the epoch sits on screen. The plot is anchored a month before its
 * first item and scrolled to compensate when that moves, so a raw screen x
 * mixes the item's own move with the sheet's. Measured against the epoch,
 * only the item's own move is left.
 */
function epochX(root: HTMLElement): number | null {
  const offset = epochOffset(root);
  return offset === null ? null : root.getBoundingClientRect().left + offset;
}

/** The epoch's x inside the column itself — 0 for a column with no dates. */
function epochOffset(root: HTMLElement): number | null {
  const start = root.dataset.flipOrigin;
  const pixelsPerDay = Number(root.dataset.flipPpd);
  if (!start || !(pixelsPerDay > 0)) return null;
  return -dayKeyDiff(EPOCH, start) * pixelsPerDay;
}

function sectionIdOf(el: HTMLElement): string | null {
  return el.closest<HTMLElement>(SECTION_SELECTOR)?.dataset.flipSection ?? null;
}

// -- First: the sheet before the write ---------------------------------------

interface InkRecord {
  /** Left edge in sheet pixels from the epoch — independent of scroll and anchor. */
  readonly x: number;
  readonly width: number;
  /** Screen top, read against `sectionTops` of the same record. */
  readonly top: number;
  readonly height: number;
}

interface Leaving {
  readonly el: HTMLElement;
  readonly key: string;
  /** The schedule it stood in; null for a schedule itself. */
  readonly sectionId: string | null;
  /** Its box inside the column, where a copy of it can stand once it has gone. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface ColumnRecord {
  readonly root: HTMLElement;
  /** Where the epoch sat inside the column: the sheet re-anchors when its first item moves. */
  readonly epochOffset: number;
  readonly present: ReadonlySet<string>;
  readonly sectionTops: ReadonlyMap<string, number>;
  /** Plot only: every bar, point and strip by identity, in document order. */
  readonly ink: ReadonlyMap<string, readonly InkRecord[]>;
  /** Labels only: each row's indent, as React wrote it. */
  readonly indents: ReadonlyMap<string, string>;
  /** Everything that could be gone after the write. */
  readonly leaving: readonly Leaving[];
}

type SheetRecord = ReadonlyMap<ColumnName, ColumnRecord>;

/** Reads only, one pass per column. */
function recordSheet(): SheetRecord {
  const record = new Map<ColumnName, ColumnRecord>();

  columnRoots().forEach((root, column) => {
    const rootRect = root.getBoundingClientRect();
    const epoch = column === 'plot' ? epochX(root) : null;
    const present = new Set<string>();
    const sectionTops = new Map<string, number>();
    const ink = new Map<string, InkRecord[]>();
    const indents = new Map<string, string>();
    const leaving: Leaving[] = [];

    root.querySelectorAll<HTMLElement>(IDENTITY_SELECTOR).forEach((el) => {
      const key = identityOf(el);
      if (!key) return;
      present.add(key);
      const rect = el.getBoundingClientRect();
      leaving.push({
        el,
        key,
        sectionId: el.dataset.flipSection ? null : sectionIdOf(el),
        left: rect.left - rootRect.left,
        top: rect.top - rootRect.top,
        width: rect.width,
        height: rect.height,
      });
      if (el.dataset.flipSection) sectionTops.set(el.dataset.flipSection, rect.top);
      if (column === 'labels' && el.dataset.flipItem) {
        indents.set(el.dataset.flipItem, el.style.paddingLeft);
      }
      if (epoch !== null && isInk(key)) {
        const list = ink.get(key) ?? [];
        list.push({ x: rect.left - epoch, width: rect.width, top: rect.top, height: rect.height });
        ink.set(key, list);
      }
    });

    record.set(column, {
      root,
      epochOffset: epochOffset(root) ?? 0,
      present,
      sectionTops,
      ink,
      indents,
      leaving,
    });
  });

  return record;
}

// -- Last: the sheet after it, against the record ----------------------------

interface MovePlan {
  readonly el: HTMLElement;
  readonly dx: number;
  readonly dy: number;
  readonly fromWidth: number;
  readonly toWidth: number;
  readonly fromHeight: number;
  readonly toHeight: number;
}

interface IndentPlan {
  readonly el: HTMLElement;
  readonly from: string;
  readonly to: string;
}

/**
 * How the paper closes over a departing row or schedule. The rows here are
 * ink on the one ground, with nothing opaque behind them, so a copy left
 * standing while the rows below slide up over it would print both names at
 * once. Instead the copy is cut off along the exact line the paper below has
 * reached — and rides up with the paper above, when a gap above it closed too.
 */
export interface Wipe {
  /** Where the copy starts inside the run of rows that went together. */
  readonly offset: number;
  readonly runHeight: number;
  /** How far the paper below the run closes into it over the settle. */
  readonly closing: number;
  /** How far the paper above the run moves up over the settle. */
  readonly lift: number;
}

interface ExitPlan {
  readonly root: HTMLElement;
  readonly leaving: Leaving;
  /**
   * How far the column's own dates moved under it: a copy stays on the days
   * it stood on, so when the sheet re-anchors — the first item deleted — it
   * moves with the anchor, as everything still on the sheet just did.
   */
  readonly reanchor: number;
  /** Null for ink that leaves without a gap closing over it — a header milestone. */
  readonly wipe: Wipe | null;
}

interface SheetPlan {
  readonly moves: readonly MovePlan[];
  readonly arrivals: readonly HTMLElement[];
  readonly steady: readonly HTMLElement[];
  readonly indents: readonly IndentPlan[];
  readonly exits: readonly ExitPlan[];
}

interface InkNow {
  readonly el: HTMLElement;
  readonly key: string;
  readonly rect: DOMRect;
}

/**
 * The ink's moves: a glide where an item kept its form and changed its days,
 * a flight where it changed form — a bar folding into its strip on the tape,
 * or a strip opening back into its bar.
 *
 * A flight is measured against the schedule the item is in now, as that
 * schedule stood before, exactly as `layoutFlip` measures a row: the
 * schedule's own slide supplies the rest of the trip.
 */
function planInk(
  root: HTMLElement,
  before: ColumnRecord,
  inkNow: readonly InkNow[],
  presentNow: ReadonlySet<string>,
  sectionTopsNow: ReadonlyMap<string, number>,
  moves: MovePlan[],
  flown: Set<HTMLElement>,
  flownIds: Set<string>
): void {
  const epoch = epochX(root);
  if (epoch === null) return;
  const seen = new Map<string, number>();

  inkNow.forEach(({ el, key, rect }) => {
    // Paired by order, so a second copy of an id can never borrow the first's place
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    const x = rect.left - epoch;

    const same = before.ink.get(key)?.[index];
    if (same) {
      const dx = same.x - x;
      // A point has no length to change; only a bar's width is worth animating
      const resizes =
        same.width >= 1 && rect.width >= 1 && Math.abs(same.width - rect.width) >= MIN_DELTA_PX;
      if (Math.abs(dx) < MIN_DELTA_PX && !resizes) return;
      moves.push({
        el,
        dx: Math.abs(dx) < MIN_DELTA_PX ? 0 : dx,
        dy: 0,
        fromWidth: resizes ? same.width : rect.width,
        toWidth: rect.width,
        fromHeight: rect.height,
        toHeight: rect.height,
      });
      return;
    }

    // Changed form: the other form must have been here, and be gone now
    const id = itemIdOf(key);
    const otherKey = key.startsWith('t:') ? `d:${id}` : `t:${id}`;
    if (index > 0 || presentNow.has(otherKey)) return;
    const other = before.ink.get(otherKey)?.[0];
    if (!other || other.width < 1 || rect.width < 1) return;
    const sectionId = sectionIdOf(el);
    const thenTop = sectionId ? before.sectionTops.get(sectionId) : undefined;
    const nowTop = sectionId ? sectionTopsNow.get(sectionId) : undefined;
    if (thenTop === undefined || nowTop === undefined) return;

    moves.push({
      el,
      dx: other.x - x,
      dy: other.top - thenTop - (rect.top - nowTop),
      fromWidth: other.width,
      toWidth: rect.width,
      fromHeight: other.height,
      toHeight: rect.height,
    });
    flown.add(el);
    flownIds.add(id);
  });
}

/**
 * The wipe for each departing row and schedule.
 *
 * A schedule that went is closed over by everything after it, by all of its
 * height. Rows go in runs — a group's children, a schedule's rows when it
 * folds — and each run is closed from below by the first row that stayed
 * under it (or, at the bottom of its schedule, by the schedule's own end),
 * while the first row that stayed above it says how far the run itself rides
 * up. Both are read from where those rows are now against where they were,
 * inside their schedule, so they are exactly what `layoutFlip` will play.
 */
function planWipes(
  root: HTMLElement,
  old: ColumnRecord,
  gone: readonly Leaving[],
  sectionTopsNow: ReadonlyMap<string, number>
): Map<Leaving, Wipe> {
  const wipes = new Map<Leaving, Wipe>();
  const goneKeys = new Set(gone.map((leaving) => leaving.key));
  const sectionsThen = new Map<string, Leaving>();
  const rowsThen = new Map<string, Leaving[]>();

  old.leaving.forEach((leaving) => {
    if (leaving.key.startsWith('s:')) {
      sectionsThen.set(itemIdOf(leaving.key), leaving);
      if (goneKeys.has(leaving.key)) {
        wipes.set(leaving, {
          offset: 0,
          runHeight: leaving.height,
          closing: leaving.height,
          lift: 0,
        });
      }
      return;
    }
    if (!leaving.key.startsWith('r:') || !leaving.sectionId) return;
    const rows = rowsThen.get(leaving.sectionId) ?? [];
    rows.push(leaving);
    rowsThen.set(leaving.sectionId, rows);
  });

  rowsThen.forEach((rows, sectionId) => {
    const sectionThen = sectionsThen.get(sectionId);
    const sectionTopNow = sectionTopsNow.get(sectionId);
    const sectionNow = root.querySelector<HTMLElement>(
      `[data-flip-section="${CSS.escape(sectionId)}"]`
    );
    // A schedule that went is wiped as a whole
    if (!sectionThen || sectionTopNow === undefined || !sectionNow) return;

    /** How far a row that stayed has moved up inside its schedule. */
    const risen = (row: Leaving): number | null => {
      const now = sectionNow.querySelector<HTMLElement>(
        `[data-flip-item="${CSS.escape(itemIdOf(row.key))}"]`
      );
      if (!now) return null;
      return row.top - sectionThen.top - (now.getBoundingClientRect().top - sectionTopNow);
    };

    const ordered = [...rows].sort((a, b) => a.top - b.top);
    let start = 0;
    while (start < ordered.length) {
      if (!goneKeys.has(ordered[start].key)) {
        start += 1;
        continue;
      }
      let end = start;
      while (end + 1 < ordered.length && goneKeys.has(ordered[end + 1].key)) end += 1;

      const above = start > 0 ? risen(ordered[start - 1]) : 0;
      const below =
        end + 1 < ordered.length
          ? risen(ordered[end + 1])
          : sectionThen.height - naturalHeight(sectionNow);
      if (above !== null && below !== null) {
        const runTop = ordered[start].top;
        const runHeight = ordered[end].top + ordered[end].height - runTop;
        for (let index = start; index <= end; index += 1) {
          wipes.set(ordered[index], {
            offset: ordered[index].top - runTop,
            runHeight,
            closing: below - above,
            lift: above,
          });
        }
      }
      start = end + 1;
    }
  });

  return wipes;
}

/**
 * What left, outermost first — a schedule takes its rows with it — and how
 * the paper closes over each. Ink a flight carried has not left; and a column
 * element React replaced has no place left to stand a copy in.
 */
function planExits(
  column: ColumnName,
  root: HTMLElement,
  old: ColumnRecord,
  presentNow: ReadonlySet<string>,
  sectionTopsNow: ReadonlyMap<string, number>,
  flownIds: ReadonlySet<string>
): ExitPlan[] {
  if (old.root !== root) return [];
  const gone = old.leaving.filter(
    (leaving) => !leaving.el.isConnected && !presentNow.has(leaving.key)
  );
  if (gone.length === 0) return [];

  const wipes = planWipes(root, old, gone, sectionTopsNow);
  const shown: Leaving[] = [];
  gone.forEach((leaving) => {
    const isCarried =
      column === 'plot' && !leaving.key.startsWith('s:') && flownIds.has(itemIdOf(leaving.key));
    if (isCarried || shown.some((outer) => outer.el.contains(leaving.el))) return;
    shown.push(leaving);
  });
  const reanchor = (epochOffset(root) ?? 0) - old.epochOffset;
  return shown.map((leaving) => ({ root, leaving, reanchor, wipe: wipes.get(leaving) ?? null }));
}

/** Reads only. Taken under `layoutFlip`'s height pins, which hold vertical places. */
function planSheet(before: SheetRecord): SheetPlan {
  const moves: MovePlan[] = [];
  const arrivals: HTMLElement[] = [];
  const steady: HTMLElement[] = [];
  const indents: IndentPlan[] = [];
  const exits: ExitPlan[] = [];

  columnRoots().forEach((root, column) => {
    // A column that was not on screen before has nothing to move from
    const old = before.get(column);
    if (!old) return;

    const presentNow = new Set<string>();
    const sectionTopsNow = new Map<string, number>();
    const fresh: HTMLElement[] = [];
    const inkNow: InkNow[] = [];

    root.querySelectorAll<HTMLElement>(IDENTITY_SELECTOR).forEach((el) => {
      const key = identityOf(el);
      if (!key) return;
      presentNow.add(key);
      if (!old.present.has(key)) fresh.push(el);
      if (el.dataset.flipSection) {
        sectionTopsNow.set(el.dataset.flipSection, el.getBoundingClientRect().top);
      }
      if (column === 'plot' && isInk(key)) {
        inkNow.push({ el, key, rect: el.getBoundingClientRect() });
      }
      if (column === 'labels' && el.dataset.flipItem) {
        const from = old.indents.get(el.dataset.flipItem);
        const to = el.style.paddingLeft;
        if (from && to && from !== to) indents.push({ el, from, to });
      }
    });

    const flown = new Set<HTMLElement>();
    const flownIds = new Set<string>();
    if (column === 'plot') {
      planInk(root, old, inkNow, presentNow, sectionTopsNow, moves, flown, flownIds);
    }

    // Arrivals, outermost only: a returning schedule fades as one
    const arrived: HTMLElement[] = [];
    fresh.forEach((el) => {
      if (flown.has(el) || arrived.some((arrival) => arrival.contains(el))) return;
      if (el.matches(ROW_SELECTOR) && Array.from(flown).some((ink) => el.contains(ink))) {
        steady.push(el);
        return;
      }
      arrived.push(el);
    });
    arrivals.push(...arrived);

    exits.push(...planExits(column, root, old, presentNow, sectionTopsNow, flownIds));
  });

  return { moves, arrivals, steady, indents, exits };
}

// -- Play ---------------------------------------------------------------------

const running = new Set<Animation>();
/** Departing copies on the sheet; removed the moment their fade is over or cut short. */
const copies = new Set<HTMLElement>();
let settleTimer: number | null = null;
/** Whether the settling class on <body> is ours to take off. */
let ownsSettlingClass = false;
/** Inside a commit already: a nested one is part of it, not a second slide. */
let isCommitting = false;

function track(animation: Animation): void {
  running.add(animation);
  const forget = (): void => {
    running.delete(animation);
    if (running.size === 0) window.removeEventListener('pointerdown', finishSheetMotion, true);
  };
  animation.addEventListener('finish', forget);
  animation.addEventListener('cancel', forget);
}

function releaseSettlingClass(): void {
  if (settleTimer !== null) {
    window.clearTimeout(settleTimer);
    settleTimer = null;
  }
  if (ownsSettlingClass) document.body.classList.remove(SETTLING_CLASS);
  ownsSettlingClass = false;
}

/** Snap anything still in flight to where it was going, and clear departures away. */
export function finishSheetMotion(): void {
  Array.from(running).forEach((animation) => animation.finish());
  running.clear();
  copies.forEach((copy) => copy.remove());
  copies.clear();
  releaseSettlingClass();
  window.removeEventListener('pointerdown', finishSheetMotion, true);
}

/**
 * A departing element's copy: inert, unfindable, and unhittable. It stands
 * where the element stood inside its column, so it scrolls and clips with the
 * sheet and never paints over the axis or the bands above it.
 */
function copyForExit({ leaving, reanchor }: ExitPlan): HTMLElement {
  const copy = leaving.el.cloneNode(true) as HTMLElement;
  const nodes = [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))];
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
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  Object.assign(copy.style, {
    position: 'absolute',
    left: `${leaving.left + reanchor}px`,
    top: `${leaving.top}px`,
    width: `${leaving.width}px`,
    height: `${leaving.height}px`,
    margin: '0',
    pointerEvents: 'none',
  });
  return copy;
}

/**
 * The wipe as keyframes. The paper's edge moves linearly in the settle's own
 * eased progress, so the clip only needs a keyframe where it starts to bite
 * and one where it has taken the whole copy; between them, linear is exact.
 */
export function wipeKeyframes(
  { offset, runHeight, closing, lift }: Wipe,
  height: number
): Keyframe[] {
  const clipAt = (progress: number): string => {
    const edge = runHeight - closing * progress;
    const hidden = Math.min(height, Math.max(0, offset + height - edge));
    return `inset(0px 0px ${hidden}px 0px)`;
  };
  const frames: Keyframe[] = [{ offset: 0, opacity: 1, translate: '0px 0px', clipPath: clipAt(0) }];
  if (closing >= MIN_DELTA_PX) {
    const bites = (runHeight - offset - height) / closing;
    const covers = (runHeight - offset) / closing;
    [bites, covers].forEach((progress) => {
      if (progress > 0 && progress < 1)
        frames.push({ offset: progress, clipPath: clipAt(progress) });
    });
  }
  frames.push({ offset: 1, opacity: 0, translate: `0px ${-lift}px`, clipPath: clipAt(1) });
  return frames;
}

function playExit(exit: ExitPlan, duration: number): void {
  const copy = copyForExit(exit);
  exit.root.appendChild(copy);
  copies.add(copy);
  // On the settle's clock when the paper closes over it, so the cut stays on
  // the paper's edge; quickly on its own when nothing does. Held at nothing
  // once it ends, so the frame between the end and the removal cannot flash
  // it back.
  const animation = exit.wipe
    ? copy.animate(wipeKeyframes(exit.wipe, exit.leaving.height), {
        duration,
        easing: EASE_OUT_CSS,
        fill: 'forwards',
      })
    : copy.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_MS,
        easing: EASE_OUT_CSS,
        fill: 'forwards',
      });
  const remove = (): void => {
    copies.delete(copy);
    copy.remove();
  };
  animation.addEventListener('finish', remove);
  animation.addEventListener('cancel', remove);
  track(animation);
}

/**
 * Links are drawn from data and are already where the bars are going. When
 * the rows moved, `layoutFlip` has hidden them for the settle; when only ink
 * did — a date, a fold — nothing has, and a line would sit at a bar's
 * destination while the bar was still on its way there.
 */
function holdLinks(duration: number): void {
  if (!document.body.classList.contains(SETTLING_CLASS)) {
    document.body.classList.add(SETTLING_CLASS);
    ownsSettlingClass = true;
  }
  if (!ownsSettlingClass) return;
  if (settleTimer !== null) window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    settleTimer = null;
    releaseSettlingClass();
  }, duration);
}

/** Writes only. */
function playSheet(plan: SheetPlan, duration: number): void {
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;

  const timing: KeyframeAnimationOptions = { duration, easing: EASE_OUT_CSS };
  let isInkMoving = false;

  plan.moves.forEach(({ el, dx, dy, fromWidth, toWidth, fromHeight, toHeight }) => {
    const from: Keyframe = {};
    const to: Keyframe = {};
    if (Math.abs(dx) >= MIN_DELTA_PX || Math.abs(dy) >= MIN_DELTA_PX) {
      from.translate = `${dx}px ${dy}px`;
      to.translate = '0px 0px';
    }
    if (Math.abs(fromWidth - toWidth) >= MIN_DELTA_PX) {
      from.width = `${fromWidth}px`;
      to.width = `${toWidth}px`;
    }
    // Over a bar's top and bottom insets: a height given as well wins over
    // the bottom, so the bar grows from its top and lets go at the end
    if (Math.abs(fromHeight - toHeight) >= MIN_DELTA_PX) {
      from.height = `${fromHeight}px`;
      to.height = `${toHeight}px`;
    }
    if (Object.keys(from).length === 0) return;
    track(el.animate([from, to], timing));
    isInkMoving = true;
  });

  // Same length as `layoutFlip`'s own fade on a new row, and created after
  // it, so this is the one that shows — and both end together
  plan.arrivals.forEach((el) => {
    track(el.animate(APPEAR_KEYFRAMES, { duration, easing: 'linear' }));
  });
  plan.steady.forEach((el) => track(el.animate(STEADY_KEYFRAMES, { duration })));

  plan.indents.forEach(({ el, from, to }) => {
    track(el.animate([{ paddingLeft: from }, { paddingLeft: to }], timing));
  });

  plan.exits.forEach((exit) => playExit(exit, duration));

  if (running.size === 0) return;
  if (isInkMoving) holdLinks(duration);

  // A new gesture wins, as it does over a landing: a press mid-glide finds the
  // bar already where it is going rather than grabbing it on the way there.
  window.addEventListener('pointerdown', finishSheetMotion, true);
}

/**
 * Commit a store write with the sheet sliding into its new layout.
 *
 * `write` is run inside `flushSync`, so the DOM is final when it returns —
 * which is what the measurement after it depends on. Returns whatever `write`
 * returns, so a call site that needs a result (`deleteSection`'s verdict) can
 * still read it.
 *
 * Not for a write that animates itself: making an item (`creationUtils`)
 * already slides the rows open and plays its own arrival, and wrapping it
 * would play the rows twice and fade the new item over its own entrance.
 */
export function commitWithSlide<T>(write: () => T): T {
  if (isCommitting) return write();

  // Anything still settling from the last change — a landing, a creation, a
  // slide, a glide — ends where it was going, so this one is measured from rest.
  finishSheetMotion();
  finishCreateMotion();
  finishDragMotion();

  const duration = settleDuration(0);
  // Asked for less motion, the sheet is simply where the write put it: there
  // is nothing of this module's to measure. (`layoutFlip` answers for itself.)
  const before = prefersReducedMotion() ? null : recordSheet();
  const snapshot = captureLayout();
  isCommitting = true;
  try {
    return flushSync(write);
  } finally {
    isCommitting = false;
    // Every read before any write: the plan is taken under layoutFlip's
    // height pins, then both plays write.
    const plan = before ? planSheet(before) : null;
    playLayout(snapshot, { duration });
    if (plan) playSheet(plan, duration);
  }
}
