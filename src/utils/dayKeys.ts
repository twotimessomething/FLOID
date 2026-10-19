import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

/**
 * Day keys: 'yyyy-MM-dd' strings, the timeline's unit of position.
 *
 * A Gantt chart has no use for sub-day precision, and whole days make the
 * arithmetic exact — bars land on gridlines, drags move in day steps, and no
 * float ever drifts. Parsing a bare date string with date-fns yields local
 * midnight, so keys never wander across a timezone boundary.
 */

export type DayKey = string;

export function toDayKey(date: Date): DayKey {
  return format(date, 'yyyy-MM-dd');
}

export function fromDayKey(key: DayKey): Date {
  return parseISO(key);
}

/** Accepts a day key or a legacy full ISO timestamp and returns a day key. */
export function normalizeDayKey(value: string | Date): DayKey {
  if (value instanceof Date) return toDayKey(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = parseISO(value);
  return isValid(parsed) ? toDayKey(parsed) : toDayKey(new Date());
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  if (days === 0) return key;
  return toDayKey(addDays(fromDayKey(key), Math.round(days)));
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function dayKeyDiff(a: DayKey, b: DayKey): number {
  return differenceInCalendarDays(fromDayKey(b), fromDayKey(a));
}

export function minDayKey(a: DayKey, b: DayKey): DayKey {
  return a <= b ? a : b;
}

export function maxDayKey(a: DayKey, b: DayKey): DayKey {
  return a >= b ? a : b;
}

export function clampDayKey(key: DayKey, min: DayKey, max: DayKey): DayKey {
  return maxDayKey(min, minDayKey(max, key));
}

export const todayKey = (): DayKey => toDayKey(new Date());

/**
 * A bar's `end` is its exclusive right edge — the gridline it stops at, which
 * is the morning of the day after its last. That is what makes widths and
 * back-to-back links exact, and it is never what a person should read: these
 * two convert between the stored edge and the last day the bar covers.
 */
export function lastDayOf(end: DayKey): DayKey {
  return addDaysToKey(end, -1);
}

/** The exclusive `end` for a bar whose last day is `day`. */
export function endAfterLastDay(day: DayKey): DayKey {
  return addDaysToKey(day, 1);
}

/** Saturday or Sunday. */
export function isWeekendKey(key: DayKey): boolean {
  const day = fromDayKey(key).getDay();
  return day === 0 || day === 6;
}

/** Nudge a weekend day forward to Monday. Weekdays pass through. */
export function snapKeyToBusinessDay(key: DayKey): DayKey {
  const day = fromDayKey(key).getDay();
  if (day === 6) return addDaysToKey(key, 2);
  if (day === 0) return addDaysToKey(key, 1);
  return key;
}

/**
 * Square up a bar's exclusive end so its last day is a weekday. A last day on
 * the weekend pulls back to Friday rather than on to Monday: an end is where
 * the work stops, and snapping should never hand a bar a weekend it lacked.
 */
export function snapEndToBusinessDay(end: DayKey): DayKey {
  const day = fromDayKey(lastDayOf(end)).getDay();
  if (day === 6) return addDaysToKey(end, -1);
  if (day === 0) return addDaysToKey(end, -2);
  return end;
}

export interface DaySpan {
  readonly start: DayKey;
  /** Exclusive, as on a bar. */
  readonly end: DayKey;
}

/**
 * Both edges of a bar squared up to business days: the start forward to a
 * weekday, the end back to one. A span lying wholly inside a weekend would
 * square up to nothing at all, so that one is left as it was.
 */
export function snapSpanToBusinessDays(span: DaySpan): DaySpan {
  const start = snapKeyToBusinessDay(span.start);
  const end = snapEndToBusinessDay(span.end);
  return dayKeyDiff(start, end) < 1 ? span : { start, end };
}
