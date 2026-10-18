import { EASE_OUT_CSS, easeOut, prefersReducedMotion } from './easing';
import { alignLayoutAnimations, finishLayoutAnimations } from './layoutFlip';

/**
 * What follows the pointer while something is being dragged.
 *
 * A clone of the real thing — the right size, the right ink, the right name,
 * none of it described twice — lifted off the sheet onto `<body>` and written
 * to directly, so sixty moves a second re-render nothing.
 *
 * A thing with children is never dragged alone. Everything under it that is on
 * screen comes along as one cluster: each member keeps its place in time, so
 * the cluster is the group's real shape, and the rows draw in a little towards
 * the one being held, so the whole group reads as one object in the hand. On
 * release every member flies to the row it actually landed in and opens back
 * out to its own spacing on the way — the user watches the group arrive
 * rather than seeing it reappear.
 *
 * The landing chases the real element rather than a rect taken at release.
 * The rows around it are still sliding into their new places
 * (`layoutFlip.ts`), and a clone aimed at a frozen point would arrive
 * somewhere the row no longer is.
 */

export type ClusterVariant = 'plot' | 'labels';

export interface ClusterSource {
  readonly id: string;
  readonly element: HTMLElement;
}

/**
 * Where a member comes down.
 *
 * `exact`: the element is the member itself, in its new place — the clone
 * becomes it, and the element is hidden until the clone arrives.
 * `absorb`: the member has no row of its own any more (its new group is
 * folded), so it sinks into the element that now stands for it and fades.
 */
export interface LandingTarget {
  readonly mode: 'exact' | 'absorb';
  readonly resolve: () => HTMLElement | null;
  /** For `absorb`: the screen x the member's own dates sit at, if known. */
  readonly left?: number;
}

/** The part of the screen the sheet is visible through, in viewport px. */
export interface ClipRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface DragClusterOptions {
  /**
   * The sheet's window. A bar that ran off the edge of it at pickup keeps
   * that edge in flight — the part nobody could see does not suddenly paint
   * across the labels column — and a landing slides in under the axis and
   * the edges the way the real bar is cut by them, instead of flying over
   * them and vanishing.
   */
  readonly clip?: () => ClipRect | null;
}

export interface DragCluster {
  /** Put the leader's top-left corner here, on the next frame. */
  readonly moveTo: (x: number, y: number) => void;
  /** The date readout under the cluster. `null` hides it. */
  readonly setLabel: (text: string | null) => void;
  /** Where the leader is drawn right now. */
  readonly leaderPosition: () => { readonly x: number; readonly y: number };
  /**
   * Land every member and remove the clones. Members with no target fade out
   * where they are. `onDone` runs in the frame the real elements are revealed.
   */
  readonly settle: (
    targets: ReadonlyMap<string, LandingTarget>,
    duration: number,
    onDone?: () => void
  ) => void;
  /** Gone, now, with no landing. */
  readonly destroy: () => void;
}

/** How far the rows of a group draw in towards the one being held. */
export const CLUSTER_COMPRESSION = 0.7;
/**
 * A deep group would otherwise hang a whole column of clones off the pointer.
 * Past this much offset the rest stack up tightly behind, like the edge of a
 * deck — still there, still in order, no longer in the way.
 */
export const CLUSTER_SOFT_LIMIT_PX = 180;
const CLUSTER_TAIL_COMPRESSION = 0.18;

/** The rows drawing in once the drag begins. `--duration-base`. */
const PICKUP_MS = 160;
/** The date readout sits this far under the cluster. */
const LABEL_GAP_PX = 6;
/** The readout never comes closer than this to the window's edge. */
const EDGE_MARGIN_PX = 8;
/** Gestures that are already being answered — so a new one can finish them. */
const activeSettles = new Set<() => void>();

const LANDING_ATTR = 'data-drag-landing';
/** Attributes that make an element findable — no clone may answer to them. */
const STRIP_PREFIXES = ['data-drop', 'data-flip', 'data-drag', 'data-dep', 'data-tape', 'data-section'];

export interface MemberGeometry {
  /** Offset of the member's top edge from the leader's, at rest. */
  readonly top: number;
  readonly height: number;
}

