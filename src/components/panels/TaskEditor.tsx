import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection, selectPhase, selectTask } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

export function TaskEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updateTask, updateTaskPosition, deleteTask } = useSectionStore();

  const sectionId = selection.sectionId;
  const phaseId = selection.phaseId;
  const taskId = selection.id;

  // Memoize selectors to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const phaseSelector = useMemo(() => selectPhase(sectionId || '', phaseId || ''), [sectionId, phaseId]);
  const taskSelector = useMemo(() => selectTask(sectionId || '', phaseId || '', taskId || ''), [sectionId, phaseId, taskId]);

  const section = useSectionStore(sectionSelector);
  const phase = useSectionStore(phaseSelector);
  const task = useSectionStore(taskSelector);

  // Calculate absolute dates for the task
  // Tasks are positioned relative to their parent phase
  const { startDate, endDate, phaseStartDate, phaseEndDate } = useMemo(() => {
    if (!task || !phase || !section) {
      return {
        startDate: new Date(),
        endDate: new Date(),
        phaseStartDate: new Date(),
        phaseEndDate: new Date(),
      };
    }

    // Get phase dates using section date range
    const pStart = getDateFromRelativePosition(
      section.startDate,
      section.endDate,
      phase.relativeStart
    );
    const pEnd = getDateFromRelativePosition(
      section.startDate,
      section.endDate,
      phase.relativeEnd
    );

    // Get task dates (relative to phase)
    const tStart = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      task.relativeStart
    );
    const tEnd = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      task.relativeEnd
    );

    return {
      startDate: tStart,
      endDate: tEnd,
      phaseStartDate: pStart,
      phaseEndDate: pEnd,
    };
  }, [task, phase, section]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId || !phaseId || !taskId) return;
      updateTask(sectionId, phaseId, taskId, { name: e.target.value });
    },
    [sectionId, phaseId, taskId, updateTask]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!sectionId || !phaseId || !taskId) return;
      updateTask(sectionId, phaseId, taskId, { description: e.target.value });
    },
    [sectionId, phaseId, taskId, updateTask]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !taskId || !task) return;
      const newRelativeStart = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedStart = Math.max(0, Math.min(newRelativeStart, task.relativeEnd - 0.01));
      updateTaskPosition(sectionId, phaseId, taskId, clampedStart, task.relativeEnd);
    },
    [sectionId, phaseId, taskId, task, phaseStartDate, phaseEndDate, updateTaskPosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !taskId || !task) return;
      const newRelativeEnd = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedEnd = Math.min(1, Math.max(newRelativeEnd, task.relativeStart + 0.01));
      updateTaskPosition(sectionId, phaseId, taskId, task.relativeStart, clampedEnd);
    },
    [sectionId, phaseId, taskId, task, phaseStartDate, phaseEndDate, updateTaskPosition]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !phaseId || !taskId) return;
    deleteTask(sectionId, phaseId, taskId);
    closeModal();
  }, [sectionId, phaseId, taskId, deleteTask, closeModal]);

  if (!task || !phase || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Task not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[var(--color-text-secondary)]">
        Part of <span className="font-medium text-[var(--color-text-primary)]">{phase.name}</span>
        {' in '}
        <span className="font-medium text-[var(--color-text-primary)]">{section.name}</span>
      </div>

      <Input
        label="Name"
        value={task.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Task name"
      />

      <TextArea
        label="Description"
        value={task.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      <div className="grid grid-cols-2 gap-3">
        <DateInput
          label="Start Date"
          value={startDate}
          onChange={handleStartDateChange}
          min={phaseStartDate}
          max={endDate}
        />
        <DateInput
          label="End Date"
          value={endDate}
          onChange={handleEndDateChange}
          min={startDate}
          max={phaseEndDate}
        />
      </div>

      <div className="pt-2">
        <Button variant="danger" onClick={handleDelete} className="w-full">Delete Task</Button>
      </div>
    </div>
  );
}
