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
import { dayKeyDiff, fromDayKey, toDayKey, todayKey } from './dayKeys';

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
  const startKey = toDayKey(startDate);
  const endKey = toDayKey(endDate);

  return {
    startDate: fromDayKey(startKey),
    endDate: fromDayKey(endKey),
    startKey,
    endKey,
    totalDays: Math.max(1, dayKeyDiff(startKey, endKey)),
  };
};

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
