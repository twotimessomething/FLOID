import { describe, it, expect } from 'vitest';
import {
  SHEET_DAYS,
  createSheetWindow,
  dayToFraction,
  fractionToDay,
} from '../components/layout/walkthrough/sheetWindow';
import { addDaysToKey, dayKeyDiff } from '../utils/dayKeys';

/**
 * The walkthrough's draw gesture turns a pointer into a date and a date back
 * into a position on the paper. If those two disagree, the dates someone reads
 * while drawing are not the dates the bar gets — which is the one promise the
 * first lesson makes.
 */
describe('walkthrough sheet window', () => {
  const sheet = createSheetWindow();

  it('starts on the first of a month and runs twelve weeks', () => {
    expect(sheet.start.endsWith('-01')).toBe(true);
    expect(dayKeyDiff(sheet.start, sheet.end)).toBe(SHEET_DAYS);
  });

  it('pins its two ends to 0 and 1', () => {
    expect(dayToFraction(sheet, sheet.start)).toBe(0);
    expect(dayToFraction(sheet, sheet.end)).toBe(1);
  });

  it('round-trips every day on the sheet', () => {
    for (let day = 0; day <= SHEET_DAYS; day += 1) {
      const key = addDaysToKey(sheet.start, day);
      expect(fractionToDay(sheet, dayToFraction(sheet, key))).toBe(key);
    }
  });

  it('clamps a pointer that leaves the paper to the paper', () => {
    expect(fractionToDay(sheet, -0.5)).toBe(sheet.start);
    expect(fractionToDay(sheet, 1.5)).toBe(sheet.end);
  });
});
