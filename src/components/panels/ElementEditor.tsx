import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

interface ElementEditorProps {
  readonly elementId: string;
}

export function ElementEditor({ elementId }: ElementEditorProps): JSX.Element {
  const { phases, updateElement, updateElementPosition, deleteElement } = useTimelineStore();
  const { project } = useProjectStore();
  const { closeModal } = useUIStore();

  // Find element and its parent phase
  const { element, phase } = useMemo(() => {
    for (const p of phases) {
      const el = p.elements.find((e) => e.id === elementId);
      if (el) {
        return { element: el, phase: p };
      }
    }
    return { element: null, phase: null };
  }, [phases, elementId]);

  // Calculate absolute dates for the element
  // Elements are positioned relative to their parent phase
  const { startDate, endDate, phaseStartDate, phaseEndDate } = useMemo(() => {
    if (!element || !phase) {
      return {
        startDate: new Date(),
        endDate: new Date(),
        phaseStartDate: new Date(),
        phaseEndDate: new Date(),
      };
    }

    // Get phase dates
    const pStart = getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      phase.relativeStart
    );
    const pEnd = getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      phase.relativeEnd
    );

    // Get element dates (relative to phase)
    const eStart = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      element.relativeStart
    );
    const eEnd = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      element.relativeEnd
    );

    return {
      startDate: eStart,
      endDate: eEnd,
      phaseStartDate: pStart,
      phaseEndDate: pEnd,
    };
  }, [element, phase, project.startDate, project.endDate]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!phase) return;
      updateElement(phase.id, elementId, { name: e.target.value });
    },
    [phase, elementId, updateElement]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!phase) return;
      updateElement(phase.id, elementId, { description: e.target.value });
    },
    [phase, elementId, updateElement]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!phase || !element) return;
      const newRelativeStart = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedStart = Math.max(0, Math.min(newRelativeStart, element.relativeEnd - 0.01));
      updateElementPosition(phase.id, elementId, clampedStart, element.relativeEnd);
    },
    [phase, element, elementId, phaseStartDate, phaseEndDate, updateElementPosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!phase || !element) return;
      const newRelativeEnd = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedEnd = Math.min(1, Math.max(newRelativeEnd, element.relativeStart + 0.01));
      updateElementPosition(phase.id, elementId, element.relativeStart, clampedEnd);
    },
    [phase, element, elementId, phaseStartDate, phaseEndDate, updateElementPosition]
  );

  const handleDelete = useCallback(() => {
    if (!phase || !element) return;
    if (confirm(`Delete element "${element.name}"?`)) {
      deleteElement(phase.id, elementId);
      closeModal();
    }
  }, [phase, element, elementId, deleteElement, closeModal]);

  if (!element || !phase) {
    return <div className="text-sm text-[#6b7280]">Element not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[#6b7280]">
        Part of <span className="font-medium text-[#111827]">{phase.name}</span>
      </div>

      <Input
        label="Name"
        value={element.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Element name"
      />

      <TextArea
        label="Description"
        value={element.description}
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

      <div className="pt-4 border-t border-[#e5e7eb]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Element
        </Button>
      </div>
    </div>
  );
}
