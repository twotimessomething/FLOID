import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { importFloidText } from '../utils/importFloid';
import { setupAppMenu } from './menu.desktop';

/**
 * Desktop-only boot wiring, dynamically imported behind `isDesktop()` so the
 * web bundle never fetches `@tauri-apps`. Finder opens (cold and warm) and
 * webview drag-drops both land here and walk through the same
 * `importFloidText` door as the web's file picker.
 */

const IMPORTABLE = ['.floid', '.floid-project', '.json'];

async function importPaths(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    if (!IMPORTABLE.some((ext) => path.endsWith(ext))) continue;
    try {
      await importFloidText(await readTextFile(path));
    } catch (error) {
      console.error('Failed to import opened file:', error);
    }
  }
}

/** Rust buffers Finder-opened files; both boot and the nudge event drain here. */
async function drainPendingFiles(): Promise<void> {
  const paths = await invoke<string[]>('take_pending_files');
  await importPaths(paths);
}

/**
 * Rust pins the window's appearance at launch so the boot script in index.html
 * cannot lose a race against the webview settling on `prefers-color-scheme`.
 * A pinned NSWindow stops following the system *and* stops being told the
 * system moved, so leaving it pinned means macOS appearance changes never
 * reach the webview at all — which is what shipped as build 1. Release it once
 * a frame has actually been painted: two rAFs, because the first fires before
 * the frame it schedules is on screen.
 *
 * Paint is the *only* thing the release waits on, which is why this is called
 * first and synchronously. Sequenced after the awaits below it would inherit
 * their failure modes — a rejected menu build or a failed pending-files IPC
 * would leave the window pinned for the rest of the process, which is build 1
 * again, only now intermittently.
 */
function followSystemTheme(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void invoke('follow_system_theme').catch((error) => {
        console.error('Failed to hand the theme back to the system:', error);
      });
    });
  });
}

let initialized = false;

export async function initDesktop(): Promise<void> {
  // Idempotent: StrictMode mounts effects twice, listeners must not double up
  if (initialized) return;
  initialized = true;

  followSystemTheme();

  await setupAppMenu();

  await listen('floid://pending-files', () => {
    void drainPendingFiles();
  });
  await drainPendingFiles();

  // A drop on a Tauri webview delivers paths on this event, not on the DOM's
  // dataTransfer — App.tsx's DOM handler only ever sees the hover styling.
  await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'drop') {
      void importPaths(event.payload.paths);
    }
  });
}
