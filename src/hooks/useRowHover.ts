import { useSyncExternalStore } from 'react';

/**
 * The item the pointer is over on the sheet, for the labels column to echo.
 *
 * Plain hover, with no linger. The reveal that keeps a link on the sheet
 * (`dependencyHover`) holds on a moment so the eye can follow the line; this
 * only says which name belongs to the bar under the pointer, and a name still
 * lit after the pointer has moved on would be naming the wrong row.
 *
 * Kept out of the stores: it changes every time the pointer crosses an item's
 * edge, and each label row subscribes to a boolean of its own, so a crossing
 * re-renders the two rows it concerns and nothing else.
 */

let hoveredId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setHovered(next: string | null): void {
  if (next === hoveredId) return;
  hoveredId = next;
  listeners.forEach((listener) => listener());
}

export function reportRowHover(itemId: string): void {
  setHovered(itemId);
}

/** Only if nothing else has taken the hover in the meantime. */
export function reportRowLeave(itemId: string): void {
  if (hoveredId === itemId) setHovered(null);
}

/** Whether this item is under the pointer on the sheet. `null` never is. */
export function useIsRowHovered(itemId: string | null): boolean {
  const isHovered = (): boolean => itemId !== null && hoveredId === itemId;
  return useSyncExternalStore(subscribe, isHovered, () => false);
}
