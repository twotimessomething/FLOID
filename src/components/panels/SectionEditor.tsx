import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useSectionStore,
  selectSection,
  typeInto,
  endTypingStep,
} from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore, showSectionDeletedToast } from '../../stores/uiStore';
import { Input, ColorPicker, Button, PinBadge, DateInput } from '../common';
import { useNameDraft } from '../../hooks/useNameDraft';
import { fromDayKey, toDayKey } from '../../utils/dayKeys';
import { commitWithSlide } from '../../commands/slideCommit';
import type { Section, SelectionState } from '../../types';

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
  const liveSection = useSectionStore(sectionSelector);
  const pinnedSectionId = useProjectStore((state) => state.project?.pinnedSectionId);

  // Undoing the schedule this panel is open on closes the panel (uiStore); it
  // leaves showing the schedule. The handlers below act only on the live one.
  const heldRef = useRef<Section | null>(null);
  if (liveSection) heldRef.current = liveSection;
  const section = heldRef.current;

  const isPinned = section?.id === pinnedSectionId;

  // What is typed into one field is one undo step (`typeInto`). Moving to
  // another field starts the next, and so does closing the panel.
  useEffect(() => endTypingStep, []);

  const saveName = useCallback(
    (name: string) => {
      if (!sectionId) return;
      typeInto(`${sectionId}:name`, () => updateSection(sectionId, { name }));
    },
    [sectionId, updateSection]
  );
  const nameField = useNameDraft(section?.name ?? '', saveName);

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

  // The window is declared, not drawn: its end is the day that was typed, and
  // every path that creates a schedule stores it that way. Typed a keystroke at a
  // time, a start can pass beyond the end on its way somewhere sensible — the
  // store would swap the two.
  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !liveSection) return;
      const startDate = toDayKey(date);
      if (startDate > liveSection.endDate) return;
      typeInto(`${sectionId}:start`, () =>
        updateSectionWindow(sectionId, startDate, liveSection.endDate)
      );
    },
    [sectionId, liveSection, updateSectionWindow]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!sectionId || !liveSection) return;
      const endDate = toDayKey(date);
      if (endDate < liveSection.startDate) return;
      typeInto(`${sectionId}:end`, () =>
        updateSectionWindow(sectionId, liveSection.startDate, endDate)
      );
    },
    [sectionId, liveSection, updateSectionWindow]
  );

  // Pinning carries the whole schedule to the top of the sheet (unpinning,
  // back to its place); it travels there, and the schedules it passes make room
  const handleTogglePin = useCallback(() => {
    if (!sectionId) return;
    commitWithSlide(() => setPinnedSection(isPinned ? null : sectionId));
  }, [sectionId, isPinned, setPinnedSection]);

  const handleDelete = useCallback(() => {
    if (!sectionId || !liveSection) return;
    // Held before the delete: the notice names it
    const deleted = liveSection;
    const result = commitWithSlide(() => deleteSection(sectionId));
    if (!result.success && result.reason) {
      showToast('warning', result.reason);
      return;
    }
    showSectionDeletedToast(deleted);
    closeModal();
  }, [sectionId, liveSection, deleteSection, closeModal, showToast]);

  if (!section) {
    return <div className="text-body text-[var(--color-text-secondary)]">Schedule not found</div>;
  }

  return (
    <div className="flex flex-col gap-4" onFocus={endTypingStep}>
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
        label="Name"
        value={nameField.value}
        onChange={nameField.onChange}
        onBlur={nameField.onBlur}
        autoFocus
        spellCheck={false}
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
              label="Start"
              value={fromDayKey(section.startDate)}
              onChange={handleStartDateChange}
              max={fromDayKey(section.endDate)}
            />
          </div>
          <div className="flex-1">
            <DateInput
              label="End"
              value={fromDayKey(section.endDate)}
              onChange={handleEndDateChange}
              min={fromDayKey(section.startDate)}
            />
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          Sets the schedule’s window. Bars hold their own dates, so nothing moves.
        </div>
      </div>

      {/* Pin / Unpin */}
      <div className="pt-2">
        <Button variant="secondary" onClick={handleTogglePin} className="w-full">
          {isPinned ? 'Unpin' : 'Pin to top'}
        </Button>
      </div>

      {/* A quiet action at the foot: the delete raises an Undo of its own */}
      <div className="pt-2">
        <Button variant="danger" onClick={handleDelete} className="-ml-3">
          Delete schedule
        </Button>
      </div>
    </div>
  );
}
