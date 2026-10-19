import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { flushAutoSave } from '../hooks/useAutoSave';

/**
 * The two ways a session ends on the Mac — ⌘Q and closing the window — and the
 * one thing both must do first: write the last second of edits. Neither raises
 * the `beforeunload` the web relies on. The stock Quit item terminates on the
 * spot, and a closing window takes the webview with it.
 */

/** ⌘Q: the menu's own Quit, in place of the stock one. */
export async function quitAfterSaving(): Promise<void> {
  await flushAutoSave();
  await invoke('quit');
}

/**
 * The close button and ⌘W. Closing the only window quits the app, so this is
 * the same flush. Listening at all holds the close back until the handler
 * returns, and the window is destroyed after it — `flushAutoSave` never
 * rejects, which is what guarantees a window that always closes.
 */
export async function saveBeforeWindowCloses(): Promise<void> {
  await getCurrentWindow().onCloseRequested(async () => {
    await flushAutoSave();
  });
}
