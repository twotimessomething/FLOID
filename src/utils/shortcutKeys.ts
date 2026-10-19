import { isDesktop } from '../platform/detect';

/** The modifier glyphs, in the order a Mac prints them. */
const MAC_MODIFIERS: readonly string[] = ['⌃', '⌥', '⇧', '⌘'];

/**
 * What each glyph is on a keyboard without them. ⌘ is Ctrl because that is
 * the key the web build answers there (`commandForKeydown` takes either).
 */
const PC_NAMES: Readonly<Record<string, string>> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };

/** The order Windows prints modifiers in. */
const PC_ORDER: readonly string[] = ['Ctrl', 'Alt', 'Shift'];

/**
 * Whether the keys on this keyboard are the Mac's. The App Store build always
 * is; on the web it is whatever the browser says it is running on.
 */
export function isMacKeyboard(): boolean {
  if (isDesktop()) return true;
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * A combo from the command registry as the keycaps to print.
 *
 * A Mac runs it together as one cap, modifiers in ⌃⌥⇧⌘ order — ⇧⌘Z, the way
 * the menu bar writes it. Anywhere else each key is a cap of its own, named
 * rather than drawn: Ctrl, Shift, Z.
 */
export function comboCaps(keys: readonly string[], isMac: boolean): string[] {
  const modifiers = keys.filter((key) => MAC_MODIFIERS.includes(key));
  const rest = keys.filter((key) => !MAC_MODIFIERS.includes(key));

  if (isMac) {
    const ordered = MAC_MODIFIERS.filter((glyph) => modifiers.includes(glyph));
    return [[...ordered, ...rest].join('')];
  }

  const named = new Set(modifiers.map((glyph) => PC_NAMES[glyph]));
  return [...PC_ORDER.filter((name) => named.has(name)), ...rest];
}

/**
 * A menu bar label in the sentence case of in-app copy: every capitalised word
 * after the first is lowered, and an all-caps one like FLOID is left alone.
 * "Zoom to Fit" reads "Zoom to fit"; "Show/Hide Projects Sidebar" reads
 * "Show/hide projects sidebar".
 */
export function sentenceCase(label: string): string {
  return label.replace(/([\s/])([A-Z])(?=[a-z])/g, (_, gap: string, letter: string) =>
    gap + letter.toLowerCase()
  );
}
