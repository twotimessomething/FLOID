import { describe, it, expect } from 'vitest';
import { layoutLabels, measureMilestoneLabelWidth } from '../utils/labelLayoutUtils';
import type { LabelCandidate } from '../utils/labelLayoutUtils';

function candidate(id: string, center: number, width: number): LabelCandidate {
  return { id, center, width };
}

describe('layoutLabels', () => {
  it('returns an empty map for no candidates', () => {
    expect(layoutLabels([]).size).toBe(0);
  });

  it('centers a single label', () => {
    const placements = layoutLabels([candidate('a', 100, 50)]);
    expect(placements.get('a')).toEqual({ isHidden: false, offsetX: 0 });
  });

  it('centers labels that are far apart', () => {
    const placements = layoutLabels([
      candidate('a', 100, 50),
      candidate('b', 300, 50),
    ]);
    expect(placements.get('a')).toEqual({ isHidden: false, offsetX: 0 });
    expect(placements.get('b')).toEqual({ isHidden: false, offsetX: 0 });
  });

  it('nudges a colliding label by the minimum needed to clear', () => {
    // a centered occupies [75, 125]; b centered would start at 120.
    // Minimal shift to 125 + 6px gap = 131 is an 11px nudge.
    const placements = layoutLabels([
      candidate('a', 100, 50),
      candidate('b', 145, 50),
    ]);
    expect(placements.get('a')).toEqual({ isHidden: false, offsetX: 0 });
    expect(placements.get('b')).toEqual({ isHidden: false, offsetX: 11 });
  });

  it('hides a label whose required nudge exceeds the cap', () => {
    // b centered would start at 95; clearing a needs a 36px nudge — too far.
    const placements = layoutLabels([
      candidate('a', 100, 50),
      candidate('b', 120, 50),
    ]);
    expect(placements.get('a')).toEqual({ isHidden: false, offsetX: 0 });
    expect(placements.get('b')).toEqual({ isHidden: true, offsetX: 0 });
  });

  it('does not let a hidden label block later labels', () => {
    const placements = layoutLabels([
      candidate('a', 100, 50),
      candidate('b', 120, 50), // hidden
      candidate('c', 200, 50), // clears a, should center
    ]);
    expect(placements.get('b')?.isHidden).toBe(true);
    expect(placements.get('c')).toEqual({ isHidden: false, offsetX: 0 });
  });

  it('sorts candidates by center before sweeping', () => {
    const placements = layoutLabels([
      candidate('b', 300, 50),
      candidate('a', 100, 50),
    ]);
    expect(placements.get('a')).toEqual({ isHidden: false, offsetX: 0 });
    expect(placements.get('b')).toEqual({ isHidden: false, offsetX: 0 });
  });

  it('cascades nudges through a cluster and hides what cannot fit', () => {
    // a centered [70, 130]; b needs a 26px nudge (over the 20px cap) -> hidden;
    // c needs a 16px nudge past a -> visible.
    const placements = layoutLabels([
      candidate('a', 100, 60),
      candidate('b', 140, 60),
      candidate('c', 150, 60),
    ]);
    expect(placements.get('a')).toEqual({ isHidden: false, offsetX: 0 });
    expect(placements.get('b')?.isHidden).toBe(true);
    expect(placements.get('c')).toEqual({ isHidden: false, offsetX: 16 });
  });

  it('never nudges a label so far the diamond leaves its footprint', () => {
    // Narrow 24px labels: cap is width/2 - 8 = 4px, tighter than the
    // global 20px cap. b would need a 12px nudge -> hidden.
    const placements = layoutLabels([
      candidate('a', 100, 24),
      candidate('b', 118, 24),
    ]);
    expect(placements.get('b')?.isHidden).toBe(true);
  });

  it('respects the gap between adjacent labels', () => {
    // a centered occupies [75, 125]; b centered starts at 127 — inside the
    // 6px gap, so it gets a 4px nudge.
    const placements = layoutLabels([
      candidate('a', 100, 50),
      candidate('b', 152, 50),
    ]);
    expect(placements.get('b')).toEqual({ isHidden: false, offsetX: 4 });
  });
});

describe('measureMilestoneLabelWidth', () => {
  it('grows with text length', () => {
    expect(measureMilestoneLabelWidth('Design Freeze Approval')).toBeGreaterThan(
      measureMilestoneLabelWidth('Gate 1')
    );
  });

  it('includes pill chrome for empty text', () => {
    expect(measureMilestoneLabelWidth('')).toBeGreaterThan(0);
  });

  it('returns a stable cached value', () => {
    expect(measureMilestoneLabelWidth('Gate 2')).toBe(measureMilestoneLabelWidth('Gate 2'));
  });
});
