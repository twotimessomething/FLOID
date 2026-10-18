import { flushSync } from 'react-dom';
import type { DependencyAnchor } from '../types/timeline';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { canLinkItems, isDuplicateEdge } from '../utils/dependencyUtils';
import { collectIds, findItemPath } from '../utils/itemTree';
import { DEP_DOT_OFFSET, parseRoute } from '../utils/dependencyGeometry';
import { finishDragMotion, registerMotionFinisher } from '../utils/dragCluster';
import { easeOut, prefersReducedMotion } from '../utils/easing';
import { HEADER_HEIGHT } from '../utils/timelineUtils';
import {
  createDependencyDrawPreview,
  finishDependencyDrawMotion,
  type DependencyDrawPreview,
  type DrawPoint,
  type SheetRoute,
} from '../utils/dependencyDrawPreview';
import {
  getHeldDependency,
  holdDependencyHover,
  releaseHeldDependency,
  reportDependencyHover,
  reportDependencyLeave,
  setHeldDependency,
} from '../utils/dependencyHover';

/**
 * Drawing a dependency.
 *
 * One end of the line is pinned — the dot the gesture started from, or the end
 * of an existing edge being picked up — and the other follows the cursor until
 * it lands on a bar or a milestone. Which ends get connected *is* the type, so
 * there is nothing to configure afterwards. Nothing is written to the store
 * until the pointer comes up; releasing over open paper draws nothing at all —
 * unless the line already existed, in which case open paper is where links go
 * to be un-drawn, the same way dragging an item out of a group un-groups it.
 *
 * The line is in the hand for the whole gesture and never cuts:
 *
 * - The pinned end is measured off the sheet every frame, so a scroll, a zoom
 *   or the sheet edge-scrolling under the pointer carries it along instead of
 *   leaving it frozen where the press began.
 * - Picking up an existing link's end lifts the line off its route and pulls it
 *   straight towards the hand; the route itself drains away underneath while
 *   the edge stays mounted — its terminal is holding the pointer.
 * - Reaching an anchor eases the free end onto it rather than jumping there.
 * - A connection folds the line into its elbow route and crossfades to the
 *   ink the sheet prints. A miss draws the free end back into its dot. A link
 *   whose end was dropped somewhere that refused it, or called off with
 *   Escape, flies home to the end it was picked up from.
 */

/** Movement, in px, before a press on a dot becomes a draw rather than a click. */
const DRAW_THRESHOLD_PX = 4;
/** The outer stretch of a bar that aims at its far anchor instead of its start. */
const FAR_ANCHOR_FRACTION = 0.25;
/** The free end easing onto an anchor, or off one. `--duration-fast`. */
const SNAP_MS = 120;
/** How close to the scroller's edge before the sheet follows the line. */
const EDGE_SCROLL_ZONE_PX = 72;
const EDGE_SCROLL_MAX_PX = 24;
/** Rows are shorter than the sheet is wide, so the vertical zone is too. */
const EDGE_SCROLL_ZONE_Y_PX = 56;
const EDGE_SCROLL_MAX_Y_PX = 18;

/** The end that stays put for the whole gesture. */
export interface DrawFixedEnd {
  readonly end: 'from' | 'to';
  readonly itemId: string;
  readonly anchor: DependencyAnchor;
}

export interface StartDependencyDrawArgs {
  /** Client coordinates the line is pinned to, at the moment of the press. */
  readonly origin: { readonly x: number; readonly y: number };
  /**
   * What the pinned end rides on when the sheet moves under it. Defaults to
   * the element pressed — right for a bar's dot, which is the pinned end. A
   * line's terminal is the *moving* end, so the layer passes its own SVG.
   */
  readonly originFrame?: Element | null;
  readonly fixed: DrawFixedEnd;
  /** Present when re-routing an existing edge; open paper then removes it. */
  readonly edgeId?: string;
}

interface Candidate {
  readonly itemId: string;
  readonly anchor: DependencyAnchor;
  readonly x: number;
  readonly y: number;
}

