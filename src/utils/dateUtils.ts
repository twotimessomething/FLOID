import {
  addMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  getQuarter,
  isToday,
  parseISO,
  subMonths,
} from 'date-fns';
import type { Section, ViewportBounds, ZoomLevel } from '../types/timeline';
import { sectionsExtent } from './itemTree';
import { addDaysToKey, dayKeyDiff, fromDayKey, toDayKey, todayKey, type DayKey } from './dayKeys';

/**
 * Calendar helpers for the timeline axis.
 *
 * Item positions are absolute day keys, so nothing here converts between
 * coordinate spaces any more — the only mapping left is day → pixel, which
 * lives in `timelineUtils`.
 */

export const formatDate = (date: Date | string, formatStr = 'MMM d, yyyy'): string =>
  format(typeof date === 'string' ? parseISO(date) : date, formatStr);

export const formatDayKey = (key: string, formatStr = 'MMM d, yyyy'): string =>
  format(fromDayKey(key), formatStr);

/**
 * A day as briefly as it can be said without being misread: 'Mar 4' this
 * year, 'Mar 4, 2027' in any other, where the bare date would pass for this
 * year's.
 */
export const formatShortDay = (key: string): string =>
  formatDayKey(key, key.slice(0, 4) === todayKey().slice(0, 4) ? 'MMM d' : 'MMM d, yyyy');

export interface TimeMarker {
  date: Date;
  label: string;
  isMinor: boolean;
}

export const getTimeMarkers = (
  start: Date | string,
  end: Date | string,
  zoomLevel: ZoomLevel
): TimeMarker[] => {
  const startDate = typeof start === 'string' ? parseISO(start) : start;
  const endDate = typeof end === 'string' ? parseISO(end) : end;

  switch (zoomLevel) {
    case 'day': {
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      return days.map((date) => ({
        date,
        label: format(date, 'd'),
        isMinor: !isToday(date) && date.getDate() !== 1,
      }));
    }

    case 'week': {
      const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });
      return weeks.map((date) => ({ date, label: format(date, 'MMM d'), isMinor: false }));
    }

    case 'month': {
      const months = eachMonthOfInterval({ start: startDate, end: endDate });
      return months.map((date) => ({ date, label: format(date, 'MMM yyyy'), isMinor: false }));
    }

    case 'quarter': {
      const months = eachMonthOfInterval({ start: startDate, end: endDate });
      return months
        .filter((date) => date.getMonth() % 3 === 0)
        .map((date) => ({
          date,
          label: `Q${getQuarter(date)} ${format(date, 'yyyy')}`,
          isMinor: false,
        }));
    }

    default:
      return [];
  }
};

/** A run of the date axis: the day it begins on, and what it is called. */
export interface AxisPeriod {
  readonly date: Date;
  readonly label: string;
}

/** What the timeline's header prints, line by line. */
export interface HeaderAxis {
  /** First line: the zoom's periods, each named where it begins. */
  readonly periods: readonly AxisPeriod[];
  /**
   * Second line: the year, wherever it differs from the period before — and
   * on the first, so the sheet always says which year it opens in. Never on
   * every January, or on every week of one.
   */
  readonly years: readonly AxisPeriod[];
  /** Second line at day zoom, in place of years: every day's number. */
  readonly days: readonly AxisPeriod[];
}

/**
 * The header's two lines for a zoom. Day zoom names months on the first line
 * and numbers its days on the second, so the month carries its own year — a
 * day column has no room to stack one.
 */
export const getHeaderAxis = (start: Date, end: Date, zoomLevel: ZoomLevel): HeaderAxis => {
  if (zoomLevel === 'day') {
    return {
      periods: eachMonthOfInterval({ start, end }).map((date) => ({
        date,
        label: format(date, 'MMM yyyy'),
      })),
      years: [],
      days: getTimeMarkers(start, end, 'day').map(({ date, label }) => ({ date, label })),
    };
  }

  const periods = getTimeMarkers(start, end, zoomLevel).map(({ date, label }) => ({
    date,
    label:
      zoomLevel === 'month'
        ? format(date, 'MMM')
        : zoomLevel === 'quarter'
          ? `Q${getQuarter(date)}`
          : // Week markers already read as dates ("Mar 23")
            label,
  }));
  const years = periods
    .filter(
      (period, index) =>
        index === 0 || period.date.getFullYear() !== periods[index - 1].date.getFullYear()
    )
    .map(({ date }) => ({ date, label: format(date, 'yyyy') }));

  return { periods, years, days: [] };
};

