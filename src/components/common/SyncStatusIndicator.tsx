import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useSyncStore, type SyncStatus } from '../../stores/syncStore';
import { isFileSystemAccessSupported } from '../../utils/fileSystemUtils';

function CloudIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
      />
    </svg>
  );
}

function SpinnerIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ErrorIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );
}

interface StatusConfig {
  icon: JSX.Element;
  colorClass: string;
  label: string;
}

const STATUS_CONFIG: Record<Exclude<SyncStatus, 'disabled'>, StatusConfig> = {
  idle: {
    icon: <CloudIcon />,
    colorClass: 'text-[var(--color-text-muted)]',
    label: 'Ready to sync',
  },
  syncing: {
    icon: <SpinnerIcon />,
    colorClass: 'text-[var(--color-focus)]',
    label: 'Saving...',
  },
  synced: {
    icon: <CheckIcon />,
    colorClass: 'text-[var(--color-success)]',
    label: 'Saved',
  },
  error: {
    icon: <ErrorIcon />,
    colorClass: 'text-[var(--color-error)]',
    label: 'Sync failed',
  },
};

export function SyncStatusIndicator(): JSX.Element | null {
  const syncStatus = useSyncStore((state) => state.syncStatus);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const folderName = useSyncStore((state) => state.folderName);
  const errorMessage = useSyncStore((state) => state.errorMessage);

  const relativeTime = useMemo(() => {
    if (!lastSyncedAt) return null;
    try {
      return formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true });
    } catch {
      return null;
    }
  }, [lastSyncedAt]);

  // Don't show if File System API is not supported or sync is disabled
  if (!isFileSystemAccessSupported() || syncStatus === 'disabled') {
    return null;
  }

  const config = STATUS_CONFIG[syncStatus];

  // Build tooltip text
  let tooltipText = config.label;
  if (folderName) {
    tooltipText = `${folderName}`;
    if (syncStatus === 'synced' && relativeTime) {
      tooltipText += ` \u2022 Saved ${relativeTime}`;
    } else if (syncStatus === 'error' && errorMessage) {
      tooltipText += ` \u2022 ${errorMessage}`;
    }
  }

  return (
    <div
      className={`flex items-center gap-1 ${config.colorClass}`}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {config.icon}
    </div>
  );
}
