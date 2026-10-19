/**
 * The old lowercase slug: hyphens for spaces, and nothing outside a–z, 0–9.
 *
 * Frozen. The folder autosave writes to the file this names, so changing it
 * would leave every existing autosave file behind and start a second one
 * beside it. Anything a person names in a save dialog uses `toFilename`.
 */
export const legacyFilenameSlug = (name: string): string =>
  name.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');

/** What no file system takes in a name, and the control characters. */
const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|\p{Cc}]/gu;

/**
 * A name as typed, made safe to save under. Only what a file system refuses is
 * taken out — case, accents, other scripts and emoji all stay — along with any
 * leading dot, which on a Mac would hide the file. Nothing left is "Untitled".
 */
export const toFilename = (name: string): string =>
  name
    .replace(UNSAFE_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+/, '')
    .trim() || 'Untitled';
