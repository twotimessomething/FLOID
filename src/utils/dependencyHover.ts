import { useSyncExternalStore } from 'react';
import type { DependencyEdge } from '../types/timeline';
import { useUIStore } from '../stores/uiStore';

/**
 * What keeps a link on the sheet.
 *
 * Hover with a short linger. A revealed connector is something the eye may
 * want to follow — or the hand may want to click — and the moment the pointer
 * leaves the bar to do either, a literal reading of hover would take the line
 * away mid-reach. Clearing through a small delay keeps the ink on the sheet
 * just long enough to travel along it; arriving anywhere that re-reports hover
 * cancels the clear.
 *
 * And a link in the hand. While one is being re-routed, or while a freshly
 * drawn line is folding into its route, the link belongs to the gesture, not
 * to hover: it stays mounted whatever the pointer is over — its terminal may
 * be holding the pointer capture — and its own ink is held back so the line
 * in flight is the only copy on the sheet.
 *
 * Nothing here ever simply vanishes: a link that stops being revealed fades
 * out (`trackDepartures`), so letting go of one is never a cut.
 */

const LINGER_MS = 250;
/** A link leaving the sheet fades rather than vanishing. `--duration-fast`. */
export const LINK_EXIT_MS = 120;

/** What the sheet is pointing at right now — everything that can reveal a link. */
export interface RevealContext {
  readonly hoverItemId: string | null;
  readonly selectedItemId: string | null;
  readonly selectedDependencyId: string | null;
}

/**
 * Whether a link is on the sheet. Connectors hide by default; hovering or
 * selecting either end reveals them, a selected link is always shown, and a
 * violated one stays printed until the work is back in order. One rule, so the
 * layer drawing the lines and the gesture handing one back cannot disagree.
 */
export function isEdgeRevealed(
  edge: DependencyEdge,
  isViolated: boolean,
  { hoverItemId, selectedItemId, selectedDependencyId }: RevealContext
): boolean {
  const touches = (itemId: string | null): boolean =>
    itemId !== null && (edge.from === itemId || edge.to === itemId);
  return (
    isViolated ||
    edge.id === selectedDependencyId ||
    touches(hoverItemId) ||
    touches(selectedItemId)
  );
}

/**
 * Links on their way off the sheet, by id, with when they started to go.
 *
 * Whatever stops revealing a link — the pointer moving on, a linger running
 * out, a gesture letting go of the link it was holding — it fades out over
 * `LINK_EXIT_MS` instead of being unmounted in the frame the reveal ends. A
 * link revealed again on its way out simply stays.
 */
export type Departures = ReadonlyMap<string, number>;

export const NO_DEPARTURES: Departures = new Map();

/** The departures after the revealed set changed. The same map when nothing did. */
export function trackDepartures(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
  leaving: Departures,
  now: number
): Departures {
  let next: Map<string, number> | null = null;
  const edit = (): Map<string, number> => (next ??= new Map(leaving));
  for (const id of before) {
    if (!after.has(id) && !leaving.has(id)) edit().set(id, now);
  }
  for (const id of leaving.keys()) {
    if (after.has(id)) edit().delete(id);
  }
  return next ?? leaving;
}

/** Drop every departure that has finished fading. The same map when none has. */
export function expireDepartures(leaving: Departures, now: number): Departures {
  let next: Map<string, number> | null = null;
  for (const [id, since] of leaving) {
    if (now - since >= LINK_EXIT_MS) (next ??= new Map(leaving)).delete(id);
  }
  return next ?? leaving;
}

let lingerTimer: ReturnType<typeof setTimeout> | null = null;

export function reportDependencyHover(itemId: string): void {
  if (lingerTimer !== null) {
    clearTimeout(lingerTimer);
    lingerTimer = null;
  }
  useUIStore.getState().setDependencyHover(itemId);
}

export function reportDependencyLeave(itemId: string): void {
  if (lingerTimer !== null) clearTimeout(lingerTimer);
  lingerTimer = setTimeout(() => {
    lingerTimer = null;
    const store = useUIStore.getState();
    // Only let go if nothing else has taken the hover in the meantime
    if (store.dependencyHoverItemId === itemId) store.setDependencyHover(null);
  }, LINGER_MS);
}

/**
 * A gesture is starting: whatever is revealed stays revealed. Leaving the bar
 * to reach a line's far terminal starts a linger, and a linger that ran out
 * mid-drag would take the line — and the terminal holding the pointer — away.
 */
export function holdDependencyHover(): void {
  if (lingerTimer === null) return;
  clearTimeout(lingerTimer);
  lingerTimer = null;
}

/**
 * The link a gesture owns.
 *
 * - `drained`: its end is in the hand. The route fades out under the line
 *   being drawn, but the edge stays mounted, terminal and all.
 * - `hidden`: the line in flight is folding into this route. Ink held back,
 *   with no transition — a new edge must mount invisible.
 * - `inked`: the fold has arrived; the route fades back in under it.
 */
export interface HeldDependency {
  readonly edgeId: string;
  /** The end whose terminal must stay mounted — it may hold the pointer. */
  readonly end: 'from' | 'to' | null;
  readonly ink: 'drained' | 'hidden' | 'inked';
}

let held: HeldDependency | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): HeldDependency | null {
  return held;
}

export function getHeldDependency(): HeldDependency | null {
  return held;
}

export function setHeldDependency(next: HeldDependency | null): void {
  if (next === held) return;
  held = next;
  listeners.forEach((listener) => listener());
}

/** Let go of a link — only if no later gesture has taken hold of another. */
export function releaseHeldDependency(edgeId: string): void {
  if (held?.edgeId === edgeId) setHeldDependency(null);
}

/** Whatever link a gesture still holds, let go of it now. A new gesture wins. */
export function finishHeldDependency(): void {
  setHeldDependency(null);
}

export function useHeldDependency(): HeldDependency | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
