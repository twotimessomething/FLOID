import { isDesktop } from './detect';

/**
 * The native window ground — the colour macOS paints behind the webview, and
 * the one that shows at the edges while a live resize outruns the web content.
 *
 * Rust sets it once at launch from the *system* appearance, because at that
 * moment there is no webview to ask. From then on the app's own theme is the
 * authority: Light/Dark/System is a FLOID setting, so a forced theme inside the
 * opposite system appearance would otherwise leave a dark ground behind a light
 * sheet. Following the system natively cannot get this right; only the code
 * that resolved the theme knows what is actually being painted.
 *
 * A no-op on the web, where nothing sits behind the page. Loaded through a
 * dynamic `import()` so the web bundle never fetches `@tauri-apps`.
 */
export function setNativeGround(resolvedTheme: 'light' | 'dark'): void {
  if (!isDesktop()) return;

  void import('@tauri-apps/api/core')
    .then((m) => m.invoke('set_ground', { dark: resolvedTheme === 'dark' }))
    .catch((error) => {
      console.error('Failed to set the native window ground:', error);
    });
}