interface DrawSession {
  readonly args: StartDependencyDrawArgs;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly startClientX: number;
  readonly startClientY: number;
  pointerX: number;
  pointerY: number;
  active: boolean;
  preview: DependencyDrawPreview | null;
  candidate: Candidate | null;
  /** The fixed item, its ancestors and its descendants — none may take the line. */
  blockedIds: ReadonlySet<string>;
  /** Whether each item and anchor would take the line. The store holds still mid-gesture. */
  readonly validity: Map<string, boolean>;
  /** The pinned end on screen, now. */
  readonly originAt: () => DrawPoint;
  /** Where the free end was last drawn. */
  free: DrawPoint;
  /** The free end travelling onto, or off, an anchor. */
  snap: { readonly from: DrawPoint; readonly start: number } | null;
  /** A press that starts inside an edge zone must leave it before it scrolls. */
  edgeXArmed: boolean;
  edgeYArmed: boolean;
  frame: number;
}

/** One line at a time, app-wide: a second finger on another dot is not a second draw. */
let activeSession: DrawSession | null = null;

/**
 * A bar picked up, or an edge pulled, while a link is still folding into its
 * route ends that landing too — every gesture starts from `finishDragMotion`.
 * A line still in the hand is not motion left over from a finished gesture,
 * though: it owns the link it is holding, so it is left alone.
 */
registerMotionFinisher(() => {
  if (activeSession === null) finishDependencyDrawMotion();
});

interface DependencyDrawApi {
  readonly startDraw: (event: React.PointerEvent, args: StartDependencyDrawArgs) => void;
}

/** Stable for the life of the app — the gesture is module state, not a row's. */
const DRAW_API: DependencyDrawApi = { startDraw: startDependencyDraw };

export function useDependencyDraw(): DependencyDrawApi {
  return DRAW_API;
}

/**
 * The gesture belongs to the app, not to the row that started it: its
 * listeners are on the document and it ends on pointerup, so a row that
 * re-renders — or unmounts — mid-draw cannot strand a line on screen.
 */
