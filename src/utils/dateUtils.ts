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