export interface CompressedGeometry {
  readonly top: number;
  readonly height: number;
  readonly opacity: number;
}

function soften(offset: number): { offset: number; overflow: number } {
  const magnitude = Math.abs(offset);
  if (magnitude <= CLUSTER_SOFT_LIMIT_PX) return { offset, overflow: 0 };
  const overflow = magnitude - CLUSTER_SOFT_LIMIT_PX;
  return {
    offset: Math.sign(offset) * (CLUSTER_SOFT_LIMIT_PX + overflow * CLUSTER_TAIL_COMPRESSION),
    overflow,
  };
}

function tailOpacity(overflow: number): number {
  return overflow <= 0 ? 1 : Math.max(0.5, 1 - overflow / 400);
}

/**
 * The cluster's held shape: the leader first, then every member in order.
 *
 * On the sheet, members are bars of their own height at their own dates, so
 * only the distance between them shrinks — measured centre to centre, which
 * keeps a thin nested bar under a thick root one from tucking behind it. In
 * the labels column a member *is* its row, so the rows themselves get
 * shallower and stack edge to edge: a card of names rather than a ladder.
 */
export function compressCluster(
  members: readonly MemberGeometry[],
  variant: ClusterVariant
): CompressedGeometry[] {
  if (members.length === 0) return [];
  const leader = members[0];
  const result: CompressedGeometry[] = [{ top: 0, height: leader.height, opacity: 1 }];

  if (variant === 'plot') {
    const leaderCentre = leader.top + leader.height / 2;
    for (let i = 1; i < members.length; i += 1) {
      const member = members[i];
      const distance = (member.top + member.height / 2 - leaderCentre) * CLUSTER_COMPRESSION;
      const { offset, overflow } = soften(distance);
      result.push({
        top: leader.height / 2 + offset - member.height / 2,
        height: member.height,
        opacity: tailOpacity(overflow),
      });
    }
    return result;
  }

  let cursor = leader.height;
  for (let i = 1; i < members.length; i += 1) {
    const member = members[i];
    const natural = member.height * CLUSTER_COMPRESSION;
    const { offset: softened, overflow } = soften(cursor + natural);
    const top = soften(cursor).offset;
    const height = Math.max(2, softened - top);
    result.push({ top, height, opacity: tailOpacity(overflow) });
    cursor += natural;
  }
  return result;
}

/** How long a landing takes: long enough to follow, never long enough to wait on. */
export function settleDuration(distance: number): number {
  return Math.round(Math.min(340, 220 + distance * 0.12));
}

/**
 * Other motions that a new gesture must also end — a link folding into its
 * route, a drawn bar flying out of its ghost. They register here rather than
 * being imported, so this module stays below the stores in the import graph.
 */
const otherFinishers = new Set<() => void>();

export function registerMotionFinisher(finish: () => void): void {
  otherFinishers.add(finish);
}

/** End every landing and layout slide still in flight. A new gesture wins. */
export function finishDragMotion(): void {
  Array.from(activeSettles).forEach((finish) => finish());
  activeSettles.clear();
  finishLayoutAnimations();
  otherFinishers.forEach((finish) => finish());
}

