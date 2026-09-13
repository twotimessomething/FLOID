/**
 * What shipped, in the user's words.
 *
 * The list is the record — nothing reads `package.json`, and no version string
 * is parsed. Order is the only truth: **newest first**, and "unseen" means
 * everything above the entry the reader last dismissed. So an entry is added in
 * the same commit that bumps the version, and an entry is never reordered or
 * renamed after it ships, because a stamp that no longer matches a `version`
 * here is treated as unknown.
 *
 * Keep it to what someone would notice. Three or four bullets, each a sentence,
 * no internals: a refactor that changed nothing on the sheet does not belong
 * here, and a release with nothing to say simply has no entry.
 */
export interface ReleaseNote {
  /** Matches the shipped app version exactly. Never edited after release. */
  readonly version: string;
  /** `yyyy-MM-dd`, shown as the entry's date. */
  readonly date: string;
  readonly notes: readonly string[];
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.2.0',
    date: '2026-09-12',
    notes: [
      'Tasks: a milestone you can tick off. Hold ⌥ and the pointer draws a circle — one click drops a task on that day, in that row’s group.',
      'The circle is the checkbox. Click it when the work is done and the task prints as solid ink with its name struck through.',
      'Tasks drag, nest and link like everything else on the sheet.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-06',
    notes: [
      'Link two bars to record an order. The line shows when the work has slipped out of it, and never moves a bar on its own.',
      'Folded schedules keep their bars as one strip of tape, on screen and in the PowerPoint export.',
      'Turn on travelling labels in Settings and a bar keeps its name in view as you scroll past its start.',
      'FLOID is now a native Mac app, with the full menu bar and Finder file opening.',
    ],
  },
];

/** The entry a reader is caught up to once they dismiss the panel. */
export const LATEST_RELEASE_VERSION: string | null = RELEASE_NOTES[0]?.version ?? null;

/**
 * Everything published since `lastSeenVersion`, newest first.
 *
 * A stamp this list does not recognise — never set, or from a build older than
 * the oldest entry — returns the newest entry alone. History is not replayed:
 * someone opening FLOID after a long gap wants to know what is different now,
 * not to read four releases they have already been using.
 */
export function unseenIn(
  releases: readonly ReleaseNote[],
  lastSeenVersion: string | null
): readonly ReleaseNote[] {
  if (lastSeenVersion === null) return releases.slice(0, 1);
  const index = releases.findIndex((release) => release.version === lastSeenVersion);
  if (index === -1) return releases.slice(0, 1);
  return releases.slice(0, index);
}

export function unseenReleases(lastSeenVersion: string | null): readonly ReleaseNote[] {
  return unseenIn(RELEASE_NOTES, lastSeenVersion);
}
