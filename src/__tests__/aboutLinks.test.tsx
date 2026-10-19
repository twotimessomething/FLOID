import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutModal } from '../components/layout/AboutModal';
import { openExternal } from '../platform/links';
import { LATEST_RELEASE_VERSION } from '../data/releaseNotes';
import { useUIStore } from '../stores/uiStore';

vi.mock('../platform/links', () => ({ openExternal: vi.fn().mockResolvedValue(undefined) }));
// The bundle's answer stands in for `getVersion`; `appVersion` has its own tests
vi.mock('../platform/version', async () => {
  const { LATEST_RELEASE_VERSION: latest } = await import('../data/releaseNotes');
  return { appVersion: vi.fn(async () => ('__TAURI_INTERNALS__' in window ? '9.9.9' : latest)) };
});

function openOn(platform: 'web' | 'desktop'): void {
  if (platform === 'desktop') {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
  useUIStore.setState({ isAboutModalOpen: true });
  render(<AboutModal />);
}

afterEach(() => {
  cleanup();
  vi.mocked(openExternal).mockClear();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  useUIStore.setState({ isAboutModalOpen: false });
});

describe('About links', () => {
  it('stay plain anchors on the web', () => {
    openOn('web');
    const link = screen.getByRole('link', { name: /Source on GitHub/ });
    expect(fireEvent.click(link)).toBe(true);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('go through openExternal in the Mac app, which cannot follow them', () => {
    openOn('desktop');
    const mail = screen.getByRole('link', { name: /support@floid\.design/ });
    // fireEvent.click returns false when the default was prevented
    expect(fireEvent.click(mail)).toBe(false);
    expect(openExternal).toHaveBeenCalledWith('mailto:support@floid.design');

    fireEvent.click(screen.getByRole('link', { name: /Source on GitHub/ }));
    expect(openExternal).toHaveBeenLastCalledWith('https://github.com/twotimessomething/FLOID');
  });
});

describe('About version', () => {
  it('prints the newest release on the web', () => {
    openOn('web');
    expect(screen.getByText(`Version ${LATEST_RELEASE_VERSION}`)).toBeInTheDocument();
  });

  it('prints the bundle’s own version in the Mac app', async () => {
    openOn('desktop');
    expect(await screen.findByText('Version 9.9.9')).toBeInTheDocument();
  });
});
