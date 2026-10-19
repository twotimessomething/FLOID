import { useSyncStore } from '../../stores/syncStore';
import { useIsSaveFailing } from '../../hooks/useAutoSave';
import { StatusError } from './StatusError';

/**
 * Saving speaks only when it has something to say.
 *
 * `idle`, `synced` and `disabled` render nothing at all: a dot that is always
 * there and always the same is decoration, not information. That leaves the
 * states that carry any — a folder write in flight, and a write that failed —
 * and a failure says so in words, because an error a user has to hover to
 * discover is an error they never find. IndexedDB auto-save is silent while it
 * works; when it stops working that outranks anything the folder has to say,
 * since the folder is only ever a copy of what IndexedDB holds.
 */
export function SyncStatusIndicator(): JSX.Element | null {
  const syncStatus = useSyncStore((state) => state.syncStatus);
  const folderName = useSyncStore((state) => state.folderName);
  const errorMessage = useSyncStore((state) => state.errorMessage);
  const isSaveFailing = useIsSaveFailing();

  if (isSaveFailing) {
    return (
      <StatusError
        label="Not saved"
        title="Couldn’t save your changes. Export a backup to keep them safe."
      />
    );
  }

  if (syncStatus === 'syncing') {
    const label = folderName ? `Saving to ${folderName}` : 'Saving';
    return (
      <div className="flex items-center" role="status" aria-label={label} title={label}>
        <span
          className="block w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] opacity-40 animate-pulse"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (syncStatus === 'error') {
    // The store's messages are short ('Permission lost', 'Folder not found'),
    // so the folder can ride along beside one without crowding the header.
    const detail = [errorMessage, folderName].filter(Boolean).join(' · ');

    return (
      <StatusError
        label="Sync failed"
        title={detail ? `Sync failed · ${detail}` : 'Sync failed'}
        detail={detail}
      />
    );
  }

  return null;
}
