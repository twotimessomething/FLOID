import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, ColorPicker, Button, PinBadge, DateInput } from '../common';

export function SectionEditor(): JSX.Element {
  const { selection, closeModal, showToast } = useUIStore();
  const { updateSection, updateSectionDates, setSectionMulticolor, deleteSection } = useSectionStore();
  const setPinnedSection = useProjectStore((state) => state.setPinnedSection);

  const sectionId = selection.sectionId;

  // Memoize selector to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const section = useSectionStore(sectionSelector);
  const pinnedSectionId = useProjectStore((state) => state.project?.pinnedSectionId);

  const isPinned = section?.id === pinnedSectionId;

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId) return;
      updateSection(sectionId, { name: e.target.value });
    },
    [sectionId, updateSection]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!sectionId) return;
      const current = useSectionStore.getState().sections.find((s) => s.id === sectionId);
      if (current?.isMulticolor) {
        setSectionMulticolor(sectionId, false);
      }
      updateSection(sectionId, { color });
    },
    [sectionId, updateSection, setSectionMulticolor]
  );

  const handleSelectMulticolor = useCallback(() => {
    if (!sectionId) return;
    setSectionMulticolor(sectionId, true);
  }, [sectionId, setSectionMulticolor]);

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !section) return;
      updateSectionDates(sectionId, date.toISOString(), section.endDate);
    },
    [sectionId, section, updateSectionDates]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !section) return;
      updateSectionDates(sectionId, section.startDate, date.toISOString());
    },
    [sectionId, section, updateSectionDates]
  );

  const handleTogglePin = useCallback(() => {
    if (!sectionId) return;
    setPinnedSection(isPinned ? null : sectionId);
  }, [sectionId, isPinned, setPinnedSection]);

  const handleDelete = useCallback(() => {
    if (!sectionId) return;
    const result = deleteSection(sectionId);
    if (!result.success && result.reason) {
      showToast('warning', result.reason);
      return;
    }
    closeModal();
  }, [sectionId, deleteSection, closeModal, showToast]);

  if (!section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Schedule not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pinned status indicator */}
      {isPinned && (
        <div className="flex items-center gap-2 py-1">
          <PinBadge size="md" />
          <span className="text-xs text-[var(--color-text-secondary)]">
            Pinned to top — its milestone lines extend through all schedules
          </span>
        </div>
      )}

      <Input
        label="Schedule Name"
        value={section.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Schedule name"
      />

      <ColorPicker
        label="Color"
        value={section.color}
        onChange={handleColorChange}
        allowMulticolor
        isMulticolor={section.isMulticolor ?? false}
        onSelectMulticolor={handleSelectMulticolor}
      />

      {/* Date inputs */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <DateInput
              label="Start Date"
              value={section.startDate}
              onChange={handleStartDateChange}
              max={section.endDate}
            />
          </div>
          <div className="flex-1">
            <DateInput
              label="End Date"
              value={section.endDate}
              onChange={handleEndDateChange}
              min={section.startDate}
            />
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Changing dates adds or trims empty space — phases and milestones keep their dates.
        </div>
      </div>

      {/* Pin / Unpin */}
      <div className="pt-2">
        <Button variant="secondary" onClick={handleTogglePin} className="w-full">
          {isPinned ? 'Unpin' : 'Pin to Top'}
        </Button>
      </div>

      {/* Delete section */}
      <div className="pt-2">
        <Button variant="danger" onClick={handleDelete} className="w-full">Delete Schedule</Button>
      </div>
    </div>
  );
}
