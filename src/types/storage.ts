export interface AppSettings {
  lastBackupDate: string | null;
  backupReminderDays: number;
  backupReminderEnabled: boolean;
  fileSystemFolderName: string | null;
  fileSystemAutoSyncEnabled: boolean;
  lastFileSystemSyncDate: string | null;
  /** Desktop autosave folder. The web stores a live handle instead. */
  autoSaveDirectoryPath: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  lastBackupDate: null,
  backupReminderDays: 7,
  backupReminderEnabled: true,
  fileSystemFolderName: null,
  fileSystemAutoSyncEnabled: true,
  lastFileSystemSyncDate: null,
  autoSaveDirectoryPath: null,
};
