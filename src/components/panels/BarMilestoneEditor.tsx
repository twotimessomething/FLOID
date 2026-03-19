import { useCallback, useMemo } from 'react';
import {
  useSectionStore,
  selectSection,
  selectPhase,
  selectTask,
  selectPhaseBarMilestone,
  selectTaskBarMilestone,
} from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, Button } from '../common';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';

export function BarMilestoneEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const {
    updatePhaseBarMilestone,
    updateTaskBarMilestone,
    deletePhaseBarMilestone,
    deleteTaskBarMilestone,
  } = useSectionStore();
  const project = useProjectStore((state) => state.project);

  const sectionId = selection.sectionId;
  const phaseId = selection.phaseId;
  const taskId = selection.taskId;
  const barMilestoneId = selection.id;

  // Memoize selectors
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const phaseSelector = useMemo(() => selectPhase(sectionId || '', phaseId || ''), [sectionId, phaseId]);
  const taskSelector = useMemo(
    () => selectTask(sectionId || '', phaseId || '', taskId || ''),
    [sectionId, phaseId, taskId]
  );

  // Select the bar milestone from either phase or task
  const phaseBarMilestoneSelector = useMemo(
    () => selectPhaseBarMilestone(sectionId || '', phaseId || '', barMilestoneId || ''),
    [sectionId, phaseId, barMilestoneId]
  );
  const taskBarMilestoneSelector = useMemo(
    () => selectTaskBarMilestone(sectionId || '', phaseId || '', taskId || '', barMilestoneId || ''),
    [sectionId, phaseId, taskId, barMilestoneId]
  );

  const section = useSectionStore(sectionSelector);
  const phase = useSectionStore(phaseSelector);
  const task = useSectionStore(taskSelector);
  const phaseBarMilestone = useSectionStore(phaseBarMilestoneSelector);
  const taskBarMilestone = useSectionStore(taskBarMilestoneSelector);

  // Determine which bar milestone we're editing
  const barMilestone = taskId ? taskBarMilestone : phaseBarMilestone;
  const isOnTask = !!taskId;

  const isMasterSection = section?.id === project?.masterSectionId;

  // Calculate the date for this bar milestone
  const milestoneDate = useMemo(() => {
    if (!barMilestone || !phase || !section) return null;

    if (isOnTask && task) {
      // Bar milestone on task: convert task-relative to section-relative
      const phaseWidth = phase.relativeEnd - phase.relativeStart;
      const taskSectionStart = phase.relativeStart + task.relativeStart * phaseWidth;
      const taskSectionEnd = phase.relativeStart + task.relativeEnd * phaseWidth;
      const taskWidth = taskSectionEnd - taskSectionStart;
      const sectionRelative = taskSectionStart + barMilestone.relativePosition * taskWidth;
      return getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
    } else {
      // Bar milestone on phase: convert phase-relative to section-relative
      const phaseWidth = phase.relativeEnd - phase.relativeStart;
      const sectionRelative = phase.relativeStart + barMilestone.relativePosition * phaseWidth;
      return getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
    }
  }, [barMilestone, phase, task, section, isOnTask]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId || !phaseId || !barMilestoneId) return;
      if (isOnTask && taskId) {
        updateTaskBarMilestone(sectionId, phaseId, taskId, barMilestoneId, { name: e.target.value });
      } else {
        updatePhaseBarMilestone(sectionId, phaseId, barMilestoneId, { name: e.target.value });
      }
    },
    [sectionId, phaseId, taskId, barMilestoneId, isOnTask, updatePhaseBarMilestone, updateTaskBarMilestone]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !phaseId || !barMilestoneId) return;
    if (isOnTask && taskId) {
      deleteTaskBarMilestone(sectionId, phaseId, taskId, barMilestoneId);
    } else {
      deletePhaseBarMilestone(sectionId, phaseId, barMilestoneId);
    }
    closeModal();
  }, [sectionId, phaseId, taskId, barMilestoneId, isOnTask, deletePhaseBarMilestone, deleteTaskBarMilestone, closeModal]);

  if (!barMilestone || !phase || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Milestone not found</div>;
  }

  // Context label
  const contextLabel = isOnTask && task
    ? `${task.name} in ${phase.name}`
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
        <Button variant="danger" onClick={handleDelete} className="w-full">Delete</Button>
      </div>
    </div>
  );
}
