import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The sheet decides its keyboard when it loads, so each case loads it fresh. */
async function openSheet(platform: 'web' | 'desktop'): Promise<void> {
  if (platform === 'desktop') {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  }
  vi.resetModules();
  const { useUIStore } = await import('../stores/uiStore');
  const { KeyboardHelpModal } = await import('../components/layout/KeyboardHelpModal');
  useUIStore.setState({ isKeyboardHelpModalOpen: true });
  render(<KeyboardHelpModal />);
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('the shortcuts sheet', () => {
  it('prints a Mac combo as one cap in ⌃⌥⇧⌘ order, and Return for Enter', async () => {
    await openSheet('desktop');
    expect(screen.getByText('⇧⌘Z')).toBeInTheDocument();
    expect(screen.getByText('Return')).toBeInTheDocument();
    expect(screen.queryByText('Enter')).toBeNull();
    expect(screen.getByText('Zoom to fit')).toBeInTheDocument();
  });

  it('names Ctrl and Alt where those are the keys that work', async () => {
    // jsdom does not claim to be a Mac
    await openSheet('web');
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
    expect(screen.getByText('Alt-click')).toBeInTheDocument();
    expect(screen.queryByText('⌘')).toBeNull();
  });

  it('teaches linking and unlinking', async () => {
    await openSheet('web');
    expect(screen.getByText('Link a bar to another item')).toBeInTheDocument();
    expect(screen.getByText('Remove a link')).toBeInTheDocument();
  });
});
