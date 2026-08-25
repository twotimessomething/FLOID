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

let initialized = false;

export async function initDesktop(): Promise<void> {
  // Idempotent: StrictMode mounts effects twice, listeners must not double up
  if (initialized) return;
  initialized = true;

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
