import { describe, it, expect } from 'vitest';
import {
  addDaysToKey,
  clampDayKey,
  dayKeyDiff,
  fromDayKey,
  isWeekendKey,
  maxDayKey,
  minDayKey,
  normalizeDayKey,
  snapKeyToBusinessDay,
  toDayKey,
} from '../utils/dayKeys';

describe('dayKeys', () => {
  it('round-trips a local date', () => {
    // Local construction, not `new Date('2026-03-15')` — that parses as UTC and
    // lands on the previous day west of Greenwich.
    const date = new Date(2026, 2, 15);
    expect(toDayKey(date)).toBe('2026-03-15');
    expect(fromDayKey('2026-03-15').getDate()).toBe(15);
    expect(fromDayKey('2026-03-15').getMonth()).toBe(2);
  });

  it('normalizes a legacy ISO timestamp to the local calendar day it was written as', () => {
    // The old app built local midnight and then called .toISOString()
    const legacy = new Date(2026, 7, 1).toISOString();
    expect(normalizeDayKey(legacy)).toBe('2026-08-01');
  });

  it('leaves a day key untouched', () => {
    expect(normalizeDayKey('2026-08-01')).toBe('2026-08-01');
  });

  it('adds days across a month boundary', () => {
    expect(addDaysToKey('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToKey('2026-03-01', 0)).toBe('2026-03-01');
  });

  it('crosses a DST boundary without losing a day', () => {
    // US DST starts 2026-03-08; a naive 24h-millisecond add drops an hour here
    expect(addDaysToKey('2026-03-07', 2)).toBe('2026-03-09');
    expect(dayKeyDiff('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('measures signed day distance', () => {
    expect(dayKeyDiff('2026-01-01', '2026-01-31')).toBe(30);
    expect(dayKeyDiff('2026-01-31', '2026-01-01')).toBe(-30);
    expect(dayKeyDiff('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('orders keys lexically, which is also chronologically', () => {
    expect(minDayKey('2026-01-02', '2026-01-10')).toBe('2026-01-02');
    expect(maxDayKey('2026-01-02', '2026-01-10')).toBe('2026-01-10');
    expect(clampDayKey('2025-12-01', '2026-01-01', '2026-02-01')).toBe('2026-01-01');
    expect(clampDayKey('2026-03-01', '2026-01-01', '2026-02-01')).toBe('2026-02-01');
    expect(clampDayKey('2026-01-15', '2026-01-01', '2026-02-01')).toBe('2026-01-15');
  });

  it('recognises weekends and nudges them to Monday', () => {
    expect(isWeekendKey('2026-03-14')).toBe(true); // Saturday
    expect(isWeekendKey('2026-03-15')).toBe(true); // Sunday
    expect(isWeekendKey('2026-03-16')).toBe(false);
    expect(snapKeyToBusinessDay('2026-03-14')).toBe('2026-03-16');
    expect(snapKeyToBusinessDay('2026-03-15')).toBe('2026-03-16');
    expect(snapKeyToBusinessDay('2026-03-16')).toBe('2026-03-16');
  });
});
