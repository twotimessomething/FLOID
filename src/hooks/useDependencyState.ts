import { useCallback } from 'react';
import type { DependencyAnchor } from '../types/timeline';
import { useSectionStore } from '../stores/sectionStore';

/**
 * Whether an item's ends are spoken for — what keeps a connector's dot printed
 * after the hover that revealed it has gone. Boolean selectors, so a row only
 * re-renders when its own answer changes, not on every edge drawn elsewhere.
 */

/** True when any edge holds onto this specific end of a bar. */
export function useAnchorConnected(itemId: string, anchor: DependencyAnchor): boolean {
  return useSectionStore(
    useCallback(
      (state) =>
        state.dependencies.some(
          (edge) =>
            (edge.from === itemId && edge.fromAnchor === anchor) ||
            (edge.to === itemId && edge.toAnchor === anchor)
        ),
      [itemId, anchor]
    )
  );
}

/** True when any edge touches this item at all — a milestone has only the one point. */
export function useItemConnected(itemId: string): boolean {
  return useSectionStore(
    useCallback(
      (state) => state.dependencies.some((edge) => edge.from === itemId || edge.to === itemId),
      [itemId]
    )
  );
}
