import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeResize, resizedSpan } from '../hooks/useBarResize';

/** Aug 3 to the Aug 17 edge: fourteen days, the last of them Aug 16. */
const SPAN = { start: '2026-08-03', end: '2026-08-17' };

describe('resizedSpan', () => {
  it('holds the dates through a wobble, even where a day is two pixels', () => {
    expect(resizedSpan(SPAN, 'end', 5, 2)).toEqual(SPAN);
    expect(resizedSpan(SPAN, 'start', -5, 2)).toEqual(SPAN);
    // At a fit zoom one pixel is five days, and still nothing moves
    expect(resizedSpan(SPAN, 'end', 1, 0.2)).toEqual(SPAN);
  });

  it('moves the grabbed edge to the nearest day once past the dead zone', () => {
    expect(resizedSpan(SPAN, 'end', 6, 2)).toEqual({ start: SPAN.start, end: '2026-08-20' });
    expect(resizedSpan(SPAN, 'end', 100, 40)).toEqual({ start: SPAN.start, end: '2026-08-20' });
    expect(resizedSpan(SPAN, 'start', -80, 40)).toEqual({ start: '2026-08-01', end: SPAN.end });
  });

  it('never brings one edge within a day of the other', () => {
    expect(resizedSpan(SPAN, 'end', -2000, 40)).toEqual({ start: SPAN.start, end: '2026-08-04' });
    expect(resizedSpan(SPAN, 'start', 2000, 40)).toEqual({ start: '2026-08-16', end: SPAN.end });
  });

  it('moves nothing without a time axis', () => {
    expect(resizedSpan(SPAN, 'end', 200, 0)).toEqual(SPAN);
  });
});

describe('describeResize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the day the moving edge lands on, and the length it leaves', () => {
    expect(describeResize(SPAN, 'start')).toBe('Aug 3 · 14 days');
    // The end edge reads as the bar's last day, not the gridline after it
    expect(describeResize(SPAN, 'end')).toBe('Aug 16 · 14 days');
    expect(describeResize({ start: '2026-08-03', end: '2026-08-04' }, 'end')).toBe('Aug 3 · 1 day');
  });

  it('carries the year where the bar crosses one', () => {
    expect(describeResize({ start: '2026-12-20', end: '2027-01-10' }, 'end')).toBe(
      'Jan 9, 2027 · 21 days'
    );
  });
});
