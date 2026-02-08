import { useCallback } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import type { Section } from '../types';

/**
 * Hook that properly subscribes to both projectStore (for masterSectionId)
 * and sectionStore (for sections), ensuring re-renders when either changes.
 *
 * Replaces the old selectMasterSection/selectNonMasterSections selectors
 * which called useProjectStore.getState() inside a sectionStore selector,
 * breaking reactivity when masterSectionId changed.
 */
export function useMasterSection(): {
  masterSection: Section | undefined;
  nonMasterSections: Section[];
} {
  const masterSectionId = useProjectStore((state) => state.project?.masterSectionId);

  const masterSection = useSectionStore(
    useCallback(
      (state) => state.sections.find((s) => s.id === masterSectionId),
      [masterSectionId]
    )
  );

  const nonMasterSections = useSectionStore(
    useCallback(
      (state) => state.sections.filter((s) => s.id !== masterSectionId),
      [masterSectionId]
    )
  );

  return { masterSection, nonMasterSections };
}
