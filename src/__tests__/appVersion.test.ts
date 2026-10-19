import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVersion } from '@tauri-apps/api/app';
import { appVersion } from '../platform/version';
import { LATEST_RELEASE_VERSION } from '../data/releaseNotes';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }));

const setDesktop = (isDesktop: boolean): void => {
  if (isDesktop) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
};

afterEach(() => setDesktop(false));

describe('appVersion', () => {
  it('says the newest release on the web, without asking Tauri', async () => {
    expect(await appVersion()).toBe(LATEST_RELEASE_VERSION);
    expect(getVersion).not.toHaveBeenCalled();
  });

  it('asks the bundle in the Mac app', async () => {
    vi.mocked(getVersion).mockResolvedValueOnce('9.9.9');
    setDesktop(true);
    expect(await appVersion()).toBe('9.9.9');
  });

  it('is null, not an error, when the bundle cannot say', async () => {
    vi.mocked(getVersion).mockRejectedValueOnce(new Error('no IPC'));
    setDesktop(true);
    expect(await appVersion()).toBeNull();
  });
});
