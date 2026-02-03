import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection, selectPhase } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, ColorPicker, ConfirmDeleteButton } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate, parseDate } from '../../utils/dateUtils';

export function PhaseEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updatePhase, updatePhasePosition, deletePhase } = useSectionStore();
  const project = useProjectStore((state) => state.project);

  const sectionId = selection.sectionId;
  const phaseId = selection.id;

  // Use inline selectors - Zustand handles memoization internally based on result equality
  const section = useSectionStore((state) => selectSection(sectionId || '')(state));
  const phase = useSectionStore((state) => selectPhase(sectionId || '', phaseId || '')(state));

  const isMasterSection = section?.id === project?.masterSectionId;

  // Use section dates for calculating phase dates
  const startDate = useMemo(() => {
    if (!phase || !section) return new Date();
    return getDateFromRelativePosition(
      section.startDate,
      section.endDate,
      phase.relativeStart
    );
  }, [phase, section]);

  const endDate = useMemo(() => {
    if (!phase || !section) return new Date();
    return getDateFromRelativePosition(
      section.startDate,
      section.endDate,
      phase.relativeEnd
    );
  }, [phase, section]);

  // Section date boundaries for date picker limits
  const sectionStartDate = section ? parseDate(section.startDate) : new Date();
  const sectionEndDate = section ? parseDate(section.endDate) : new Date();

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
      if (!sectionId || !phaseId || !phase || !section) return;
      const newRelativeStart = getRelativePositionFromDate(
        section.startDate,
        section.endDate,
        date
      );
      // Ensure start doesn't go past end
      if (newRelativeStart < phase.relativeEnd) {
        updatePhasePosition(sectionId, phaseId, newRelativeStart, phase.relativeEnd);
      }
    },
    [sectionId, phaseId, phase, section, updatePhasePosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !phaseId || !phase || !section) return;
      const newRelativeEnd = getRelativePositionFromDate(
        section.startDate,
        section.endDate,
        date
      );
      // Ensure end doesn't go before start
      if (newRelativeEnd > phase.relativeStart) {
        updatePhasePosition(sectionId, phaseId, phase.relativeStart, newRelativeEnd);
      }
    },
    [sectionId, phaseId, phase, section, updatePhasePosition]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !phaseId) return;
    deletePhase(sectionId, phaseId);
    closeModal();
  }, [sectionId, phaseId, deletePhase, closeModal]);

  if (!phase || !section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Phase not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Context label for non-master section phases */}
      {!isMasterSection && (
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

      {/* Color picker only for master section phases (that have individual colors) */}
      {isMasterSection && phase.color && (
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
          min={sectionStartDate}
          max={endDate}
        />
        <DateInput
          label="End Date"
          value={endDate}
          onChange={handleEndDateChange}
          min={startDate}
          max={sectionEndDate}
        />
      </div>

      <div className="pt-4 border-t border-[var(--color-border)]">
        <ConfirmDeleteButton label="Delete Phase" onConfirm={handleDelete} />
      </div>
    </div>
  );
}
