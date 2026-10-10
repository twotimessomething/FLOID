import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { getAppSettings, setAppSettings } from '../utils/indexedDB';

/**
 * The automatic review ask. Apple allows exactly one shape for it — the
 * system's own sheet, through StoreKit — and macOS then decides whether it
 * appears at all (three times a year at most). So the app's job is only to
 * pick a moment that is not rude.
 *
 * Someone has to have come back: the fifth launch, not the first. They have to
 * have settled in: a minute and a half into the session, never on launch. And
 * they must not be in the middle of anything — no modal, no editor, no button
 * held down. Each version asks once; a "not now" is not asked again until
 * there is something new to rate.
 */

const SESSIONS_BEFORE_ASKING = 5;
const SETTLE_MS = 90_000;
const IDLE_RECHECK_MS = 5_000;

let pointersDown = 0;

function isBusy(): boolean {
  const ui = useUIStore.getState();
  return (
    pointersDown > 0 ||
    ui.isDragging ||
    ui.isModalOpen ||
    ui.isProjectSetupModalOpen ||
    ui.isAddScheduleModalOpen ||
    ui.isSettingsModalOpen ||
    ui.isExportModalOpen ||
    ui.isKeyboardHelpModalOpen ||
    ui.isAboutModalOpen ||
    ui.isDraggingFile ||
    document.querySelector('[role="dialog"], [role="menu"]') !== null
  );
}

function askWhenIdle(version: string): void {
  if (isBusy()) {
    window.setTimeout(() => askWhenIdle(version), IDLE_RECHECK_MS);
    return;
  }
  void setAppSettings({ reviewRequestedVersion: version });
  void invoke('request_review').catch((error) => {
    console.error('Failed to request a review:', error);
  });
}

export async function countSessionForReview(): Promise<void> {
  const settings = await getAppSettings();
  const sessionCount = settings.desktopSessionCount + 1;
  await setAppSettings({ desktopSessionCount: sessionCount });
  if (sessionCount < SESSIONS_BEFORE_ASKING) return;

  const version = await getVersion();
  if (settings.reviewRequestedVersion === version) return;
  // Someone with nothing on the sheet has not used it yet, whatever the count
  if (useProjectStore.getState().projects.length === 0) return;

  window.addEventListener('pointerdown', () => pointersDown++, true);
  window.addEventListener('pointerup', () => (pointersDown = Math.max(0, pointersDown - 1)), true);
  window.addEventListener('pointercancel', () => (pointersDown = Math.max(0, pointersDown - 1)), true);
  window.setTimeout(() => askWhenIdle(version), SETTLE_MS);
}

/** The manual road: the App Store's write-a-review page, on request. */
export async function openWriteReview(): Promise<void> {
  await invoke('open_write_review');
}
