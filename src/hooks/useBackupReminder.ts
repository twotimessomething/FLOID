import { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { getAppSettings } from '../utils/indexedDB';

/**
 * Nudges the user to export a backup, at a moment they are not working.
 *
 * The check runs when the page goes hidden — stepping away is the one point in
 * a session where nothing is mid-edit — and the message is held until the page
 * is visible again, since a toast raised into a hidden tab expires unseen. It
 * arrives once per session at most; a reminder repeated is an interruption.
 */
export function useBackupReminder(): void {
  const showToast = useUIStore((state) => state.showToast);
  const projects = useProjectStore((state) => state.projects);
  const isStorageReady = useProjectStore((state) => state.isStorageReady);

  const hasRemindedRef = useRef(false);
  const pendingMessageRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait until storage is ready and we have projects
    if (!isStorageReady || projects.length === 0) return;

    const checkBackup = async (): Promise<void> => {
      const settings = await getAppSettings();
      if (!settings.backupReminderEnabled) return;

      const { lastBackupDate, backupReminderDays } = settings;

      if (!lastBackupDate) {
        pendingMessageRef.current = 'Consider exporting a backup of your projects.';
        return;
      }

      const daysSinceBackup = Math.floor(
        (Date.now() - new Date(lastBackupDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceBackup >= backupReminderDays) {
        pendingMessageRef.current = `It's been ${daysSinceBackup} days since your last backup.`;
      }
    };

    const handleVisibilityChange = (): void => {
      if (hasRemindedRef.current) return;

      if (document.visibilityState === 'hidden') {
        void checkBackup();
        return;
      }

      const message = pendingMessageRef.current;
      if (!message) return;

      pendingMessageRef.current = null;
      hasRemindedRef.current = true;
      showToast('warning', message);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showToast, projects.length, isStorageReady]);
}
