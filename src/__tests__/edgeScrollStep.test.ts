import { describe, expect, it } from 'vitest';
import { edgeScrollStep } from '../hooks/useItemDrag';

const FRAME_60HZ = 1000 / 60;
const FRAME_120HZ = 1000 / 120;

describe('edgeScrollStep', () => {
  it('takes a 60 Hz frame at its full speed', () => {
    expect(edgeScrollStep(24, FRAME_60HZ)).toBe(24);
    expect(edgeScrollStep(-18, FRAME_60HZ)).toBe(-18);
  });

  it('covers the same ground per second at 120 Hz as at 60 Hz', () => {
    expect(edgeScrollStep(24, FRAME_120HZ)).toBe(12);
    expect(edgeScrollStep(-18, FRAME_120HZ)).toBe(-9);
  });

  it('counts the first frame of a run as one frame', () => {
    expect(edgeScrollStep(10, null)).toBe(10);
  });

  it('never rounds a crawl away to nothing', () => {
    expect(edgeScrollStep(1, FRAME_120HZ)).toBe(1);
    expect(edgeScrollStep(-1, 1)).toBe(-1);
  });

  it('scrolls a stalled frame as far as a few, not as far as the stall', () => {
    expect(edgeScrollStep(24, 1000)).toBe(72);
  });

  it('stands still with no speed', () => {
    expect(edgeScrollStep(0, FRAME_60HZ)).toBe(0);
  });
});
