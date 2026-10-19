/**
 * A name nobody on the sheet is using yet: the name itself while it is free,
 * then "Name 2", "Name 3" — the way Finder numbers a second "untitled folder".
 *
 * Taken names are compared trimmed and case-blind, because "Engineering" and
 * "engineering " are the same name to anyone reading the labels column.
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) used.add(normalise(name));

  if (!used.has(normalise(base))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(normalise(candidate))) return candidate;
  }
}

function normalise(name: string): string {
  return name.trim().toLowerCase();
}
