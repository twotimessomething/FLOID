import { useCallback, useEffect, useRef } from 'react';
import type { DependencyAnchor } from '../types/timeline';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { canLinkItems, isDuplicateEdge } from '../utils/dependencyUtils';
import { collectIds, findItemPath } from '../utils/itemTree';
import { DEP_DOT_OFFSET } from '../utils/dependencyGeometry';
import {
  createDependencyDrawPreview,
  type DependencyDrawPreview,
} from '../utils/dependencyDrawPreview';

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
 */

/** Movement, in px, before a press on a dot becomes a draw rather than a click. */
const DRAW_THRESHOLD_PX = 4;
/** The outer stretch of a bar that aims at its far anchor instead of its start. */
const FAR_ANCHOR_FRACTION = 0.25;

/** The end that stays put for the whole gesture. */
export interface DrawFixedEnd {
  readonly end: 'from' | 'to';
  readonly itemId: string;
  readonly anchor: DependencyAnchor;
}

export interface StartDependencyDrawArgs {
  /** Client coordinates the line is pinned to. */
  readonly origin: { readonly x: number; readonly y: number };
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
  args: StartDependencyDrawArgs;
  startClientX: number;
  startClientY: number;
  active: boolean;
  preview: DependencyDrawPreview | null;
  candidate: Candidate | null;
  /** The fixed item, its ancestors and its descendants — none may take the line. */
  blockedIds: ReadonlySet<string>;
  cleanup: () => void;
}

export function useDependencyDraw(): {
  startDraw: (event: React.PointerEvent, args: StartDependencyDrawArgs) => void;
} {
  const sessionRef = useRef<DrawSession | null>(null);

  useEffect(() => () => sessionRef.current?.cleanup(), []);

  const startDraw = useCallback((event: React.PointerEvent, args: StartDependencyDrawArgs): void => {
    if (event.button !== 0 || sessionRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    // The dot is a few pixels the pointer leaves on the first frame; capture
    // keeps the rest of the gesture addressed to it.
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

    const session: DrawSession = {
      args,
      startClientX: event.clientX,
      startClientY: event.clientY,
      active: false,
      preview: null,
      candidate: null,
      blockedIds: new Set(),
      cleanup: () => undefined,
    };

    const activate = (): void => {
      session.active = true;
      session.blockedIds = blockedIdsFor(args.fixed.itemId);
      session.preview = createDependencyDrawPreview();
      document.body.classList.add('no-select');
      document.body.classList.add('dependency-drawing');
    };

    const render = (clientX: number, clientY: number): void => {
      const candidate = resolveCandidate(clientX, clientY, session);
      session.candidate = candidate;
      session.preview?.update(
        session.args.origin.x,
        session.args.origin.y,
        candidate ? candidate.x : clientX,
        candidate ? candidate.y : clientY,
        candidate !== null
      );
    };

    const onMove = (moveEvent: PointerEvent): void => {
      if (!session.active) {
        const dx = Math.abs(moveEvent.clientX - session.startClientX);
        const dy = Math.abs(moveEvent.clientY - session.startClientY);
        if (dx < DRAW_THRESHOLD_PX && dy < DRAW_THRESHOLD_PX) return;
        activate();
      }
      render(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = (): void => {
      const wasActive = session.active;
      const candidate = session.candidate;
      session.cleanup();
      if (!wasActive) return;
      commitDraw(session.args, candidate);
    };

    /** A gesture the system took away, or Escape. Nothing lands, nothing is lost. */
    const onCancel = (): void => session.cleanup();
    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') session.cleanup();
    };

    session.cleanup = (): void => {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKeyDown);
      session.preview?.destroy();
      if (session.active) {
        document.body.classList.remove('no-select');
        document.body.classList.remove('dependency-drawing');
      }
    };

    sessionRef.current = session;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown);
  }, []);

  return { startDraw };
}

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
  const { fixed, edgeId } = session.args;
  const stack = document.elementsFromPoint(clientX, clientY) as HTMLElement[];

  for (const element of stack) {
    const data = element.dataset;
    const isBar = Boolean(data.dropBar);
    const isMilestone = Boolean(data.depMilestone);
    if (!isBar && !isMilestone) continue;

    const itemId = (isBar ? data.dropBar : data.depMilestone) as string;
    if (session.blockedIds.has(itemId)) return null;

    const rect = element.getBoundingClientRect();
    const anchor = candidateAnchor(fixed, isMilestone, rect, clientX);
    if (anchor === null) return null;

    if (!wouldBeValid(fixed, edgeId, itemId, anchor)) return null;

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

function wouldBeValid(
  fixed: DrawFixedEnd,
  edgeId: string | undefined,
  itemId: string,
  anchor: DependencyAnchor
): boolean {
  const { sections, dependencies } = useSectionStore.getState();
  const from = fixed.end === 'from' ? fixed : { itemId, anchor };
  const to = fixed.end === 'to' ? fixed : { itemId, anchor };
  if (!canLinkItems(sections, from.itemId, to.itemId)) return false;
  const others = edgeId ? dependencies.filter((edge) => edge.id !== edgeId) : dependencies;
  return !isDuplicateEdge(others, from.itemId, from.anchor, to.itemId, to.anchor);
}

function commitDraw(args: StartDependencyDrawArgs, candidate: Candidate | null): void {
  const store = useSectionStore.getState();
  const { fixed, edgeId } = args;

  if (!candidate) {
    // Open paper: a new line was never asked for; an existing one is un-drawn.
    if (edgeId) {
      store.removeDependency(edgeId);
      useUIStore.getState().selectDependency(null);
    }
    return;
  }

  if (edgeId) {
    const movingEnd = fixed.end === 'from' ? 'to' : 'from';
    store.retargetDependency(edgeId, movingEnd, candidate.itemId, candidate.anchor);
    return;
  }

  const created =
    fixed.end === 'from'
      ? store.addDependency(fixed.itemId, fixed.anchor, candidate.itemId, candidate.anchor)
      : store.addDependency(candidate.itemId, candidate.anchor, fixed.itemId, fixed.anchor);

  // The pointer is resting on the bar it just connected; pointerenter already
  // fired while the dot held the capture, so say it here — the new line should
  // be on the sheet the moment the button comes up.
  if (created) useUIStore.getState().setDependencyHover(candidate.itemId);
}
