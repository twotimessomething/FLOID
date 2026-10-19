import { describe, expect, it } from 'vitest';
import { getHeaderAxis, weekendStartKeys } from '../utils/dateUtils';
import { toDayKey } from '../utils/dayKeys';

const keys = (periods: readonly { readonly date: Date }[]): string[] =>
  periods.map((period) => toDayKey(period.date));
const labels = (periods: readonly { readonly label: string }[]): string[] =>
  periods.map((period) => period.label);

describe('getHeaderAxis', () => {
  it('names months, and prints the year only where it begins', () => {
    const axis = getHeaderAxis(new Date(2026, 9, 18), new Date(2027, 2, 10), 'month');
    expect(labels(axis.periods)).toEqual(['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']);
    expect(labels(axis.years)).toEqual(['2026', '2027']);
    expect(keys(axis.years)).toEqual(['2026-10-01', '2027-01-01']);
    expect(axis.days).toEqual([]);
  });

  it('opens with the year even when the sheet starts mid-year', () => {
    const axis = getHeaderAxis(new Date(2026, 7, 3), new Date(2026, 11, 20), 'month');
    expect(labels(axis.years)).toEqual(['2026']);
    expect(keys(axis.years)).toEqual(['2026-08-01']);
  });

  it('prints a new year once at week zoom, not on every week of January', () => {
    const axis = getHeaderAxis(new Date(2026, 11, 14), new Date(2027, 1, 1), 'week');
    expect(labels(axis.years)).toEqual(['2026', '2027']);
    // The first week to begin in the new year carries it
    expect(keys(axis.years)).toEqual(['2026-12-14', '2027-01-04']);
    expect(labels(axis.periods).slice(0, 3)).toEqual(['Dec 14', 'Dec 21', 'Dec 28']);
  });

  it('names quarters without repeating the year', () => {
    const axis = getHeaderAxis(new Date(2026, 3, 1), new Date(2027, 5, 30), 'quarter');
    expect(labels(axis.periods)).toEqual(['Q2', 'Q3', 'Q4', 'Q1', 'Q2']);
    expect(labels(axis.years)).toEqual(['2026', '2027']);
  });

  it('numbers every day at day zoom, under months that carry their year', () => {
    const axis = getHeaderAxis(new Date(2026, 9, 29), new Date(2026, 10, 2), 'day');
    expect(labels(axis.periods)).toEqual(['Oct 2026', 'Nov 2026']);
    expect(keys(axis.periods)).toEqual(['2026-10-01', '2026-11-01']);
    expect(axis.years).toEqual([]);
    expect(labels(axis.days)).toEqual(['29', '30', '31', '1', '2']);
  });
});

describe('weekendStartKeys', () => {
  it('lists every Saturday on the sheet', () => {
    // 2026-10-12 is a Monday
    expect(weekendStartKeys('2026-10-12', '2026-11-01')).toEqual([
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
    ]);
  });

  it('starts from the weekend a Sunday opening is halfway through', () => {
    expect(weekendStartKeys('2026-10-18', '2026-10-26')).toEqual(['2026-10-17', '2026-10-24']);
  });

  it('starts on the opening day when that is a Saturday', () => {
    expect(weekendStartKeys('2026-10-17', '2026-10-20')).toEqual(['2026-10-17']);
  });
});
