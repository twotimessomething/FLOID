import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, ColorPicker, Button, MasterBadge, DateInput } from '../common';
import { isDateSynced, formatDate } from '../../utils/dateUtils';

export function SectionEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updateSection, updateSectionDates, deleteSection, setAsMaster, setBindingMode } = useSectionStore();

  const sectionId = selection.sectionId;

  // Memoize selector to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const section = useSectionStore(sectionSelector);
  const project = useProjectStore((state) => state.project);

  const isMasterSection = section?.id === project?.masterSectionId;
  const isSyncedWithMaster = section && project ? isDateSynced(section, project) : false;

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
    if (!sectionId || !section) return;
    if (confirm(`Delete "${section.name}"? This will also delete all phases and elements within it.`)) {
      deleteSection(sectionId);
      closeModal();
    }
  }, [sectionId, section, deleteSection, closeModal]);

  const handleSetAsMaster = useCallback(() => {
    if (!sectionId || !section) return;
    const confirmed = confirm(
      `Pin "${section.name}" as master schedule?\n\nThis will update the project dates to match this schedule's date range.`
    );
    if (confirmed) {
      setAsMaster(sectionId);
    }
  }, [sectionId, section, setAsMaster]);

  const handleBindingModeChange = useCallback(
    (mode: 'locked' | 'independent') => {
      if (!sectionId) return;

      if (mode === 'locked') {
        const confirmed = confirm(
          'Lock this schedule to the master?\n\nThe schedule dates will sync to the master timeline. Phase positions will be preserved.'
        );
        if (!confirmed) return;
      }

      setBindingMode(sectionId, mode);
    },
    [sectionId, setBindingMode]
  );

  if (!section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Schedule not found</div>;
  }

  // Master section view
  if (isMasterSection) {
    // Count how many locked sections will be affected by date changes
    const sections = useSectionStore.getState().sections;
    const lockedSectionsCount = sections.filter(
      (s) => s.id !== section.id && s.bindingMode === 'locked'
    ).length;

    return (
      <div className="flex flex-col gap-4">
        {/* Master status indicator */}
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <MasterBadge size="md" />
          <span className="text-sm text-amber-800">
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
          {lockedSectionsCount > 0 && (
            <p className="text-xs text-amber-700">
              Changing dates will sync {lockedSectionsCount} locked schedule{lockedSectionsCount !== 1 ? 's' : ''}
            </p>
          )}
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

      {/* Binding mode toggle */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--color-text-primary)]">
          Date Binding
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => handleBindingModeChange('independent')}
            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
              section.bindingMode === 'independent'
                ? 'bg-[var(--color-text-primary)] text-white border-[var(--color-text-primary)]'
                : 'bg-[var(--color-background)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
            }`}
          >
            Independent
          </button>
          <button
            onClick={() => handleBindingModeChange('locked')}
            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
              section.bindingMode === 'locked'
                ? 'bg-[var(--color-text-primary)] text-white border-[var(--color-text-primary)]'
                : 'bg-[var(--color-background)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
            }`}
          >
            Locked to Master
          </button>
        </div>
      </div>

      {/* Date inputs - different display based on binding mode */}
      {section.bindingMode === 'locked' ? (
        <div className="flex flex-col gap-2 p-3 bg-[var(--color-locked-bg)] border border-[var(--color-locked-border)] rounded-lg">
          <div className="flex items-center gap-2 text-sm text-[var(--color-locked-text)]">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span className="font-medium">Synced with Master</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatDate(section.startDate, 'MMM d, yyyy')} — {formatDate(section.endDate, 'MMM d, yyyy')}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Dates automatically sync when the master schedule changes
          </p>
        </div>
      ) : (
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
          {!isSyncedWithMaster && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Dates differ from the master schedule
            </p>
          )}
        </div>
      )}

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
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Schedule
        </Button>
      </div>
    </div>
  );
}
