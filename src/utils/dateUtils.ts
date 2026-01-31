import {
  differenceInDays,
  format,
  parseISO,
  addDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isToday,
  getQuarter,
} from 'date-fns';
import type { ZoomLevel } from '../types';

export const parseDate = (dateString: string): Date => {
  return parseISO(dateString);
};

export const formatDate = (date: Date | string, formatStr: string = 'MMM d, yyyy'): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
};

export const getDaysBetween = (start: Date | string, end: Date | string): number => {
  const startDate = typeof start === 'string' ? parseISO(start) : start;
  const endDate = typeof end === 'string' ? parseISO(end) : end;
  return differenceInDays(endDate, startDate);
};

export const getDateFromRelativePosition = (
  projectStart: string,
  projectEnd: string,
  relativePosition: number
): Date => {
  const start = parseISO(projectStart);
  const end = parseISO(projectEnd);
  const totalDays = differenceInDays(end, start);
  const daysFromStart = Math.round(totalDays * relativePosition);
  return addDays(start, daysFromStart);
};

export const getRelativePositionFromDate = (
  projectStart: string,
  projectEnd: string,
  date: Date
): number => {
  const start = parseISO(projectStart);
  const end = parseISO(projectEnd);
  const totalDays = differenceInDays(end, start);
  const daysFromStart = differenceInDays(date, start);
  return totalDays > 0 ? daysFromStart / totalDays : 0;
};

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
      return weeks.map((date) => ({
        date,
        label: format(date, 'MMM d'),
        isMinor: false,
      }));
    }

    case 'month': {
      const months = eachMonthOfInterval({ start: startDate, end: endDate });
      return months.map((date) => ({
        date,
        label: format(date, 'MMM yyyy'),
        isMinor: false,
      }));
    }

    case 'quarter': {
      const months = eachMonthOfInterval({ start: startDate, end: endDate });
      const quarters = months.filter((date) => date.getMonth() % 3 === 0);
      return quarters.map((date) => ({
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

  const months = eachMonthOfInterval({ start: startDate, end: endDate });
  return months.map((date) => ({
    date,
    label: format(date, 'MMM'),
  }));
};

export const isTodayInRange = (start: string, end: string): boolean => {
  const today = new Date();
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  return today >= startDate && today <= endDate;
};

export const getTodayPosition = (start: string, end: string): number => {
  const today = new Date();
  return getRelativePositionFromDate(start, end, today);
};
