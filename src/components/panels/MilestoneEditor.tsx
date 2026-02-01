import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection, selectMilestone } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

export function MilestoneEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updateMilestone, deleteMilestone } = useSectionStore();
  const { project } = useProjectStore();

  const sectionId = selection.sectionId;
  const milestoneId = selection.id;

  // Memoize selectors to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const milestoneSelector = useMemo(() => selectMilestone(sectionId || '', milestoneId || ''), [sectionId, milestoneId]);

  const section = useSectionStore(sectionSelector);
  const milestone = useSectionStore(milestoneSelector);

  // Calculate milestone date using project dates (since milestones are project-relative)
  const date = useMemo(() => {
    if (!milestone) {
      return new Date();
    }

    return getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      milestone.relativePosition
    );
  }, [milestone, project.startDate, project.endDate]);

  const projectStartDate = useMemo(() => new Date(project.startDate), [project.startDate]);
  const projectEndDate = useMemo(() => new Date(project.endDate), [project.endDate]);

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
      if (!sectionId || !milestoneId) return;
      const newRelativePosition = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        newDate
      );
      // Clamp to 0-1
      const clampedPosition = Math.max(0, Math.min(1, newRelativePosition));
      updateMilestone(sectionId, milestoneId, { relativePosition: clampedPosition });
    },
    [sectionId, milestoneId, project.startDate, project.endDate, updateMilestone]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !milestoneId || !milestone) return;
    if (confirm(`Delete milestone "${milestone.name}"?`)) {
      deleteMilestone(sectionId, milestoneId);
      closeModal();
    }
  }, [sectionId, milestoneId, milestone, deleteMilestone, closeModal]);

  if (!milestone || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Milestone not found</div>;
  }

  // Determine context label
  const contextLabel = section.type === 'id-timeline'
    ? 'Industrial Design'
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
        min={projectStartDate}
        max={projectEndDate}
      />

      <div className="pt-4 border-t border-[var(--color-border)]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Milestone
        </Button>
      </div>
    </div>
  );
}
