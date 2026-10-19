import { isDesktop } from './detect';

/**
 * Open a link outside the app: a web page in the browser, a `mailto:` in the
 * mail client. Nothing else is let through, here or in the Rust command behind
 * the desktop half.
 *
 * An anchor cannot do this in the Mac app — `target="_blank"` asks the webview
 * for a window nobody creates, and WKWebView will not load `mailto:` — so a
 * link that leaves FLOID goes through here on both targets. The desktop half
 * loads through a dynamic `import()`, so the web never fetches `@tauri-apps`.
 */
export async function openExternal(url: string): Promise<void> {
  const protocol = protocolOf(url);
  if (protocol !== 'https:' && protocol !== 'mailto:') {
    console.error(`Refusing to open ${url}: only https and mailto links leave the app`);
    return;
  }

  if (isDesktop()) {
    const { openExternal: open } = await import('./links.desktop');
    await open(url);
    return;
  }

  // A mail link hands off to the mail client and leaves the page where it is;
  // a new tab for it would only be an empty one.
  if (protocol === 'mailto:') {
    window.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function protocolOf(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}