function startDependencyDraw(event: React.PointerEvent, args: StartDependencyDrawArgs): void {
  if (event.button !== 0 || activeSession) return;

  event.preventDefault();
  event.stopPropagation();

  // Whatever is still settling belongs to the last gesture — a bar's landing,
  // a layout slide, a link folding into its route (registered above). This
  // one starts from the sheet as it will be, not as it was halfway through.
  finishDragMotion();
  holdDependencyHover();

  // The dot is a few pixels the pointer leaves on the first frame; capture
  // keeps the rest of the gesture addressed to it.
  const pressed = event.currentTarget as Element;
  pressed.setPointerCapture?.(event.pointerId);

  const session: DrawSession = {
    args,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
    active: false,
    preview: null,
    candidate: null,
    blockedIds: new Set(),
    validity: new Map(),
    originAt: trackPoint(args.originFrame ?? pressed, args.origin),
    free: { x: event.clientX, y: event.clientY },
    snap: null,
    edgeXArmed: false,
    edgeYArmed: false,
    frame: 0,
  };

  const tick = (now: number): void => {
    session.frame = 0;
    if (activeSession !== session) return;
    edgeScroll(session);
    render(session, now);
    session.frame = requestAnimationFrame(tick);
  };

  const activate = (): void => {
    session.active = true;
    session.blockedIds = blockedIdsFor(args.fixed.itemId);
    session.preview = createDependencyDrawPreview();
    document.body.classList.add('no-select');
    document.body.classList.add('dependency-drawing');
    // Shortcuts stand down while something is in the hand
    useUIStore.getState().setDragging(true, 'draw');

    if (args.edgeId) {
      // Read the route before it drains: the line starts as exactly that shape
      const route = readRoute(args.edgeId, args.fixed.end);
      setHeldDependency({ edgeId: args.edgeId, end: movingEndOf(args.fixed), ink: 'drained' });
      if (route) session.preview.liftFrom(route);
    }

    render(session, performance.now());
    session.frame = requestAnimationFrame(tick);
  };

  const onMove = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== session.pointerId) return;
    // The button is up and no pointerup said so: the element holding the
    // capture left the page and the release happened somewhere we could not
    // hear it. Nothing was chosen, so nothing lands — but the line still goes
    // home, and the next press is not refused by a gesture that never ended.
    if ((moveEvent.buttons & 1) === 0) {
      finish('cancel');
      return;
    }
    session.pointerX = moveEvent.clientX;
    session.pointerY = moveEvent.clientY;
    if (session.active) return;
    const dx = Math.abs(moveEvent.clientX - session.startClientX);
    const dy = Math.abs(moveEvent.clientY - session.startClientY);
    if (dx < DRAW_THRESHOLD_PX && dy < DRAW_THRESHOLD_PX) return;
    activate();
  };

  const onUp = (upEvent: PointerEvent): void => {
    if (upEvent.pointerId !== session.pointerId) return;
    session.pointerX = upEvent.clientX;
    session.pointerY = upEvent.clientY;
    finish('release');
  };

  /** A gesture the system took away. Nothing lands, nothing is lost. */
  const onCancel = (cancelEvent: PointerEvent): void => {
    if (cancelEvent.pointerId === session.pointerId) finish('cancel');
  };
  const onBlur = (): void => finish('cancel');

  /**
   * Escape calls the line off. Heard first — on the window, capturing — and
   * kept from the shortcuts behind it, which would otherwise read the same key
   * as "deselect" and drop the selected link out from under the hand.
   */
  const onKeyDown = (keyEvent: KeyboardEvent): void => {
    if (keyEvent.key !== 'Escape' || !session.active) return;
    keyEvent.preventDefault();
    keyEvent.stopImmediatePropagation();
    finish('cancel');
  };

  /** macOS raises the context menu at mousedown; mid-draw it would open on the bar. */
  const onContextMenu = (menuEvent: MouseEvent): void => {
    if (!session.active) return;
    menuEvent.preventDefault();
    menuEvent.stopImmediatePropagation();
  };

  const finish = (outcome: 'release' | 'cancel'): void => {
    if (activeSession !== session) return;
    activeSession = null;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('contextmenu', onContextMenu, true);
    if (session.frame !== 0) cancelAnimationFrame(session.frame);
    session.frame = 0;

    if (!session.active) {
      // A click, not a draw: hand the hover back to whatever is under the pointer
      syncHover(session);
      return;
    }

    document.body.classList.remove('no-select');
    document.body.classList.remove('dependency-drawing');
    useUIStore.getState().setDragging(false);
    conclude(session, outcome);
  };

  activeSession = session;
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('contextmenu', onContextMenu, true);
}

// -- frames ------------------------------------------------------------------------

/**
 * A point that rides on an element: wherever the element goes — scrolled,
 * zoomed, carried by a settling row — the point keeps its offset from it. An
 * element that has left the page holds the point where it was last seen.
 */
function trackPoint(element: Element, at: DrawPoint): () => DrawPoint {
  const rect = element.getBoundingClientRect();
  const dx = at.x - rect.left;
  const dy = at.y - rect.top;
  let last: DrawPoint = { x: at.x, y: at.y };
  return () => {
    if (!element.isConnected) return last;
    const now = element.getBoundingClientRect();
    last = { x: now.left + dx, y: now.top + dy };
    return last;
  };
}

function render(session: DrawSession, now: number): void {
  const preview = session.preview;
  if (!preview) return;

  const origin = session.originAt();
  const candidate = resolveCandidate(session.pointerX, session.pointerY, session);
  if (!sameCandidate(candidate, session.candidate)) {
    session.snap = prefersReducedMotion() ? null : { from: session.free, start: now };
    session.candidate = candidate;
  }

  const goal = candidate
    ? { x: candidate.x, y: candidate.y }
    : { x: session.pointerX, y: session.pointerY };
  let free = goal;
  if (session.snap) {
    const progress = (now - session.snap.start) / SNAP_MS;
    if (progress >= 1) session.snap = null;
    else {
      const t = easeOut(Math.max(0, progress));
      free = {
        x: session.snap.from.x + (goal.x - session.snap.from.x) * t,
        y: session.snap.from.y + (goal.y - session.snap.from.y) * t,
      };
    }
  }

  session.free = free;
  preview.draw(origin, free, candidate !== null);
}

