import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useSyncStore, type SyncStatus } from '../../stores/syncStore';
import { isFileSystemAccessSupported } from '../../utils/fileSystemUtils';

interface StatusConfig {
  dotClass: string;
  label: string;
}

const STATUS_CONFIG: Record<Exclude<SyncStatus, 'disabled'>, StatusConfig> = {
  idle: {
    dotClass: 'bg-[var(--color-text-muted)] opacity-40',
    label: 'Ready to sync',
  },
  syncing: {
    dotClass: 'bg-[var(--color-text-muted)] opacity-40 animate-pulse',
    label: 'Saving...',
  },
  synced: {
    dotClass: 'bg-[var(--color-text-muted)] opacity-40',
    label: 'Saved',
  },
  error: {
    dotClass: 'bg-[var(--color-error)]',
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
      tooltipText += ` • Saved ${relativeTime}`;
    } else if (syncStatus === 'error' && errorMessage) {
      tooltipText += ` • ${errorMessage}`;
    }
  }

  return (
    <div
      className="flex items-center"
      title={tooltipText}
      aria-label={tooltipText}
    >
      <span className={`block w-1.5 h-1.5 rounded-full transition-opacity duration-fast ${config.dotClass}`} />
    </div>
  );
}
