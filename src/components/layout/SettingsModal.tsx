import { useCallback, useEffect, useState, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { useUIStore, type ThemeMode } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSyncStore } from '../../stores/syncStore';
import { Toggle } from '../common/Toggle';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import type { AppSettings } from '../../types/storage';
import { DEFAULT_APP_SETTINGS } from '../../types/storage';
import { getAppSettings, setAppSettings, setFileHandle } from '../../utils/indexedDB';
import { isFileSystemAccessSupported, requestDirectoryAccess } from '../../utils/fileSystemUtils';
import { usePresence } from '../../hooks/usePresence';

// Theme option type
interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: JSX.Element;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    ),
  },
];

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
        <label htmlFor={id} className="text-body font-medium text-[var(--color-text-primary)] cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{description}</p>
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

export function SettingsModal(): JSX.Element | null {
  const { isSettingsModalOpen, closeSettingsModal, theme, setTheme } = useUIStore();
  const selectDependency = useUIStore((state) => state.selectDependency);
  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);
  const updateSettings = useProjectStore((state) => state.updateSettings);

  // Sync store
  const syncStatus = useSyncStore((state) => state.syncStatus);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const setFolderName = useSyncStore((state) => state.setFolderName);
  const setDisabled = useSyncStore((state) => state.setDisabled);

  // App settings state
  const [appSettings, setLocalAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  // Load app settings when modal opens
  useEffect(() => {
    if (isSettingsModalOpen) {
      getAppSettings().then(setLocalAppSettings);
    }
  }, [isSettingsModalOpen]);

  // Relative time for last sync
  const lastSyncRelativeTime = useMemo(() => {
    if (!lastSyncedAt) return null;
    try {
      return formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true });
    } catch {
      return null;
    }
  }, [lastSyncedAt]);

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

  const handleColoredRowsChange = useCallback(
    (checked: boolean) => {
      updateSettings({ coloredRows: checked });
    },
    [updateSettings]
  );

  // Hiding the ink leaves the edges in the store; a link selected while they
  // were showing must not stay selected under a Delete keypress.
  const handleShowDependenciesChange = useCallback(
    (checked: boolean) => {
      updateSettings({ showDependencies: checked });
      if (!checked) selectDependency(null);
    },
    [updateSettings, selectDependency]
  );

  const handleBackupReminderToggle = useCallback(async (enabled: boolean) => {
    await setAppSettings({ backupReminderEnabled: enabled });
    setLocalAppSettings((s) => ({ ...s, backupReminderEnabled: enabled }));
  }, []);

  const handleBackupDaysChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const days = Number(e.target.value);
    await setAppSettings({ backupReminderDays: days });
    setLocalAppSettings((s) => ({ ...s, backupReminderDays: days }));
  }, []);

  const handleSelectFolder = useCallback(async () => {
    const handle = await requestDirectoryAccess();
    if (handle) {
      await setFileHandle(handle);
      await setAppSettings({ fileSystemFolderName: handle.name });
      setLocalAppSettings((s) => ({ ...s, fileSystemFolderName: handle.name }));
      setFolderName(handle.name);
    }
  }, [setFolderName]);

  const handleDisableFs = useCallback(async () => {
    await setFileHandle(null);
    await setAppSettings({ fileSystemFolderName: null, lastFileSystemSyncDate: null });
    setLocalAppSettings((s) => ({ ...s, fileSystemFolderName: null, lastFileSystemSyncDate: null }));
    setDisabled();
  }, [setDisabled]);

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

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isSettingsModalOpen);
  if (!isMounted) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-sm mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-title font-medium text-[var(--color-text-primary)]" id="settings-title">
            Settings
          </h2>
          <button
            onClick={closeSettingsModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
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
        <div className="px-5 py-2 flex flex-col gap-1">
          {/* Appearance section */}
          <div className="py-3">
            <label className="text-body font-medium text-[var(--color-text-primary)]">
              Appearance
            </label>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 mb-3">
              Choose your preferred color theme
            </p>
            <div className="flex gap-1 p-1 bg-[var(--color-background)] rounded-[var(--radius-md)]">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  aria-pressed={theme === option.value}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] btn-press focus-ring ${
                    theme === option.value
                      ? 'bg-[var(--color-raised)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <SettingRow
            id="skip-weekends"
            label="Skip weekends"
            description="Snap drag endpoints to the next business day"
            checked={settings.skipWeekends}
            onChange={handleSkipWeekendsChange}
          />
          <SettingRow
            id="colored-rows"
            label="Colored rows"
            description="Tint schedule rows with their assigned color"
            checked={settings.coloredRows}
            onChange={handleColoredRowsChange}
          />
          <SettingRow
            id="show-dependencies"
            label="Dependencies"
            description="Toggle visibility of dependency lines"
            checked={settings.showDependencies ?? DEFAULT_PROJECT_SETTINGS.showDependencies}
            onChange={handleShowDependenciesChange}
          />

          {/* Backup reminders section */}
          <SettingRow
            id="backup-reminder"
            label="Backup reminders"
            description="Get reminded to export backups periodically"
            checked={appSettings.backupReminderEnabled}
            onChange={handleBackupReminderToggle}
          />

          {appSettings.backupReminderEnabled && (
            <div className="py-3 flex items-center justify-between">
              <span className="text-body text-[var(--color-text-primary)]">Remind every</span>
              <select
                value={appSettings.backupReminderDays}
                onChange={handleBackupDaysChange}
                className="text-body bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 focus-ring"
              >
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
          )}

          {/* Why the reminder exists at all — said once, quietly. */}
          <div className="py-3">
            <p className="text-meta text-[var(--color-text-muted)]">
              FLOID keeps everything in this browser. Clearing site data deletes it.
            </p>
            {appSettings.lastBackupDate && (
              <p className="text-meta text-[var(--color-text-muted)] mt-1">
                Last backup: {format(new Date(appSettings.lastBackupDate), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          {/* File System Access API section (Chrome/Edge only) */}
          {isFileSystemAccessSupported() && (
            <div className="py-3">
              <label className="text-body font-medium text-[var(--color-text-primary)]">
                Auto-save to folder
              </label>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 mb-3">
                Save project files to a folder on your computer
              </p>
              {appSettings.fileSystemFolderName ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <span className="text-body text-[var(--color-text-primary)] font-medium">
                      {appSettings.fileSystemFolderName}
                    </span>
                    {syncStatus === 'syncing' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--color-focus)]/10 text-[var(--color-focus)]">
                        Saving...
                      </span>
                    )}
                    {syncStatus === 'synced' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--color-success)]/10 text-[var(--color-success)]">
                        Saved
                      </span>
                    )}
                    {syncStatus === 'error' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--color-error)]/10 text-[var(--color-error)]">
                        Error
                      </span>
                    )}
                  </div>
                  {lastSyncRelativeTime && syncStatus !== 'error' && (
                    <p className="text-xs text-[var(--color-text-muted)] ml-6">
                      Last saved {lastSyncRelativeTime}
                    </p>
                  )}
                  <div className="flex gap-3 ml-6">
                    <button
                      onClick={handleSelectFolder}
                      className="text-xs text-[var(--color-focus)] hover:underline"
                    >
                      Change folder
                    </button>
                    <button
                      onClick={handleDisableFs}
                      className="text-xs text-[var(--color-error)] hover:underline"
                    >
                      Disable
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSelectFolder}
                  className="text-body text-[var(--color-focus)] hover:underline"
                >
                  Choose folder...
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