function sameCandidate(a: Candidate | null, b: Candidate | null): boolean {
  if (a === null || b === null) return a === b;
  return a.itemId === b.itemId && a.anchor === b.anchor;
}

/**
 * The sheet follows a line drawn towards its edge, so a link can reach work
 * that is off screen. A press that begins inside a zone — a dot near the edge —
 * has to leave it once before leaning on it counts.
 */
function edgeScroll(session: DrawSession): void {
  const scroller = document.querySelector<HTMLElement>('.timeline-scroll-container');
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  const x = session.pointerX;
  const y = session.pointerY;

  const ramp = (distance: number, zone: number, max: number): number =>
    Math.ceil(Math.min(1, distance / zone) * max);

  let speedX = 0;
  if (x < rect.left + EDGE_SCROLL_ZONE_PX) {
    speedX = -ramp(rect.left + EDGE_SCROLL_ZONE_PX - x, EDGE_SCROLL_ZONE_PX, EDGE_SCROLL_MAX_PX);
  } else if (x > rect.right - EDGE_SCROLL_ZONE_PX) {
    speedX = ramp(x - (rect.right - EDGE_SCROLL_ZONE_PX), EDGE_SCROLL_ZONE_PX, EDGE_SCROLL_MAX_PX);
  }

  // The date axis sits over the top of the scroller, so the zone starts below it
  const top = rect.top + HEADER_HEIGHT;
  let speedY = 0;
  if (y < top + EDGE_SCROLL_ZONE_Y_PX) {
    speedY = -ramp(top + EDGE_SCROLL_ZONE_Y_PX - y, EDGE_SCROLL_ZONE_Y_PX, EDGE_SCROLL_MAX_Y_PX);
  } else if (y > rect.bottom - EDGE_SCROLL_ZONE_Y_PX) {
    speedY = ramp(
      y - (rect.bottom - EDGE_SCROLL_ZONE_Y_PX),
      EDGE_SCROLL_ZONE_Y_PX,
      EDGE_SCROLL_MAX_Y_PX
    );
  }

  if (speedX === 0) session.edgeXArmed = true;
  if (speedY === 0) session.edgeYArmed = true;
  if (session.edgeXArmed && speedX !== 0) scroller.scrollLeft += speedX;
  if (session.edgeYArmed && speedY !== 0) scroller.scrollTop += speedY;
}

// -- outcomes ------------------------------------------------------------------------

/**
 * How the gesture ends, decided at the release point itself — not the last
 * frame's candidate, which can be a frame behind the hand.
 */
function conclude(session: DrawSession, outcome: 'release' | 'cancel'): void {
  const preview = session.preview;
  if (!preview) return;
  const { edgeId, fixed } = session.args;
  const x = session.pointerX;
  const y = session.pointerY;

  if (outcome === 'release') {
    const candidate = resolveCandidate(x, y, session);
    if (candidate) {
      const landed = commitDraw(session.args, candidate);
      if (landed) {
        landOn(preview, landed, fixed.end);
        return;
      }
    } else if (edgeId && !isOverItem(x, y)) {
      // Open paper: a link picked up and put down nowhere is un-drawn
      flushSync(() => {
        useSectionStore.getState().removeDependency(edgeId);
        const ui = useUIStore.getState();
        if (ui.selectedDependencyId === edgeId) ui.selectDependency(null);
        releaseHeldDependency(edgeId);
      });
      preview.retract(session.originAt);
      syncHover(session);
      return;
    }
  }

  // Called off, or let go over something that would not take it. A link that
  // already existed goes back to where it came from; a new one goes home.
  if (edgeId && edgeExists(edgeId)) {
    flushSync(() => {
      setHeldDependency({ edgeId, end: movingEndOf(fixed), ink: 'hidden' });
    });
    syncHover(session);
    landOn(preview, edgeId, fixed.end);
    return;
  }

  if (edgeId) releaseHeldDependency(edgeId);
  preview.retract(session.originAt);
  syncHover(session);
}

