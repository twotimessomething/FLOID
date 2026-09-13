import { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { getAppSettings, setAppSettings } from '../utils/indexedDB';
import { LATEST_RELEASE_VERSION, RELEASE_NOTES, unseenReleases } from '../data/releaseNotes';

/**
 * Raises the what's-new panel once, for someone who was already using FLOID.
 *
 * Two rules keep it from being an interruption. It runs once per device, not
 * per session: dismissing stamps the release into app settings and the panel
 * does not come back until something new ships. And a device that has never
 * held a project is a new install, not an upgrade — it is stamped silently and
 * shown nothing, so the first thing a new reader meets is the walkthrough, not
 * a changelog for an app they have not used yet.
 *
 * The decision is made on the first tick where storage is ready and settled,
 * and the ref holds it: a project created a moment later must not turn this
 * session's new install into an upgrade.
 */
export function useWhatsNew(): void {
  const isStorageReady = useProjectStore((state) => state.isStorageReady);
  const openWhatsNew = useUIStore((state) => state.openWhatsNew);

  const hasDecidedRef = useRef(false);

  useEffect(() => {
    if (!isStorageReady || hasDecidedRef.current) return;
    if (LATEST_RELEASE_VERSION === null) return;
    hasDecidedRef.current = true;

    const isNewInstall = useProjectStore.getState().projects.length === 0;

    void (async () => {
      const { lastSeenReleaseVersion } = await getAppSettings();
      if (lastSeenReleaseVersion === LATEST_RELEASE_VERSION) return;

      if (isNewInstall) {
        await setAppSettings({ lastSeenReleaseVersion: LATEST_RELEASE_VERSION });
        return;
      }

      const releases = unseenReleases(lastSeenReleaseVersion);
      if (releases.length === 0) return;
      openWhatsNew(releases);
    })();
  }, [isStorageReady, openWhatsNew]);
}

/**
 * Opening the panel by hand, from the menu or the About panel.
 *
 * Asked for rather than raised, so it shows the newest entry whether or not it
 * has been read — an empty panel would be a worse answer than a familiar one.
 */
export function openWhatsNewOnDemand(): void {
  const releases = RELEASE_NOTES.slice(0, 1);
  if (releases.length === 0) return;
  useUIStore.getState().openWhatsNew(releases);
}

/** Marks the reader caught up. Called on dismissal, never on open. */
export async function markReleasesSeen(): Promise<void> {
  if (LATEST_RELEASE_VERSION === null) return;
  await setAppSettings({ lastSeenReleaseVersion: LATEST_RELEASE_VERSION });
}
