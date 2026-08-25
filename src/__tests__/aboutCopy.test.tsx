/**
 * The store listing answers "we do not collect data from this app". That answer
 * is only honest while the desktop panel says so too — a reviewer reads both.
 * These four assertions are what keep the two from drifting apart.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AboutModal } from '../components/layout/AboutModal';
import { useUIStore } from '../stores/uiStore';

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
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  useUIStore.setState({ isAboutModalOpen: false });
});

describe('About panel copy', () => {
  it('web says browser tab', () => {
    openOn('web');
    expect(screen.getByText(/the whole app runs in this browser tab/)).toBeInTheDocument();
  });

  it('desktop says this Mac, never browser tab', () => {
    openOn('desktop');
    expect(screen.getByText(/the whole app runs on this Mac/)).toBeInTheDocument();
    expect(screen.queryByText(/browser tab/)).toBeNull();
  });
});

describe('Privacy panel copy', () => {
  const privacy = (platform: 'web' | 'desktop'): void => {
    openOn(platform);
    // fireEvent wraps the dispatch in act(); a raw .click() leaves the
    // state update unflushed and the panel still on the About tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Privacy' }));
  };

  it('desktop claims nothing leaves, and never mentions analytics or Google Fonts', () => {
    privacy('desktop');
    expect(screen.getByText('What leaves this Mac')).toBeInTheDocument();
    expect(screen.getByText(/cannot make a network request at all/)).toBeInTheDocument();
    // The word "analytics" does appear — inside the denial. What must not
    // appear is the web's *claim* that any is collected.
    expect(document.body.textContent).not.toMatch(/page-view analytics/i);
    expect(document.body.textContent).not.toMatch(/Google Fonts/i);
    expect(document.body.textContent).not.toMatch(/browser/i);
  });

  it('web keeps its own honest wording', () => {
    privacy('web');
    expect(screen.getByText('What leaves your browser')).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/anonymous page-view analytics/);
    expect(document.body.textContent).not.toMatch(/Google Fonts/i);
  });
});
