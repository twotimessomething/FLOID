import { isDesktop } from './detect';

/**
 * The native window title — what the title bar, the Window menu and Mission
 * Control call this window. WKWebView does not carry `document.title` across,
 * so the Mac app has to be told.
 *
 * A no-op on the web, where `document.title` already is the tab's name. Loaded
 * through a dynamic `import()` so the web bundle never fetches `@tauri-apps`.
 */
export function setNativeWindowTitle(title: string): void {
  if (!isDesktop()) return;

  void import('@tauri-apps/api/window')
    .then((m) => m.getCurrentWindow().setTitle(title))
    .catch((error) => {
      console.error('Failed to set the window title:', error);
    });
}
