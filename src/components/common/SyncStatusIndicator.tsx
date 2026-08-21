import { useSyncStore } from '../../stores/syncStore';

/**
 * Folder sync speaks only when it has something to say.
 *
 * `idle`, `synced` and `disabled` render nothing at all: a dot that is always
 * there and always the same is decoration, not information. That leaves the two
 * states that carry any — a write in flight, and a write that failed — and the
 * failure says so in words, because an error a user has to hover to discover is
 * an error they never find. IndexedDB auto-save keeps no indicator here; it is
 * silent by design.
 */
export function SyncStatusIndicator(): JSX.Element | null {
  const syncStatus = useSyncStore((state) => state.syncStatus);
  const folderName = useSyncStore((state) => state.folderName);
  const errorMessage = useSyncStore((state) => state.errorMessage);

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
      <div
        className="flex items-center gap-1.5 min-w-0 max-w-xs text-meta"
        role="alert"
        title={detail ? `Sync failed · ${detail}` : 'Sync failed'}
      >
        <span
          className="block w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--color-error)]"
          aria-hidden="true"
        />
        <span className="flex-shrink-0 text-[var(--color-error)]">Sync failed</span>
        {detail && (
          <span className="min-w-0 truncate text-[var(--color-text-muted)]">{detail}</span>
        )}
      </div>
    );
  }

  return null;
}
