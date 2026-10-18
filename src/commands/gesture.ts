import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';

/**
 * Whether a hand is on the sheet right now.
 *
 * While something is being dragged — a bar, a schedule by its grip, a resize
 * edge, a link being drawn — the sheet belongs to that gesture. It is holding
 * a preview, and it resolves its drop against the rows exactly as they stand.
 * A key that rewrote the tree or moved the selection under it would leave the
 * drop landing on something that is no longer there, so everything keyboard-
 * and menu-driven stands down until the pointer lets go.
 *
 * Three signals, because not every gesture keeps the same books: the UI flag
 * the drags, resizes, draws and the link pen raise, an open history
 * transaction (whatever opened it, undo in the middle of one would rewind the
 * wrong state), and the page class the link pen also sets — kept as a
 * backstop, since it is what the pen's own cleanup is sure to take off.
 */
export function isGestureInFlight(): boolean {
  if (useUIStore.getState().isDragging) return true;
  if (useSectionStore.getState()._dragSnapshot !== null) return true;
  return typeof document !== 'undefined' && document.body.classList.contains('dependency-drawing');
}

/**
 * Keydowns that arrived while a gesture was in flight.
 *
 * A gesture listens for its own Escape, and listeners run in the order they
 * were added — so the drag's handler can run first, end the drag, and leave
 * every handler after it looking at a sheet that is no longer being dragged.
 * The same Escape would then close the editor or drop the selection too. The
 * question is asked once, at the very start of dispatch, and the answer rides
 * with the event.
 */
const keysDuringGesture = new WeakSet<Event>();

function noteKey(event: KeyboardEvent): void {
  if (isGestureInFlight()) keysDuringGesture.add(event);
}

/**
 * Start recording which keydowns a gesture owns. Window, capture phase: the
 * first listener any keydown meets, whatever was added when. Returns the
 * cleanup.
 */
export function watchGestureKeys(): () => void {
  window.addEventListener('keydown', noteKey, true);
  return () => window.removeEventListener('keydown', noteKey, true);
}

/** True if this key was pressed while a gesture held the sheet. */
export function keyBelongsToGesture(event: KeyboardEvent): boolean {
  return keysDuringGesture.has(event) || isGestureInFlight();
}
