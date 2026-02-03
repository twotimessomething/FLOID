import { useCallback, useMemo } from 'react';
import {
  useSectionStore,
  selectSection,
  selectPhase,
  selectElement,
  selectPhaseBarMilestone,
  selectElementBarMilestone,
} from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, Button } from '../common';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';

export function BarMilestoneEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const {
    updatePhaseBarMilestone,
    updateElementBarMilestone,
    deletePhaseBarMilestone,
    deleteElementBarMilestone,
  } = useSectionStore();
  const project = useProjectStore((state) => state.project);

  const sectionId = selection.sectionId;
  const phaseId = selection.phaseId;
  const elementId = selection.elementId;
  const barMilestoneId = selection.id;

  // Memoize selectors
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const phaseSelector = useMemo(() => selectPhase(sectionId || '', phaseId || ''), [sectionId, phaseId]);
  const elementSelector = useMemo(
    () => selectElement(sectionId || '', phaseId || '', elementId || ''),
    [sectionId, phaseId, elementId]
  );

  // Select the bar milestone from either phase or element
  const phaseBarMilestoneSelector = useMemo(
    () => selectPhaseBarMilestone(sectionId || '', phaseId || '', barMilestoneId || ''),
    [sectionId, phaseId, barMilestoneId]
  );
  const elementBarMilestoneSelector = useMemo(
    () => selectElementBarMilestone(sectionId || '', phaseId || '', elementId || '', barMilestoneId || ''),
    [sectionId, phaseId, elementId, barMilestoneId]
  );

  const section = useSectionStore(sectionSelector);
  const phase = useSectionStore(phaseSelector);
  const element = useSectionStore(elementSelector);
  const phaseBarMilestone = useSectionStore(phaseBarMilestoneSelector);
  const elementBarMilestone = useSectionStore(elementBarMilestoneSelector);

  // Determine which bar milestone we're editing
  const barMilestone = elementId ? elementBarMilestone : phaseBarMilestone;
  const isOnElement = !!elementId;

  const isMasterSection = section?.id === project?.masterSectionId;

  // Calculate the date for this bar milestone
  const milestoneDate = useMemo(() => {
    if (!barMilestone || !phase || !section) return null;

    if (isOnElement && element) {
      // Bar milestone on element: convert element-relative to section-relative
      const phaseWidth = phase.relativeEnd - phase.relativeStart;
      const elementSectionStart = phase.relativeStart + element.relativeStart * phaseWidth;
      const elementSectionEnd = phase.relativeStart + element.relativeEnd * phaseWidth;
      const elementWidth = elementSectionEnd - elementSectionStart;
      const sectionRelative = elementSectionStart + barMilestone.relativePosition * elementWidth;
      return getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
    } else {
      // Bar milestone on phase: convert phase-relative to section-relative
      const phaseWidth = phase.relativeEnd - phase.relativeStart;
      const sectionRelative = phase.relativeStart + barMilestone.relativePosition * phaseWidth;
      return getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
    }
  }, [barMilestone, phase, element, section, isOnElement]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId || !phaseId || !barMilestoneId) return;
      if (isOnElement && elementId) {
        updateElementBarMilestone(sectionId, phaseId, elementId, barMilestoneId, { name: e.target.value });
      } else {
        updatePhaseBarMilestone(sectionId, phaseId, barMilestoneId, { name: e.target.value });
      }
    },
    [sectionId, phaseId, elementId, barMilestoneId, isOnElement, updatePhaseBarMilestone, updateElementBarMilestone]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !phaseId || !barMilestoneId) return;
    const name = barMilestone?.name || 'this milestone';
    if (confirm(`Delete "${name}"?`)) {
      if (isOnElement && elementId) {
        deleteElementBarMilestone(sectionId, phaseId, elementId, barMilestoneId);
      } else {
        deletePhaseBarMilestone(sectionId, phaseId, barMilestoneId);
      }
      closeModal();
    }
  }, [sectionId, phaseId, elementId, barMilestoneId, barMilestone, isOnElement, deletePhaseBarMilestone, deleteElementBarMilestone, closeModal]);

  if (!barMilestone || !phase || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Milestone not found</div>;
  }

  // Context label
  const contextLabel = isOnElement && element
    ? `${element.name} in ${phase.name}`
    : phase.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[var(--color-text-secondary)]">
        Marker on <span className="font-medium text-[var(--color-text-primary)]">{contextLabel}</span>
        {!isMasterSection && (
          <>
            {' in '}
            <span className="font-medium text-[var(--color-text-primary)]">{section.name}</span>
          </>
        )}
      </div>

      <Input
        label="Name"
        value={barMilestone.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Milestone name"
      />

      {milestoneDate && (
        <div className="text-sm text-[var(--color-text-secondary)]">
          <span className="text-xs text-[var(--color-text-muted)]">Date</span>
          <div className="mt-1 font-medium text-[var(--color-text-primary)]">
            {formatDate(milestoneDate, 'MMM d, yyyy')}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-[var(--color-border)]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete
        </Button>
      </div>
    </div>
  );
}