/**
 * Write the link, and render it before returning: the fold needs to read the
 * route the sheet is about to print, and the route must mount with its ink
 * already held back or it would show for a frame under the line still folding.
 */
function commitDraw(args: StartDependencyDrawArgs, candidate: Candidate): string | null {
  const { fixed, edgeId } = args;
  return flushSync((): string | null => {
    const store = useSectionStore.getState();
    let landed: string | null;
    if (edgeId) {
      const moved = store.retargetDependency(
        edgeId,
        movingEndOf(fixed),
        candidate.itemId,
        candidate.anchor
      );
      landed = moved ? edgeId : null;
    } else {
      landed =
        fixed.end === 'from'
          ? store.addDependency(fixed.itemId, fixed.anchor, candidate.itemId, candidate.anchor)
          : store.addDependency(candidate.itemId, candidate.anchor, fixed.itemId, fixed.anchor);
    }
    if (!landed) return null;

    // The terminal of a re-routed link is still under the pointer, and the
    // click that follows this pointerup is aimed at it — so it stays mounted.
    setHeldDependency({ edgeId: landed, end: edgeId ? movingEndOf(fixed) : null, ink: 'hidden' });
    // The pointer is resting on the item it just connected; pointerenter
    // already fired while the dot held the capture, so say it here — the new
    // line should stay on the sheet once the fold hands it over.
    reportDependencyHover(candidate.itemId);
    return landed;
  });
}

/** Fold the line into the edge's route, then give the edge its ink back. */
function landOn(preview: DependencyDrawPreview, edgeId: string, pinned: 'from' | 'to'): void {
  preview.land(readRoute(edgeId, pinned), {
    onInk: () => {
      const held = getHeldDependency();
      if (held?.edgeId === edgeId) setHeldDependency({ ...held, ink: 'inked' });
    },
    // Handed back to the sheet. If nothing reveals it any more — the pointer
    // moved on while it landed — the layer fades it out from here.
    onDone: () => releaseHeldDependency(edgeId),
  });
}

function movingEndOf(fixed: DrawFixedEnd): 'from' | 'to' {
  return fixed.end === 'from' ? 'to' : 'from';
}

function edgeExists(edgeId: string): boolean {
  return useSectionStore.getState().dependencies.some((edge) => edge.id === edgeId);
}

/**
 * The route an edge is printed along, read off the dependency layer, from the
 * pinned end to the moving one. `null` when the edge is not on the sheet.
 */
function readRoute(edgeId: string, pinned: 'from' | 'to'): SheetRoute | null {
  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(edgeId) : edgeId;
  const path = document.querySelector<SVGPathElement>(`[data-dep-route="${id}"]`);
  const frame = path?.ownerSVGElement;
  if (!path || !frame) return null;
  const points = parseRoute(path.getAttribute('d') ?? '');
  if (points.length < 2) return null;
  return { frame, points: pinned === 'from' ? points : points.slice().reverse() };
}

// -- hover ---------------------------------------------------------------------------

/**
 * The capture held every boundary event while the line was in the hand, so
 * the hover still names whatever the pointer was over at the press. Set it to
 * whatever it is over now — or let it linger out over open paper.
 */
function syncHover(session: DrawSession): void {
  if (session.pointerType !== 'mouse') return;
  const itemId = hoverableItemAt(session.pointerX, session.pointerY);
  if (itemId) {
    reportDependencyHover(itemId);
    return;
  }
  const current = useUIStore.getState().dependencyHoverItemId;
  if (current) reportDependencyLeave(current);
}

/** The sheet item under a point — the labels column reveals nothing. */
function hoverableItemAt(clientX: number, clientY: number): string | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
    if (element.closest('[data-flip-column="labels"]')) return null;
    const itemId = element.dataset.dragItem;
    if (itemId) return itemId;
  }
  return null;
}

