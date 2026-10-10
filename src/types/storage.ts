export interface AppSettings {
  lastBackupDate: string | null;
  backupReminderDays: number;
  backupReminderEnabled: boolean;
  fileSystemFolderName: string | null;
  fileSystemAutoSyncEnabled: boolean;
  lastFileSystemSyncDate: string | null;
  /** Desktop autosave folder. The web stores a live handle instead. */
  autoSaveDirectoryPath: string | null;
  /**
   * The release the reader has been caught up to, or `null` on a device that
   * has never dismissed the what's-new panel. See `data/releaseNotes.ts`.
   */
  lastSeenReleaseVersion: string | null;
  /** Mac app launches, counted toward the review ask. See `platform/review.desktop.ts`. */
  desktopSessionCount: number;
  /** The app version the review sheet was last requested for. */
  reviewRequestedVersion: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  lastBackupDate: null,
  backupReminderDays: 7,
  backupReminderEnabled: true,
  fileSystemFolderName: null,
  fileSystemAutoSyncEnabled: true,
  lastFileSystemSyncDate: null,
  autoSaveDirectoryPath: null,
  lastSeenReleaseVersion: null,
  desktopSessionCount: 0,
  reviewRequestedVersion: null,
};
