import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore, showSectionDeletedToast } from '../../stores/uiStore';
import { Input, ColorPicker, Button, PinBadge, DateInput } from '../common';
import { fromDayKey, toDayKey } from '../../utils/dayKeys';
import type { SelectionState } from '../../types';

interface SectionEditorProps {
  /** See `ItemEditor` — the modal supplies this so the exit is not blank. */
  readonly selection?: SelectionState;
}

export function SectionEditor({ selection: given }: SectionEditorProps = {}): JSX.Element {
  const { selection: live, closeModal, showToast } = useUIStore();
  const selection = given ?? live;
  const { updateSection, updateSectionWindow, setSectionMulticolor, deleteSection } = useSectionStore();
  const setPinnedSection = useProjectStore((state) => state.setPinnedSection);

  const sectionId = selection.sectionId;

  // Memoize selector to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId), [sectionId]);
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
      updateSectionWindow(sectionId, toDayKey(date), section.endDate);
    },
    [sectionId, section, updateSectionWindow]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !section) return;
      updateSectionWindow(sectionId, section.startDate, toDayKey(date));
    },
    [sectionId, section, updateSectionWindow]
  );

  const handleTogglePin = useCallback(() => {
    if (!sectionId) return;
    setPinnedSection(isPinned ? null : sectionId);
  }, [sectionId, isPinned, setPinnedSection]);

  const handleDelete = useCallback(() => {
    if (!sectionId || !section) return;
    // Held before the delete: the notice names it, and undo re-pins it
    const deleted = section;
    const wasPinned = isPinned;
    const result = deleteSection(sectionId);
    if (!result.success && result.reason) {
      showToast('warning', result.reason);
      return;
    }
    showSectionDeletedToast(deleted, wasPinned);
    closeModal();
  }, [sectionId, section, isPinned, deleteSection, closeModal, showToast]);

  if (!section) {
    return <div className="text-body text-[var(--color-text-secondary)]">Schedule not found</div>;
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
              value={fromDayKey(section.startDate)}
              onChange={handleStartDateChange}
              max={fromDayKey(section.endDate)}
            />
          </div>
          <div className="flex-1">
            <DateInput
              label="End Date"
              value={fromDayKey(section.endDate)}
              onChange={handleEndDateChange}
              min={fromDayKey(section.startDate)}
            />
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Sets the schedule's window. Bars hold their own dates, so nothing moves.
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
