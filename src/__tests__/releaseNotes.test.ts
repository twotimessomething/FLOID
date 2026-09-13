import { describe, it, expect } from 'vitest';
import {
  RELEASE_NOTES,
  LATEST_RELEASE_VERSION,
  unseenIn,
  unseenReleases,
  type ReleaseNote,
} from '../data/releaseNotes';

const note = (version: string): ReleaseNote => ({ version, date: '2026-01-01', notes: ['x'] });

/** Newest first, the way the real list is authored. */
const LIST: readonly ReleaseNote[] = [note('1.3.0'), note('1.2.0'), note('1.1.0')];

describe('release notes', () => {
  it('is ordered newest first and carries no duplicate version', () => {
    const versions = RELEASE_NOTES.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(LATEST_RELEASE_VERSION).toBe(versions[0] ?? null);
  });

  it('gives every entry a day key and at least one note', () => {
    for (const release of RELEASE_NOTES) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.notes.length).toBeGreaterThan(0);
    }
  });

  it('shows nothing once the reader is caught up', () => {
    expect(unseenReleases(LATEST_RELEASE_VERSION)).toHaveLength(0);
  });

  it('shows the newest entry alone for an unrecognised stamp', () => {
    expect(unseenReleases(null)).toEqual(RELEASE_NOTES.slice(0, 1));
    expect(unseenReleases('0.0.1-not-a-release')).toEqual(RELEASE_NOTES.slice(0, 1));
  });

  it('shows every entry published since the stamp', () => {
    expect(unseenIn(LIST, '1.1.0').map((r) => r.version)).toEqual(['1.3.0', '1.2.0']);
    expect(unseenIn(LIST, '1.2.0').map((r) => r.version)).toEqual(['1.3.0']);
    expect(unseenIn(LIST, '1.3.0')).toHaveLength(0);
  });

  it('never replays history for a stamp it does not know', () => {
    expect(unseenIn(LIST, null).map((r) => r.version)).toEqual(['1.3.0']);
    expect(unseenIn(LIST, '0.9.0').map((r) => r.version)).toEqual(['1.3.0']);
  });

  it('has nothing to show from an empty list', () => {
    expect(unseenIn([], null)).toHaveLength(0);
    expect(unseenIn([], '1.0.0')).toHaveLength(0);
  });
});
