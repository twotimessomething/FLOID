import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection, selectMilestone } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate, parseDate } from '../../utils/dateUtils';

export function MilestoneEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updateMilestone, deleteMilestone } = useSectionStore();

  const sectionId = selection.sectionId;
  const milestoneId = selection.id;

  // Memoize selectors to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const milestoneSelector = useMemo(() => selectMilestone(sectionId || '', milestoneId || ''), [sectionId, milestoneId]);

  const section = useSectionStore(sectionSelector);
  const milestone = useSectionStore(milestoneSelector);
  const project = useProjectStore((state) => state.project);

  // Calculate milestone date using section dates (milestones are section-relative)
  const date = useMemo(() => {
    if (!milestone || !section) {
      return new Date();
    }

    return getDateFromRelativePosition(
      section.startDate,
      section.endDate,
      milestone.relativePosition
    );
  }, [milestone, section]);

  const sectionStartDate = useMemo(() => section ? parseDate(section.startDate) : new Date(), [section]);
  const sectionEndDate = useMemo(() => section ? parseDate(section.endDate) : new Date(), [section]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId || !milestoneId) return;
      updateMilestone(sectionId, milestoneId, { name: e.target.value });
    },
    [sectionId, milestoneId, updateMilestone]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!sectionId || !milestoneId) return;
      updateMilestone(sectionId, milestoneId, { description: e.target.value });
    },
    [sectionId, milestoneId, updateMilestone]
  );

  const handleDateChange = useCallback(
    (newDate: Date) => {
      if (!sectionId || !milestoneId || !section) return;
      const newRelativePosition = getRelativePositionFromDate(
        section.startDate,
        section.endDate,
        newDate
      );
      // Clamp to 0-1
      const clampedPosition = Math.max(0, Math.min(1, newRelativePosition));
      updateMilestone(sectionId, milestoneId, { relativePosition: clampedPosition });
    },
    [sectionId, milestoneId, section, updateMilestone]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !milestoneId) return;
    deleteMilestone(sectionId, milestoneId);
    closeModal();
  }, [sectionId, milestoneId, deleteMilestone, closeModal]);

  if (!milestone || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Milestone not found</div>;
  }

  // Determine context label
  const isMasterSection = section.id === project?.masterSectionId;
  const contextLabel = isMasterSection
    ? section.name
    : section.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[var(--color-text-secondary)]">
        Milestone in <span className="font-medium text-[var(--color-text-primary)]">{contextLabel}</span>
      </div>

      <Input
        label="Name"
        value={milestone.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Milestone name"
      />

      <TextArea
        label="Description"
        value={milestone.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      <DateInput
        label="Date"
        value={date}
        onChange={handleDateChange}
        min={sectionStartDate}
        max={sectionEndDate}
      />

      <div className="pt-4 border-t border-[var(--color-border)]">
        <Button variant="danger" onClick={handleDelete} className="w-full">Delete Milestone</Button>
      </div>
    </div>
  );
}
