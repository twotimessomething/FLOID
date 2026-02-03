import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { getAppSettings } from '../utils/indexedDB';

export function useBackupReminder(): void {
  const showToast = useUIStore((state) => state.showToast);
  const projects = useProjectStore((state) => state.projects);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);

  useEffect(() => {
    // Wait until storage is ready and we have projects
    if (!isStorageReady || projects.length === 0) return;

    const checkBackup = async () => {
      const settings = await getAppSettings();
      if (!settings.backupReminderEnabled) return;

      const { lastBackupDate, backupReminderDays } = settings;

      if (!lastBackupDate) {
        showToast('warning', 'Consider exporting a backup of your projects.');
        return;
      }

      const daysSinceBackup = Math.floor(
        (Date.now() - new Date(lastBackupDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceBackup >= backupReminderDays) {
        showToast('warning', `It's been ${daysSinceBackup} days since your last backup.`);
      }
    };

    // Delay the check to avoid interrupting the user's workflow
    const timer = setTimeout(checkBackup, 15 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [showToast, projects.length, isStorageReady]);
}
