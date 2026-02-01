import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection, selectPhase } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, ColorPicker, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

export function PhaseEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updatePhase, updatePhasePosition, deletePhase } = useSectionStore();
  const { project } = useProjectStore();

  const sectionId = selection.sectionId;
  const phaseId = selection.id;

  // Memoize selectors to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const phaseSelector = useMemo(() => selectPhase(sectionId || '', phaseId || ''), [sectionId, phaseId]);

  const section = useSectionStore(sectionSelector);
  const phase = useSectionStore(phaseSelector);

  const isIDTimeline = section?.type === 'id-timeline';

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
      if (!sectionId || !phaseId) return;
      updatePhase(sectionId, phaseId, { name: e.target.value });
    },
    [sectionId, phaseId, updatePhase]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!sectionId || !phaseId) return;
      updatePhase(sectionId, phaseId, { description: e.target.value });
    },
    [sectionId, phaseId, updatePhase]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!sectionId || !phaseId) return;
      updatePhase(sectionId, phaseId, { color });
    },
    [sectionId, phaseId, updatePhase]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !phase) return;
      const newRelativeStart = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        date
      );
      // Ensure start doesn't go past end
      if (newRelativeStart < phase.relativeEnd) {
        updatePhasePosition(sectionId, phaseId, newRelativeStart, phase.relativeEnd);
      }
    },
    [sectionId, phaseId, phase, project.startDate, project.endDate, updatePhasePosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !phase) return;
      const newRelativeEnd = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        date
      );
      // Ensure end doesn't go before start
      if (newRelativeEnd > phase.relativeStart) {
        updatePhasePosition(sectionId, phaseId, phase.relativeStart, newRelativeEnd);
      }
    },
    [sectionId, phaseId, phase, project.startDate, project.endDate, updatePhasePosition]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !phaseId || !phase) return;
    if (confirm(`Delete phase "${phase.name}"? This will also delete all elements within it.`)) {
      deletePhase(sectionId, phaseId);
      closeModal();
    }
  }, [sectionId, phaseId, phase, deletePhase, closeModal]);

  if (!phase || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Phase not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Context label for team phases */}
      {!isIDTimeline && (
        <div className="text-xs text-[var(--color-text-secondary)]">
          Part of <span className="font-medium text-[var(--color-text-primary)]">{section.name}</span>
        </div>
      )}

      <Input
        label="Name"
        value={phase.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Phase name"
      />

      <TextArea
        label="Description"
        value={phase.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      {/* Color picker only for ID timeline phases */}
      {isIDTimeline && phase.color && (
        <ColorPicker
          label="Color"
          value={phase.color}
          onChange={handleColorChange}
        />
      )}

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

      <div className="pt-4 border-t border-[var(--color-border)]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Phase
        </Button>
      </div>
    </div>
  );
}
