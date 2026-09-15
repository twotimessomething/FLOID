import { format } from 'date-fns';
import { addDaysToKey, dayKeyDiff, type DayKey } from '../../../utils/dayKeys';

/** A lesson sheet is twelve weeks, which is long enough to draw a real span in. */
export const SHEET_DAYS = 84;

export interface SheetWindow {
  readonly start: DayKey;
  readonly end: DayKey;
}

/** The window every lesson draws on: twelve weeks from the first of this month. */
export function createSheetWindow(): SheetWindow {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = format(first, 'yyyy-MM-dd');
  return { start, end: addDaysToKey(start, SHEET_DAYS) };
}

/** A fraction across the sheet, 0 at its first day and 1 at its last. */
export function dayToFraction(sheet: SheetWindow, key: DayKey): number {
  return dayKeyDiff(sheet.start, key) / SHEET_DAYS;
}

/** The inverse, for turning a pointer into a date. */
export function fractionToDay(sheet: SheetWindow, fraction: number): DayKey {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return addDaysToKey(sheet.start, Math.round(clamped * SHEET_DAYS));
}