/**
 * Where each weekend on the sheet begins: every Saturday before `endKey`,
 * starting from the one that covers `startKey` — a sheet that opens on a
 * Sunday opens halfway through a weekend.
 */
export const weekendStartKeys = (startKey: DayKey, endKey: DayKey): DayKey[] => {
  const weekday = fromDayKey(startKey).getDay();
  const keys: DayKey[] = [];
  for (
    let key = addDaysToKey(startKey, weekday === 0 ? -1 : 6 - weekday);
    key < endKey;
    key = addDaysToKey(key, 7)
  ) {
    keys.push(key);
  }
  return keys;
};

export const getMonthMarkers = (
  start: Date | string,
  end: Date | string
): { date: Date; label: string }[] => {
  const startDate = typeof start === 'string' ? parseISO(start) : start;
  const endDate = typeof end === 'string' ? parseISO(end) : end;
  return eachMonthOfInterval({ start: startDate, end: endDate }).map((date) => ({
    date,
    label: format(date, 'MMM'),
  }));
};

/** One mark on an export axis, whatever cadence chose it. */
export interface AxisMark {
  readonly date: Date;
  readonly label: string;
  /** Month-cadence marks carry the year where it changes information; finer
   * marks already read as dates and lean on a printed range elsewhere. */
  readonly wantsYear: boolean;
}

/**
 * Marks for an export axis — the slide's and the PNG's, so the two cannot
 * disagree about cadence. The cadence comes from the space a mark would get,
 * never from the zoom the user last picked, and runs finer as well as coarser:
 * days when the sheet is a few weeks wide, weeks when it is a few months (the
 * screen's own week markers), then the month ladder — months, quarters,
 * half-years, years. `unitsPerDay` and `minSpacing` share whatever unit the
 * caller draws in, points or pixels.
 */
export const getAxisMarks = (
  startKey: string,
  endKey: string,
  unitsPerDay: number,
  minSpacing: number
): AxisMark[] => {
  const start = fromDayKey(startKey);
  const end = fromDayKey(endKey);

  if (unitsPerDay >= minSpacing) {
    return getTimeMarkers(start, end, 'day').map((marker, index) => ({
      date: marker.date,
      label:
        index === 0 || marker.date.getDate() === 1 ? format(marker.date, 'MMM d') : marker.label,
      wantsYear: false,
    }));
  }

  // Week labels ("Mar 23") are wider than month labels, so they ask for more air
  if (unitsPerDay * 7 >= minSpacing * 1.5) {
    return getTimeMarkers(start, end, 'week').map((marker) => ({
      date: marker.date,
      label: marker.label,
      wantsYear: false,
    }));
  }

  const perMonth = unitsPerDay * 30.44;
  let step = 12;
  for (const candidate of [1, 3, 6, 12]) {
    if (perMonth * candidate >= minSpacing) {
      step = candidate;
      break;
    }
  }

  const marks: AxisMark[] = [];
  for (const marker of getMonthMarkers(start, end)) {
    if (step > 1 && marker.date.getMonth() % step !== 0) continue;
    marks.push(
      step >= 12
        ? { date: marker.date, label: format(marker.date, 'yyyy'), wantsYear: false }
        : { date: marker.date, label: marker.label, wantsYear: true }
    );
  }
  return marks;
};

/**
 * The window the timeline draws: everything every schedule holds — declared
 * range and item extents alike — plus a month of air on each side so there is
 * always somewhere to drag to.
 */
export const computeViewportBounds = (sections: readonly Section[]): ViewportBounds => {
  const extent = sectionsExtent(sections);

  const startDate = extent ? subMonths(fromDayKey(extent.start), 1) : subMonths(new Date(), 6);
  const endDate = extent ? addMonths(fromDayKey(extent.end), 1) : addMonths(new Date(), 6);
  return viewportFromKeys(toDayKey(startDate), toDayKey(endDate));
};

/** The bounds a span of day keys describes. */
export const viewportFromKeys = (startKey: string, endKey: string): ViewportBounds => ({
  startDate: fromDayKey(startKey),
  endDate: fromDayKey(endKey),
  startKey,
  endKey,
  totalDays: Math.max(1, dayKeyDiff(startKey, endKey)),
});

/** The union span of every schedule, with no padding. */
export const getSectionsDateRange = (
  sections: readonly Section[]
): { startDate: string; endDate: string } | null => {
  const extent = sectionsExtent(sections);
  return extent ? { startDate: extent.start, endDate: extent.end } : null;
};

export const isTodayInViewport = (viewport: ViewportBounds): boolean => {
  const today = todayKey();
  return today >= viewport.startKey && today <= viewport.endKey;
};
