import { useCallback, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { Toggle } from '../common/Toggle';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';

interface SettingRowProps {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

function SettingRow({ id, label, description, checked, onChange }: SettingRowProps): JSX.Element {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1 pr-4">
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-text-primary)] cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{description}</p>
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

export function SettingsModal(): JSX.Element | null {
  const { isSettingsModalOpen, closeSettingsModal } = useUIStore();
  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);
  const updateSettings = useProjectStore((state) => state.updateSettings);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeSettingsModal();
      }
    },
    [closeSettingsModal]
  );

  const handleSkipWeekendsChange = useCallback(
    (checked: boolean) => {
      updateSettings({ skipWeekends: checked });
    },
    [updateSettings]
  );

  const handleMilestoneSnapChange = useCallback(
    (checked: boolean) => {
      updateSettings({ milestoneSnap: checked });
    },
    [updateSettings]
  );

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeSettingsModal();
      }
    };

    if (isSettingsModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isSettingsModalOpen, closeSettingsModal]);

  if (!isSettingsModalOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-sm mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/20">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]" id="settings-title">
            Settings
          </h2>
          <button
            onClick={closeSettingsModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 rounded-md hover:bg-black/5 focus-ring btn-press"
            aria-label="Close (Escape)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-2 divide-y divide-[var(--color-border)]">
          <SettingRow
            id="skip-weekends"
            label="Skip weekends"
            description="Snap drag endpoints to the next business day"
            checked={settings.skipWeekends}
            onChange={handleSkipWeekendsChange}
          />
          <SettingRow
            id="milestone-snap"
            label="Milestone snap"
            description="Snap milestones to nearby phase boundaries"
            checked={settings.milestoneSnap}
            onChange={handleMilestoneSnapChange}
          />
        </div>
      </div>
    </div>
  );
}
