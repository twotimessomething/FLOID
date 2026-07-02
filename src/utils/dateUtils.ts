import {
  differenceInDays,
  format,
  parseISO,
  addDays,
  addMonths,
  subMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isToday,
  getQuarter,
  min as dateMin,
  max as dateMax,
  getDay,
} from 'date-fns';
import type { ZoomLevel, Section, ViewportBounds, Phase } from '../types';
import { MILESTONE_SNAP_THRESHOLD } from '../constants/app';

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

/**
 * Computes the unified viewport bounds from all sections.
 * Returns min(all section starts) - 1 month to max(all section ends) + 1 month.
 * If no sections provided, defaults to current date ± 6 months.
 */
export const computeViewportBounds = (sections: readonly Section[]): ViewportBounds => {
  if (sections.length === 0) {
    const today = new Date();
    const startDate = subMonths(today, 6);
    const endDate = addMonths(today, 6);
    return {
      startDate,
      endDate,
      totalDays: differenceInDays(endDate, startDate),
    };
  }

  const startDates = sections.map((s) => parseISO(s.startDate));
  const endDates = sections.map((s) => parseISO(s.endDate));

  const minStart = dateMin(startDates);
  const maxEnd = dateMax(endDates);

  // Add 1 month padding on each side
  const startDate = subMonths(minStart, 1);
  const endDate = addMonths(maxEnd, 1);

  return {
    startDate,
    endDate,
    totalDays: differenceInDays(endDate, startDate),
  };
};

/**
 * Compute the union date range across all sections (no padding).
 * Returns null if there are no sections.
 */
export const getSectionsDateRange = (
  sections: readonly Section[]
): { startDate: string; endDate: string } | null => {
  if (sections.length === 0) return null;
  const minStart = dateMin(sections.map((s) => parseISO(s.startDate)));
  const maxEnd = dateMax(sections.map((s) => parseISO(s.endDate)));
  return { startDate: minStart.toISOString(), endDate: maxEnd.toISOString() };
};

/**
 * Remap a section's relative positions to a new date range so that every
 * phase and milestone keeps its absolute dates. Extending the range adds
 * empty space; items outside a shrunken range are clipped to its edges.
 * Tasks and bar milestones are positioned relative to their parent bar,
 * so they follow automatically.
 */
export const remapSectionToDateRange = (
  section: Section,
  newStartDate: string,
  newEndDate: string
): Pick<Section, 'phases' | 'milestones'> => ({
  phases: rescalePhases(section.phases, section.startDate, section.endDate, newStartDate, newEndDate),
  milestones: rescaleMilestones(section.milestones, section.startDate, section.endDate, newStartDate, newEndDate),
});

/**
 * Convert a section-relative position (0-1 within section) to a viewport-relative position (0-1 within viewport).
 */
export const sectionToViewportRelative = (
  sectionRelativePosition: number,
  section: Section,
  viewport: ViewportBounds
): number => {
  const sectionStart = parseISO(section.startDate);
  const sectionEnd = parseISO(section.endDate);
  const sectionDays = differenceInDays(sectionEnd, sectionStart);

  // Convert section-relative to absolute date
  const daysFromSectionStart = sectionRelativePosition * sectionDays;
  const absoluteDate = addDays(sectionStart, daysFromSectionStart);

  // Convert absolute date to viewport-relative
  const daysFromViewportStart = differenceInDays(absoluteDate, viewport.startDate);
  return viewport.totalDays > 0 ? daysFromViewportStart / viewport.totalDays : 0;
};

/**
 * Convert a viewport-relative position (0-1 within viewport) to a section-relative position (0-1 within section).
 */
export const viewportToSectionRelative = (
  viewportRelativePosition: number,
  section: Section,
  viewport: ViewportBounds
): number => {
  // Convert viewport-relative to absolute date
  const daysFromViewportStart = viewportRelativePosition * viewport.totalDays;
  const absoluteDate = addDays(viewport.startDate, daysFromViewportStart);

  // Convert absolute date to section-relative
  const sectionStart = parseISO(section.startDate);
  const sectionEnd = parseISO(section.endDate);
  const sectionDays = differenceInDays(sectionEnd, sectionStart);
  const daysFromSectionStart = differenceInDays(absoluteDate, sectionStart);

  return sectionDays > 0 ? daysFromSectionStart / sectionDays : 0;
};

/**
 * Get the viewport-relative position for today's date.
 */
export const getTodayViewportPosition = (viewport: ViewportBounds): number => {
  const today = new Date();
  const daysFromStart = differenceInDays(today, viewport.startDate);
  return viewport.totalDays > 0 ? daysFromStart / viewport.totalDays : 0;
};

/**
 * Check if today is within the viewport bounds.
 */
export const isTodayInViewport = (viewport: ViewportBounds): boolean => {
  const today = new Date();
  return today >= viewport.startDate && today <= viewport.endDate;
};

// =============================================================================
// Smart Weekend Snapping
// =============================================================================

