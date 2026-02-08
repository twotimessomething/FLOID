import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useConfirm } from '../../hooks';
import { Input, ColorPicker, Button, MasterBadge, DateInput, ConfirmDeleteButton } from '../common';

export function SectionEditor(): JSX.Element {
  const confirm = useConfirm();
  const { selection, closeModal, showToast } = useUIStore();
  const { updateSection, updateSectionDates, deleteSection, setAsMaster } = useSectionStore();

  const sectionId = selection.sectionId;

  // Memoize selector to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const section = useSectionStore(sectionSelector);
  const project = useProjectStore((state) => state.project);

  const isMasterSection = section?.id === project?.masterSectionId;

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
      updateSection(sectionId, { color });
    },
    [sectionId, updateSection]
  );

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

  const handleDelete = useCallback(() => {
    if (!sectionId) return;
    const result = deleteSection(sectionId);
    if (!result.success && result.reason) {
      showToast('warning', result.reason);
      return;
    }
    closeModal();
  }, [sectionId, deleteSection, closeModal, showToast]);

  const handleSetAsMaster = useCallback(async () => {
    if (!sectionId || !section) return;
    const confirmed = await confirm({
      title: 'Pin as Master Schedule',
      message: `Pin "${section.name}" as master schedule?\n\nThis will update the project dates to match this schedule's date range.`,
      confirmLabel: 'Pin as Master',
      variant: 'warning',
    });
    if (confirmed) {
      setAsMaster(sectionId);
    }
  }, [sectionId, section, setAsMaster, confirm]);

  if (!section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Schedule not found</div>;
  }

  // Master section view
  if (isMasterSection) {
    return (
      <div className="flex flex-col gap-4">
        {/* Master status indicator */}
        <div className="flex items-center gap-2 p-3 bg-[var(--color-warning-bg)] border border-[var(--color-warning)] rounded-lg">
          <MasterBadge size="md" />
          <span className="text-sm text-[var(--color-warning)]">
            This schedule drives the project timeline
          </span>
        </div>

        <Input
          label="Schedule Name"
          value={section.name}
          onChange={handleNameChange}
          autoFocus
          placeholder="Schedule name"
        />

        {/* Master date editing */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Project Date Range
          </label>
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
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          To change the master, right-click another schedule and select "Pin as Master Schedule".
        </div>
      </div>
    );
  }

  // Non-master section view
  return (
    <div className="flex flex-col gap-4">
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
      </div>

      {/* Pin as Master button */}
      <div className="pt-2">
        <Button
          variant="secondary"
          onClick={handleSetAsMaster}
          className="w-full"
        >
          Pin as Master Schedule
        </Button>
      </div>

      {/* Delete section */}
      <div className="pt-4 border-t border-[var(--color-border)]">
        <ConfirmDeleteButton label="Delete Schedule" onConfirm={handleDelete} />
      </div>
    </div>
  );
}
