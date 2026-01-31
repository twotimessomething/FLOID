import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection, selectPhase, selectElement } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

export function ElementEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updateElement, updateElementPosition, deleteElement } = useSectionStore();
  const { project } = useProjectStore();

  const sectionId = selection.sectionId;
  const phaseId = selection.phaseId;
  const elementId = selection.id;

  const section = useSectionStore(selectSection(sectionId || ''));
  const phase = useSectionStore(selectPhase(sectionId || '', phaseId || ''));
  const element = useSectionStore(selectElement(sectionId || '', phaseId || '', elementId || ''));

  const isIDTimeline = section?.type === 'id-timeline';

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
      if (!sectionId || !phaseId || !elementId) return;
      updateElement(sectionId, phaseId, elementId, { name: e.target.value });
    },
    [sectionId, phaseId, elementId, updateElement]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!sectionId || !phaseId || !elementId) return;
      updateElement(sectionId, phaseId, elementId, { description: e.target.value });
    },
    [sectionId, phaseId, elementId, updateElement]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !elementId || !element) return;
      const newRelativeStart = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedStart = Math.max(0, Math.min(newRelativeStart, element.relativeEnd - 0.01));
      updateElementPosition(sectionId, phaseId, elementId, clampedStart, element.relativeEnd);
    },
    [sectionId, phaseId, elementId, element, phaseStartDate, phaseEndDate, updateElementPosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !elementId || !element) return;
      const newRelativeEnd = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedEnd = Math.min(1, Math.max(newRelativeEnd, element.relativeStart + 0.01));
      updateElementPosition(sectionId, phaseId, elementId, element.relativeStart, clampedEnd);
    },
    [sectionId, phaseId, elementId, element, phaseStartDate, phaseEndDate, updateElementPosition]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !phaseId || !elementId || !element) return;
    if (confirm(`Delete element "${element.name}"?`)) {
      deleteElement(sectionId, phaseId, elementId);
      closeModal();
    }
  }, [sectionId, phaseId, elementId, element, deleteElement, closeModal]);

  if (!element || !phase || !section) {
    return <div className="text-sm text-[#6b7280]">Element not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[#6b7280]">
        Part of <span className="font-medium text-[#111827]">{phase.name}</span>
        {!isIDTimeline && (
          <>
            {' in '}
            <span className="font-medium text-[#111827]">{section.name}</span>
          </>
        )}
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