interface Member {
  readonly id: string;
  readonly clone: HTMLElement;
  /** What the sheet's edges hid of it at pickup, kept for the whole hold. */
  readonly heldInset: { readonly left: number; readonly right: number };
  readonly restX: number;
  readonly restY: number;
  readonly restWidth: number;
  readonly restHeight: number;
  readonly held: CompressedGeometry;
  /** Where it was last painted, in screen coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

function stripClone(root: HTMLElement): void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const node of nodes) {
    for (const { name } of Array.from(node.attributes)) {
      if (
        name === 'id' ||
        name === 'tabindex' ||
        name === 'role' ||
        name.startsWith('aria-') ||
        STRIP_PREFIXES.some((prefix) => name.startsWith(prefix))
      ) {
        node.removeAttribute(name);
      }
    }
  }
  root.setAttribute('aria-hidden', 'true');
}

function makeClone(source: HTMLElement, rect: DOMRect, variant: ClusterVariant): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;

  // Affordances belong to the row that stayed behind, not to what is in flight
  clone
    .querySelectorAll('.drag-handle, .dep-dot, [data-strip-on-drag], input')
    .forEach((node) => node.remove());
  // A label that hides until hover would leave a marker in flight unnamed
  clone.querySelectorAll<HTMLElement>('[data-reveal-on-drag]').forEach((node) => {
    node.style.opacity = '1';
  });
  stripClone(clone);

  // Whatever state the source was in when it was cloned, the clone is at rest
  clone.classList.remove(
    'timeline-bar--lifted',
    'timeline-bar--receiving',
    'timeline-point--lifted',
    'schedule-block--lifted',
    'is-drop-receiver',
    'is-dragged-row',
    'opacity-30',
    'opacity-50',
    'cursor-grab',
    'active:cursor-grabbing'
  );
  clone.classList.add('drag-preview', `drag-preview--${variant}`);
  if (rect.width < 1) clone.classList.add('drag-preview--point');

  // `inset` first: it is shorthand for all four offsets, so setting it after
  // left/top would blank them and drop the clone wherever the static flow puts it.
  clone.style.inset = 'auto';
  clone.style.position = 'fixed';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '9999';
  clone.style.willChange = 'transform';
  clone.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  return clone;
}

/**
 * Hand over: the real element appears in the frame the clone goes. Whatever
 * opacity transition the element normally carries must not run here — the
 * clone is already gone, so a fade would be a flash of half-ink.
 */
function revealAll(elements: readonly (HTMLElement | null)[]): void {
  const landing = elements.filter(
    (element): element is HTMLElement => element !== null && element.hasAttribute(LANDING_ATTR)
  );
  if (landing.length === 0) return;
  // Writes, one style flush, writes — not a flush per element
  const previous = landing.map((element) => element.style.transition);
  landing.forEach((element) => {
    element.style.transition = 'none';
    element.removeAttribute(LANDING_ATTR);
  });
  void document.body.offsetWidth;
  landing.forEach((element, index) => {
    element.style.transition = previous[index];
  });
}

function textColorOf(element: HTMLElement): string | null {
  const text = element.querySelector<HTMLElement>('.timeline-bar__label > span, .truncate');
  return text ? getComputedStyle(text).color : null;
}

/** What a landing target looks like — read once, before any clone is written to. */
interface TargetLook {
  readonly fill: string | null;
  readonly text: string | null;
  readonly paddingLeft: string;
  readonly labelOffset: number;
  readonly isSelected: boolean;
}

function lookOf(target: HTMLElement, variant: ClusterVariant): TargetLook {
  const targetFill = target.querySelector<HTMLElement>('.timeline-bar__fill');
  return {
    fill: targetFill ? getComputedStyle(targetFill).backgroundColor : null,
    text: textColorOf(target),
    paddingLeft: variant === 'labels' ? getComputedStyle(target).paddingLeft : '',
    labelOffset: variant === 'plot' ? labelOffset(target) : 0,
    isSelected: target.classList.contains(
      variant === 'labels' ? 'selected' : 'timeline-bar--selected'
    ),
  };
}

/**
 * Take on the look of the row it is landing as. A group's colour is resolved
 * from where an item sits, so joining one can change a bar's ink, and a label
 * row's indent and weight of grey come from its depth. Easing into those on the
 * way down is what lets the clone hand over to the real row without a seam.
 */
function applyLook(clone: HTMLElement, look: TargetLook, variant: ClusterVariant, ms: number): void {
  const fill = clone.querySelector<HTMLElement>('.timeline-bar__fill');
  if (fill && look.fill) {
    fill.style.transition = `background-color ${ms}ms linear`;
    fill.style.backgroundColor = look.fill;
  }

  const text = clone.querySelector<HTMLElement>('.timeline-bar__label > span, .truncate');
  if (text && look.text) {
    text.style.transition = `color ${ms}ms linear`;
    text.style.color = look.text;
  }

  if (variant === 'labels') {
    clone.style.paddingLeft = look.paddingLeft;
    clone.classList.toggle('selected', look.isSelected);
  } else {
    // A tape strip prints no selection, and a bar landing unselected must not
    // hand over an outline it is about to lose
    clone.classList.toggle('timeline-bar--selected', look.isSelected);
    const label = clone.querySelector<HTMLElement>('.timeline-bar__label');
    if (label) {
      label.style.transition = `padding-left ${ms}ms ${EASE_OUT_CSS}`;
      label.style.paddingLeft = `${look.labelOffset + LABEL_PADDING_PX}px`;
    }
  }

  clone.querySelectorAll<HTMLElement>('[data-reveal-on-drag]').forEach((node) => {
    node.style.opacity = '';
  });
}

/** `.timeline-bar__label`'s own side padding. */
const LABEL_PADDING_PX = 8;

/**
 * How far into a bar its name has travelled. Zero at rest; with travelling
 * labels on, the distance the name has walked along a bar whose start has
 * scrolled off the sheet.
 */
function labelOffset(bar: HTMLElement): number {
  const label = bar.querySelector<HTMLElement>('.timeline-bar__label');
  if (!label) return 0;
  return Math.max(0, label.getBoundingClientRect().left - bar.getBoundingClientRect().left);
}

/** Body class that quiets ink drawn from data while a landing is in the air. */
const SETTLING_BODY_CLASS = 'drag-settling';
let settlingCount = 0;

function beginSettlingQuiet(): void {
  settlingCount += 1;
  document.body.classList.add(SETTLING_BODY_CLASS);
}

function endSettlingQuiet(): void {
  settlingCount = Math.max(0, settlingCount - 1);
  if (settlingCount === 0) document.body.classList.remove(SETTLING_BODY_CLASS);
}

/**
 * How much of a tape strip the strips laid after it cover, from its right.
 * Later strips print over earlier ones, so a clone landing as a strip has to
 * end the flight showing only the part the tape will show.
 */
function tapeCoverage(target: HTMLElement): number {
  if (!target.hasAttribute('data-tape-item')) return 0;
  const own = target.getBoundingClientRect();
  let coverLeft = own.right;
  for (let next = target.nextElementSibling; next; next = next.nextElementSibling) {
    if (!(next instanceof HTMLElement) || !next.hasAttribute('data-tape-item')) continue;
    const rect = next.getBoundingClientRect();
    if (rect.left > own.left && rect.left < coverLeft && rect.right > own.left) coverLeft = rect.left;
  }
  return Math.max(0, own.right - coverLeft);
}

/**
 * The time the slides animate this frame at: the document timeline's, frozen
 * for the frame. `performance.now()` inside a frame callback runs ahead of it
 * by however late in the frame the callback runs — a few milliseconds, which
 * at the steep start of the curve is a visible disagreement on a long trip.
 * (The first frame after a long task is the exception; see `fly`.)
 */
function frameTime(): number {
  const time = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
  return typeof time === 'number' ? time : performance.now();
}

/** Room left around a clipped clone so its shadow is not cut along with it. */
const SHADOW_ROOM_PX = 40;

function insetFor(edges: { top: number; right: number; bottom: number; left: number }): string {
  const side = (value: number): string => (value > 0 ? `${value}px` : `-${SHADOW_ROOM_PX}px`);
  return `inset(${side(edges.top)} ${side(edges.right)} ${side(edges.bottom)} ${side(edges.left)})`;
}

export function createDragCluster(
  leader: ClusterSource,
  followers: readonly ClusterSource[],
  variant: ClusterVariant,
  options: DragClusterOptions = {}
): DragCluster {
  const reduced = prefersReducedMotion();
  const sources = [leader, ...followers];
  const rects = sources.map((source) => source.element.getBoundingClientRect());
  const pickupClip = options.clip?.() ?? null;
  const leaderRect = rects[0];
  const held = compressCluster(
    rects.map((rect) => ({ top: rect.top - leaderRect.top, height: rect.height })),
    variant
  );

  const members: Member[] = sources.map((source, index) => {
    const rect = rects[index];
    const clone = makeClone(source.element, rect, variant);
    if (index > 0) clone.classList.add('drag-preview--member');
    // Only across: a group's rows below the fold are exactly what the
    // draw-in is meant to bring into view.
    const heldInset = pickupClip
      ? {
          left: Math.min(rect.width, Math.max(0, pickupClip.left - rect.left)),
          right: Math.min(rect.width, Math.max(0, rect.right - pickupClip.right)),
        }
      : { left: 0, right: 0 };
    if (heldInset.left > 0 || heldInset.right > 0) {
      clone.style.clipPath = insetFor({ top: 0, bottom: 0, ...heldInset });
    }
    // The name stays where it was read. On the sheet a travelling label may
    // have walked into the bar, and an edge may hide its start; on <body>
    // neither holds, and the name would print at the bar's start — out of
    // sight under the clip.
    const nameShift = Math.max(labelOffset(source.element), heldInset.left);
    const cloneLabel = clone.querySelector<HTMLElement>('.timeline-bar__label');
    if (cloneLabel && nameShift > 0) {
      cloneLabel.style.paddingLeft = `${nameShift + LABEL_PADDING_PX}px`;
    }
    document.body.appendChild(clone);
    return {
      id: source.id,
      clone,
      heldInset,
      restX: rect.left - leaderRect.left,
      restY: rect.top - leaderRect.top,
      restWidth: rect.width,
      restHeight: rect.height,
      held: held[index],
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });

  const bubble = document.createElement('span');
  bubble.className = 'drag-preview__date';
  bubble.setAttribute('aria-hidden', 'true');
  bubble.hidden = true;
  document.body.appendChild(bubble);
  /** Measured when its text changes, not every frame. */
  let bubbleSize = { width: 0, height: 0 };

  // Lifted on the next frame, so the shadow and the draw-in are seen to happen
  requestAnimationFrame(() => {
    if (settling || destroyed) return;
    members.forEach((member) => member.clone.classList.add('is-lifted'));
  });

  let leaderX = leaderRect.left;
  let leaderY = leaderRect.top;
  const pickedUpAt = performance.now();
  let frame = 0;
  let settling = false;
  let destroyed = false;
  /** Ends the landing in progress, if there is one — reveal and all. */
  let finishSettle: (() => void) | null = null;

  const pickupProgress = (now: number): number =>
    reduced ? 1 : easeOut(Math.min(1, (now - pickedUpAt) / PICKUP_MS));

  const paintHeld = (now: number): boolean => {
    const progress = pickupProgress(now);
    // The sheet's far edge cuts a held bar as it cuts a placed one — a long
    // bar carried right does not spill onto the sidebar, and has nothing to
    // lose in one frame when it lands. Its near edge does not: a bar carried
    // over the labels column is still in the hand, and must stay seen.
    const sheetRight = options.clip ? (options.clip()?.right ?? null) : null;
    let bottom = 0;
    for (const member of members) {
      const top = member.restY + (member.held.top - member.restY) * progress;
      const height = member.restHeight + (member.held.height - member.restHeight) * progress;
      member.x = leaderX + member.restX;
      member.y = leaderY + top;
      member.width = member.restWidth;
      member.height = height;
      member.clone.style.transform = `translate3d(${member.x}px, ${member.y}px, 0)`;
      if (height !== member.restHeight) member.clone.style.height = `${height}px`;
      if (sheetRight !== null) {
        const right = Math.min(
          member.restWidth,
          Math.max(member.heldInset.right, member.x + member.restWidth - sheetRight)
        );
        if (right > 0 || member.heldInset.left > 0) {
          member.clone.style.clipPath = insetFor({
            top: 0,
            bottom: 0,
            left: member.heldInset.left,
            right,
          });
        } else if (member.clone.style.clipPath) {
          member.clone.style.clipPath = '';
        }
      }
      if (member.held.opacity < 1) {
        member.clone.style.opacity = String(1 - (1 - member.held.opacity) * progress);
      }
      bottom = Math.max(bottom, top + height);
    }
    if (!bubble.hidden) {
      // Under the cluster where it fits, above the leader where it does not;
      // from where the leader can actually be seen, and always on screen.
      let y = leaderY + bottom + LABEL_GAP_PX;
      if (y + bubbleSize.height > window.innerHeight - EDGE_MARGIN_PX) {
        y = leaderY - bubbleSize.height - LABEL_GAP_PX;
      }
      const x = Math.min(
        Math.max(EDGE_MARGIN_PX, leaderX + members[0].heldInset.left),
        window.innerWidth - bubbleSize.width - EDGE_MARGIN_PX
      );
      bubble.style.transform = `translate3d(${x}px, ${Math.max(EDGE_MARGIN_PX, y)}px, 0)`;
    }
    return progress < 1;
  };

  const tick = (now: number): void => {
    frame = 0;
    if (destroyed || settling) return;
    if (paintHeld(now)) frame = requestAnimationFrame(tick);
  };

  const schedule = (): void => {
    if (frame === 0 && !settling && !destroyed) frame = requestAnimationFrame(tick);
  };

  // The first frame of the hold is the rest position, painted by `makeClone`;
  // the draw-in starts from there.
  schedule();

  const removeAll = (): void => {
    destroyed = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    members.forEach((member) => member.clone.remove());
    bubble.remove();
  };

  const settle: DragCluster['settle'] = (targets, duration, onDone) => {
    if (destroyed || settling) return;
    settling = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;

    interface Flight {
      readonly member: Member;
      readonly target: LandingTarget | undefined;
      element: HTMLElement | null;
      readonly fromX: number;
      readonly fromY: number;
      readonly fromWidth: number;
      readonly fromHeight: number;
      /** The target's rect when the flight began, for the decaying offset. */
      startRect: { left: number; top: number; width: number; height: number } | null;
      /** Landing in a band under the axis: above the sheet's window, so not cut by it. */
      inBand: boolean;
      /** Px of a tape strip the later strips will cover at hand-over. */
      covered: number;
      /** How far past the sheet's top and bottom edges it already was at release. */
      overTop: number;
      overBottom: number;
    }

    const landingRect = (
      flight: Flight
    ): { left: number; top: number; width: number; height: number } | null => {
      const { target, member } = flight;
      if (!target) return null;
      if (!flight.element || !flight.element.isConnected) {
        flight.element = target.resolve();
        if (flight.element && target.mode === 'exact') flight.element.setAttribute(LANDING_ATTR, '');
      }
      if (!flight.element) return null;
      const rect = flight.element.getBoundingClientRect();
      if (target.mode === 'exact') {
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
      // Sinking into a folded group: its own dates across, the group's row down
      const height = Math.min(member.restHeight, rect.height);
      return {
        left: target.left ?? flight.fromX,
        top: rect.top + (rect.height - height) / 2,
        width: member.restWidth,
        height,
      };
    };

    const flights: Flight[] = members.map((member) => ({
      member,
      target: targets.get(member.id),
      element: null,
      fromX: member.x,
      fromY: member.y,
      fromWidth: member.width,
      fromHeight: member.height,
      startRect: null,
      inBand: false,
      covered: 0,
      overTop: 0,
      overBottom: 0,
    }));
    const releaseClip = options.clip?.() ?? null;
    flights.forEach((flight) => {
      flight.startRect = landingRect(flight);
      flight.inBand = flight.element?.closest('[data-drop-sticky]') != null;
      if (releaseClip && !flight.inBand) {
        const { member } = flight;
        flight.overTop = Math.max(0, releaseClip.top - member.y);
        flight.overBottom = Math.max(0, member.y + member.height - releaseClip.bottom);
      }
      if (flight.target?.mode === 'exact' && flight.element) {
        flight.covered = tapeCoverage(flight.element);
      }
    });

    let finished = false;
    let quiet = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      finishSettle = null;
      activeSettles.delete(finish);
      if (quiet) endSettlingQuiet();
      revealAll(flights.map(({ element }) => element));
      removeAll();
      onDone?.();
    };

    if (reduced || duration <= 0) {
      finish();
      return;
    }
    finishSettle = finish;
    activeSettles.add(finish);
    // Links are drawn from the store, which already holds the drop: until the
    // clone arrives they would point at where it is going, not where it is
    quiet = true;
    beginSettlingQuiet();

    const ms = Math.round(duration);
    bubble.style.transition = `opacity ${Math.min(ms, 120)}ms linear`;
    bubble.style.opacity = '0';

    // Every target's look is read before any clone is written to
    const looks = flights.map(({ target, element }) =>
      target?.mode === 'exact' && element ? lookOf(element, variant) : null
    );
    flights.forEach((flight, index) => {
      const { member } = flight;
      const look = looks[index];
      const clone = member.clone;
      clone.style.transition = [
        `box-shadow ${ms}ms ${EASE_OUT_CSS}`,
        `opacity ${ms}ms ${EASE_OUT_CSS}`,
        `background-color ${ms}ms linear`,
        `padding-left ${ms}ms ${EASE_OUT_CSS}`,
      ].join(', ');
      clone.classList.remove('is-lifted');
      if (look) {
        clone.style.opacity = '1';
        applyLook(clone, look, variant, ms);
      } else {
        clone.style.opacity = '0';
      }
    });

    // Started on the flight's own first frame, not at the release — that can
    // be the end of a long commit — and the rows' slides are started on the
    // same moment, so the clone and the row it is chasing share one clock.
    let startedAt: number | null = null;
    const fly = (): void => {
      if (finished) return;
      // The first frame after a long commit is handed a stale frame time —
      // from before the commit began — so the start is the real present, and
      // everything after is read off the shared timeline. Measured that way,
      // the clone and the slides cannot skip their opening together.
      if (startedAt === null) {
        startedAt = performance.now();
        alignLayoutAnimations(startedAt);
      }
      const t = Math.min(1, Math.max(0, (frameTime() - startedAt) / duration));
      const remaining = 1 - easeOut(t);
      // Reads first, for every member; writes after. Interleaved, each
      // member's read would flush the style the one before it wrote.
      const clip = options.clip?.() ?? null;
      const rects = flights.map(landingRect);
      flights.forEach((flight, index) => {
        const rect = rects[index];
        const start = flight.startRect ?? rect;
        const { member } = flight;
        if (!rect || !start) return;
        member.x = rect.left + (flight.fromX - start.left) * remaining;
        member.y = rect.top + (flight.fromY - start.top) * remaining;
        member.width = rect.width + (flight.fromWidth - start.width) * remaining;
        member.height = rect.height + (flight.fromHeight - start.height) * remaining;
        member.clone.style.transform = `translate3d(${member.x}px, ${member.y}px, 0)`;
        member.clone.style.width = `${member.width}px`;
        member.clone.style.height = `${member.height}px`;
        // What the edges hid at pickup comes back over the flight rather than
        // in its first frame, and the sheet's window takes over as it lands.
        const progress = 1 - remaining;
        const held = member.heldInset;
        const window_ = clip && !flight.inBand ? clip : null;
        // What was already past the top or bottom edge at release is cut in
        // as it lands, like the sides — not in the first frame of the flight
        const edges = {
          top: window_ ? Math.max(0, window_.top - member.y - flight.overTop * remaining) : 0,
          bottom: window_
            ? Math.max(0, member.y + member.height - window_.bottom - flight.overBottom * remaining)
            : 0,
          left: Math.max(clip ? clip.left - member.x : 0, held.left * remaining, 0),
          right: Math.max(
            clip ? member.x + member.width - clip.right : 0,
            held.right * remaining,
            flight.covered * progress,
            0
          ),
        };
        if (clip || held.left > 0 || held.right > 0 || flight.covered > 0) {
          member.clone.style.clipPath = insetFor(edges);
        }
      });
      if (t >= 1) {
        finish();
        return;
      }
      frame = requestAnimationFrame(fly);
    };
    frame = requestAnimationFrame(fly);
  };

  return {
    moveTo: (x, y) => {
      leaderX = x;
      leaderY = y;
      schedule();
    },
    setLabel: (text) => {
      const hidden = text === null;
      if (bubble.hidden !== hidden) bubble.hidden = hidden;
      if (text !== null && bubble.textContent !== text) {
        bubble.textContent = text;
        bubbleSize = { width: bubble.offsetWidth, height: bubble.offsetHeight };
      }
      schedule();
    },
    leaderPosition: () => ({ x: members[0].x, y: members[0].y }),
    settle,
    // Mid-landing, "gone now" still has to hand over: the real rows are
    // hidden until the clone arrives, and must not stay that way.
    destroy: () => {
      if (finishSettle) finishSettle();
      else if (!destroyed) removeAll();
    },
  };
}
