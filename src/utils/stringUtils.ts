/**
 * Sanitize a string for use as a filename.
 * Replaces whitespace with hyphens, lowercases, and removes non-alphanumeric chars.
 */
export const sanitizeFilename = (name: string): string =>
  name.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
