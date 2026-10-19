import { describe, expect, it } from 'vitest';
import { playheadPointAt } from '../hooks/usePlayhead';
import { viewportFromKeys } from '../utils/dateUtils';

// 2026-10-01 to 2026-10-31: thirty days of sheet
const viewport = viewportFromKeys('2026-10-01', '2026-10-31');

describe('playheadPointAt', () => {
  it('stands on the day it names once days are wide enough to read', () => {
    const width = viewport.totalDays * 40;
    // Just inside Oct 4's column: the rule steps back onto its morning
    expect(playheadPointAt(3 * 40 + 10, width, viewport)).toMatchObject({
      left: 120,
      label: 'Oct 4, 2026',
    });
    // Past the middle of it: the rule and the name move to Oct 5 together
    expect(playheadPointAt(3 * 40 + 30, width, viewport)).toMatchObject({
      left: 160,
      label: 'Oct 5, 2026',
    });
  });

  it('glides with the pointer where a day is only a few pixels', () => {
    const width = viewport.totalDays * 6;
    const point = playheadPointAt(3 * 6 + 2, width, viewport);
    expect(point.left).toBe(20);
    expect(point.label).toBe('Oct 4, 2026');
    expect(point.relative).toBeCloseTo(20 / width);
  });

  it('keeps to the sheet', () => {
    const width = viewport.totalDays * 40;
    expect(playheadPointAt(-50, width, viewport)).toMatchObject({
      left: 0,
      relative: 0,
      label: 'Oct 1, 2026',
    });
    expect(playheadPointAt(width + 50, width, viewport)).toMatchObject({
      left: width,
      relative: 1,
      label: 'Oct 31, 2026',
    });
  });
});