// -- targets -------------------------------------------------------------------------

/** The fixed item, everything above it and everything under it. */
function blockedIdsFor(itemId: string): ReadonlySet<string> {
  const { sections } = useSectionStore.getState();
  for (const section of sections) {
    const path = findItemPath(section.items, itemId);
    if (!path) continue;
    const blocked = new Set<string>(path.map((item) => item.id));
    collectIds(path[path.length - 1], blocked);
    return blocked;
  }
  return new Set([itemId]);
}

/** Whether a point is over a bar or a milestone at all, taker or not. */
function isOverItem(clientX: number, clientY: number): boolean {
  return document
    .elementsFromPoint(clientX, clientY)
    .some(
      (element) =>
        element instanceof HTMLElement &&
        Boolean(element.dataset.dropBar || element.dataset.depMilestone)
    );
}

/**
 * What the moving end is over, read straight off the DOM the way item drops
 * are. A bar aims at its near anchor by default; only reaching into its far
 * quarter asks for the other end, and a left dot only ever offers starts — so
 * the three real types are drawable and the fourth is simply not on the sheet.
 */
function resolveCandidate(
  clientX: number,
  clientY: number,
  session: DrawSession
): Candidate | null {
  const { fixed } = session.args;
  const stack = document.elementsFromPoint(clientX, clientY);

  for (const element of stack) {
    if (!(element instanceof HTMLElement)) continue;
    const data = element.dataset;
    const isBar = Boolean(data.dropBar);
    const isMilestone = Boolean(data.depMilestone);
    if (!isBar && !isMilestone) continue;

    const itemId = (isBar ? data.dropBar : data.depMilestone) as string;
    if (session.blockedIds.has(itemId)) return null;

    const rect = element.getBoundingClientRect();
    const anchor = candidateAnchor(fixed, isMilestone, rect, clientX);
    if (anchor === null) return null;

    if (!wouldBeValid(session, itemId, anchor)) return null;

    if (isMilestone) {
      return { itemId, anchor, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    const x = anchor === 'start' ? rect.left - DEP_DOT_OFFSET : rect.right + DEP_DOT_OFFSET;
    return { itemId, anchor, x, y: rect.top + rect.height / 2 };
  }

  return null;
}

function candidateAnchor(
  fixed: DrawFixedEnd,
  isMilestone: boolean,
  rect: DOMRect,
  clientX: number
): DependencyAnchor | null {
  const farZone = Math.max(12, rect.width * FAR_ANCHOR_FRACTION);

  if (fixed.end === 'from') {
    // Placing the arrow. A milestone is a point; a start-anchored source only
    // pairs with starts (start→end is the one type nobody uses, so it is not drawable).
    if (isMilestone) return 'start';
    if (fixed.anchor === 'start') return 'start';
    return clientX > rect.right - farZone ? 'end' : 'start';
  }

  // Placing the tail. An end-anchored target only pairs with ends.
  if (isMilestone) return 'end';
  if (fixed.anchor === 'end') return 'end';
  return clientX < rect.left + farZone ? 'start' : 'end';
}

function wouldBeValid(session: DrawSession, itemId: string, anchor: DependencyAnchor): boolean {
  const key = `${itemId}:${anchor}`;
  const known = session.validity.get(key);
  if (known !== undefined) return known;

  const { fixed, edgeId } = session.args;
  const { sections, dependencies } = useSectionStore.getState();
  const from = fixed.end === 'from' ? fixed : { itemId, anchor };
  const to = fixed.end === 'to' ? fixed : { itemId, anchor };
  const others = edgeId ? dependencies.filter((edge) => edge.id !== edgeId) : dependencies;
  const valid =
    canLinkItems(sections, from.itemId, to.itemId) &&
    !isDuplicateEdge(others, from.itemId, from.anchor, to.itemId, to.anchor);
  session.validity.set(key, valid);
  return valid;
}
