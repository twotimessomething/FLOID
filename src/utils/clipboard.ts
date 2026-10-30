/**
 * Put text on the clipboard. Returns whether it got there.
 *
 * The async Clipboard API is the road on both targets, but it can refuse — an
 * older WebKit, a page without focus — so a selected off-screen textarea and
 * `execCommand('copy')` stand behind it. Either has to be called from inside
 * the click that asked for it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the selection route
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
