import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'disabled';

interface SyncState {
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  folderName: string | null;

  setSyncing: () => void;
  setSynced: (folderName: string) => void;
  setError: (message: string) => void;
  setDisabled: () => void;
  setIdle: () => void;
  setFolderName: (name: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncStatus: 'disabled',
  lastSyncedAt: null,
  errorMessage: null,
  folderName: null,

  setSyncing: () =>
    set({
      syncStatus: 'syncing',
      errorMessage: null,
    }),

  setSynced: (folderName) =>
    set({
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString(),
      errorMessage: null,
      folderName,
    }),

  setError: (message) =>
    set({
      syncStatus: 'error',
      errorMessage: message,
    }),

  setDisabled: () =>
    set({
      syncStatus: 'disabled',
      lastSyncedAt: null,
      errorMessage: null,
      folderName: null,
    }),

  setIdle: () =>
    set({
      syncStatus: 'idle',
      errorMessage: null,
    }),

  setFolderName: (name) =>
    set({
      folderName: name,
      syncStatus: name ? 'idle' : 'disabled',
    }),
}));
