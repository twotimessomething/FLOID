import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, ColorPicker, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

interface PhaseEditorProps {
  readonly phaseId: string;
}

export function PhaseEditor({ phaseId }: PhaseEditorProps): JSX.Element {
  const { phases, updatePhase, updatePhasePosition, deletePhase } = useTimelineStore();
  const { project } = useProjectStore();
  const { closeSidebar } = useUIStore();

  const phase = useMemo(
    () => phases.find((p) => p.id === phaseId),
    [phases, phaseId]
  );

  const startDate = useMemo(() => {
    if (!phase) return new Date();
    return getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      phase.relativeStart
    );
  }, [phase, project.startDate, project.endDate]);

  const endDate = useMemo(() => {
    if (!phase) return new Date();
    return getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      phase.relativeEnd
    );
  }, [phase, project.startDate, project.endDate]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updatePhase(phaseId, { name: e.target.value });
    },
    [phaseId, updatePhase]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updatePhase(phaseId, { description: e.target.value });
    },
    [phaseId, updatePhase]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      updatePhase(phaseId, { color });
    },
    [phaseId, updatePhase]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!phase) return;
      const newRelativeStart = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        date
      );
      // Ensure start doesn't go past end
      if (newRelativeStart < phase.relativeEnd) {
        updatePhasePosition(phaseId, newRelativeStart, phase.relativeEnd);
      }
    },
    [phase, phaseId, project.startDate, project.endDate, updatePhasePosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!phase) return;
      const newRelativeEnd = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        date
      );
      // Ensure end doesn't go before start
      if (newRelativeEnd > phase.relativeStart) {
        updatePhasePosition(phaseId, phase.relativeStart, newRelativeEnd);
      }
    },
    [phase, phaseId, project.startDate, project.endDate, updatePhasePosition]
  );

  const handleDelete = useCallback(() => {
    if (confirm(`Delete phase "${phase?.name}"? This will also delete all elements and milestones within it.`)) {
      deletePhase(phaseId);
      closeSidebar();
    }
  }, [phase?.name, phaseId, deletePhase, closeSidebar]);

  if (!phase) {
    return <div className="text-sm text-gray-500">Phase not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Name"
        value={phase.name}
        onChange={handleNameChange}
      />

      <TextArea
        label="Description"
        value={phase.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      <ColorPicker
        label="Color"
        value={phase.color}
        onChange={handleColorChange}
      />

      <div className="grid grid-cols-2 gap-3">
        <DateInput
          label="Start Date"
          value={startDate}
          onChange={handleStartDateChange}
          min={project.startDate}
          max={endDate}
        />
        <DateInput
          label="End Date"
          value={endDate}
          onChange={handleEndDateChange}
          min={startDate}
          max={project.endDate}
        />
      </div>

      <div className="pt-4 border-t border-gray-200">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Phase
        </Button>
      </div>
    </div>
  );
}
