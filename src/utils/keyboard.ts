import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Whether a keydown belongs to an input method rather than to the app.
 *
 * Typing Japanese or Chinese, Return confirms the candidate and Escape drops
 * it — neither is a Return or an Escape the app should act on. `isComposing`
 * covers the keys pressed mid-composition; WKWebView delivers the confirming
 * Return after `compositionend`, where only its keyCode (229) still says so.
 */
export function isImeComposing(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event;
  return native.isComposing || native.keyCode === 229;
}

/** Inputs that take no typing — a checkbox, a radio — have nothing to cut or paste. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'button',
  'submit',
  'reset',
  'image',
]);

/**
 * Whether an event landed somewhere text is typed. A right-click there is
 * owed the system's Cut, Copy, Paste and Spelling, not FLOID's menu.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
  if (!field) return false;
  return !(field instanceof HTMLInputElement) || !NON_TEXT_INPUT_TYPES.has(field.type);
}
