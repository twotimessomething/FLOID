import { isDesktop } from './detect';
import { LATEST_RELEASE_VERSION } from '../data/releaseNotes';

/**
 * The version to print in About.
 *
 * The Mac app asks its own bundle, which is exact. The web has no bundle to
 * ask — `import.meta.env` stays unused, so both targets ship the same bytes —
 * and says the newest release the notes describe, the number What’s new shows.
 * The desktop half loads through a dynamic `import()`, so the web never
 * fetches `@tauri-apps`.
 *
 * A version is a courtesy: one that cannot be read is null, not an error.
 */
export async function appVersion(): Promise<string | null> {
  if (!isDesktop()) return LATEST_RELEASE_VERSION;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return null;
  }
}
