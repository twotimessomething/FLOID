export interface AppSettings {
  lastBackupDate: string | null;
  backupReminderDays: number;
  backupReminderEnabled: boolean;
  fileSystemFolderName: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  lastBackupDate: null,
  backupReminderDays: 7,
  backupReminderEnabled: true,
  fileSystemFolderName: null,
};
