import { addMonths, differenceInCalendarDays, differenceInMonths } from 'date-fns';

/** Under this many whole months a span is counted in days. */
const MONTHS_BEFORE_COUNTING_MONTHS = 2;

/**
 * How long a project window runs, the way a planner would say it: "45 days",
 * "12 months", "3 months, 14 days".
 *
 * Counted in calendar days, so the hour a clock change adds or takes away never
 * makes Oct 1 → Jan 1 come out as 93. The end is the day the window stops, as
 * the date fields show it: Oct 1 → Oct 1 is exactly twelve months.
 */
export function formatSpanLength(start: Date, end: Date): string {
  const months = differenceInMonths(end, start);
  if (months < MONTHS_BEFORE_COUNTING_MONTHS) {
    return plural(differenceInCalendarDays(end, start), 'day');
  }

  const leftover = Math.max(0, differenceInCalendarDays(end, addMonths(start, months)));
  const label = plural(months, 'month');
  return leftover === 0 ? label : `${label}, ${plural(leftover, 'day')}`;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
