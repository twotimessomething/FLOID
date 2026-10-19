import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatShortDay } from '../utils/dateUtils';

describe('formatShortDay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves the year off a day in the current one', () => {
    expect(formatShortDay('2026-10-18')).toBe('Oct 18');
    expect(formatShortDay('2026-01-01')).toBe('Jan 1');
    expect(formatShortDay('2026-12-31')).toBe('Dec 31');
  });

  it('says the year of a day in any other', () => {
    expect(formatShortDay('2027-01-05')).toBe('Jan 5, 2027');
    expect(formatShortDay('2025-12-31')).toBe('Dec 31, 2025');
  });
});
