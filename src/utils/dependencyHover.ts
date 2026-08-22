import { useUIStore } from '../stores/uiStore';

/**
 * Hover with a short linger.
 *
 * A revealed connector is something the eye may want to follow — or the hand
 * may want to click — and the moment the pointer leaves the bar to do either,
 * a literal reading of hover would take the line away mid-reach. Clearing
 * through a small delay keeps the ink on the sheet just long enough to travel
 * along it; arriving anywhere that re-reports hover cancels the clear.
 */

const LINGER_MS = 250;

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