/**
 * Check if a date falls on a weekend (Saturday or Sunday).
 */
export const isWeekend = (date: Date): boolean => {
  const day = getDay(date);
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
};

/**
 * Snap a date to the next business day if it falls on a weekend.
 * Saturday → Monday, Sunday → Monday.
 */
export const snapToNextBusinessDay = (date: Date): Date => {
  const day = getDay(date);
  if (day === 6) return addDays(date, 2); // Saturday → Monday
  if (day === 0) return addDays(date, 1); // Sunday → Monday
  return date;
};

/**
 * Snap a section-relative position to the next business day if it lands on a weekend.
 * Returns the original position if no snap is needed.
 */
export const snapRelativeToBusinessDay = (
  relativePosition: number,
  sectionStart: string,
  sectionEnd: string
): number => {
  const date = getDateFromRelativePosition(sectionStart, sectionEnd, relativePosition);
  const snapped = snapToNextBusinessDay(date);
  if (date.getTime() === snapped.getTime()) return relativePosition;
  return getRelativePositionFromDate(sectionStart, sectionEnd, snapped);
};

// =============================================================================
// Intelligent Milestone Gravity
// =============================================================================

/**
 * Find the nearest phase boundary within a threshold distance.
 * Returns the boundary position if found, null otherwise.
 */
export const findNearestPhaseBoundary = (
  relativePosition: number,
  phases: readonly Phase[],
  threshold: number = MILESTONE_SNAP_THRESHOLD
): number | null => {
  let nearestBoundary: number | null = null;
  let nearestDistance = threshold;

  for (const phase of phases) {
    // Check start boundary
    const startDistance = Math.abs(relativePosition - phase.relativeStart);
    if (startDistance < nearestDistance) {
      nearestDistance = startDistance;
      nearestBoundary = phase.relativeStart;
    }

    // Check end boundary
    const endDistance = Math.abs(relativePosition - phase.relativeEnd);
    if (endDistance < nearestDistance) {
      nearestDistance = endDistance;
      nearestBoundary = phase.relativeEnd;
    }
  }

  return nearestBoundary;
};

/**
 * Clamp a value between min and max.
 */
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Rescale phases when date range changes.
 * Converts absolute dates to new relative positions within the target range.
 * Preserves the visual appearance of the schedule when dates change.
 */
export const rescalePhases = (
  phases: readonly Phase[],
  oldStartDate: string,
  oldEndDate: string,
  newStartDate: string,
  newEndDate: string
): Phase[] => {
  const oldStart = parseISO(oldStartDate);
  const oldEnd = parseISO(oldEndDate);
  const newStart = parseISO(newStartDate);
  const newEnd = parseISO(newEndDate);

  const oldDays = differenceInDays(oldEnd, oldStart);
  const newDays = differenceInDays(newEnd, newStart);

  if (oldDays <= 0 || newDays <= 0) {
    return phases as Phase[];
  }

  return phases.map((phase) => {
    // Convert relative positions to absolute dates
    const phaseStartDate = addDays(oldStart, Math.round(phase.relativeStart * oldDays));
    const phaseEndDate = addDays(oldStart, Math.round(phase.relativeEnd * oldDays));

    // Convert absolute dates to new relative positions
    const newRelativeStart = clamp(differenceInDays(phaseStartDate, newStart) / newDays, 0, 1);
    const newRelativeEnd = clamp(differenceInDays(phaseEndDate, newStart) / newDays, 0, 1);

    // Rescale tasks within the phase
    const rescaledTasks = phase.tasks.map((task) => {
      // Tasks are relative to phase bounds - they don't need rescaling
      // since they stay relative to their parent phase
      return task;
    });

    return {
      ...phase,
      relativeStart: newRelativeStart,
      relativeEnd: newRelativeEnd,
      tasks: rescaledTasks,
    };
  });
};

/**
 * Rescale milestones when date range changes.
 */
export const rescaleMilestones = <T extends { relativePosition: number }>(
  milestones: readonly T[],
  oldStartDate: string,
  oldEndDate: string,
  newStartDate: string,
  newEndDate: string
): T[] => {
  const oldStart = parseISO(oldStartDate);
  const oldEnd = parseISO(oldEndDate);
  const newStart = parseISO(newStartDate);
  const newEnd = parseISO(newEndDate);

  const oldDays = differenceInDays(oldEnd, oldStart);
  const newDays = differenceInDays(newEnd, newStart);

  if (oldDays <= 0 || newDays <= 0) {
    return milestones as T[];
  }

  return milestones.map((milestone) => {
    // Convert relative position to absolute date
    const absoluteDate = addDays(oldStart, Math.round(milestone.relativePosition * oldDays));

    // Convert absolute date to new relative position
    const newRelativePosition = clamp(differenceInDays(absoluteDate, newStart) / newDays, 0, 1);

    return {
      ...milestone,
      relativePosition: newRelativePosition,
    };
  });
};

