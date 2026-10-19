import { invoke } from '@tauri-apps/api/core';

/** NSWorkspace opens it, in whichever app owns the scheme. */
export async function openExternal(url: string): Promise<void> {
  await invoke('open_external', { url });
}
