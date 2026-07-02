import { useCallback } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import type { Section } from '../types';

/**
 * Hook that properly subscribes to both projectStore (for pinnedSectionId)
 * and sectionStore (for sections), ensuring re-renders when either changes.
 * At most one schedule is pinned; it renders at the top of the timeline.
 */
export function usePinnedSection(): {
  pinnedSection: Section | undefined;
  unpinnedSections: Section[];
} {
  const pinnedSectionId = useProjectStore((state) => state.project?.pinnedSectionId);

  const pinnedSection = useSectionStore(
    useCallback(
      (state) => (pinnedSectionId ? state.sections.find((s) => s.id === pinnedSectionId) : undefined),
      [pinnedSectionId]
    )
  );

  const unpinnedSections = useSectionStore(
    useCallback(
      (state) => state.sections.filter((s) => s.id !== pinnedSectionId),
      [pinnedSectionId]
    )
  );

  return { pinnedSection, unpinnedSections };
}
