import type { Section, ZoomLevel } from '../types';

// Pixels per day at each zoom level
export const ZOOM_PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 40,
  week: 20,
  month: 6,
  quarter: 2,
};

export const ROW_HEIGHT = 48;
export const TASK_ROW_HEIGHT = 28;
export const LABEL_COLUMN_WIDTH = 200;
export const HEADER_HEIGHT = 48;

export const getPixelsPerDay = (zoomLevel: ZoomLevel): number => {
  return ZOOM_PIXELS_PER_DAY[zoomLevel];
};

export const getTimelineWidth = (totalDays: number, zoomLevel: ZoomLevel): number => {
  return totalDays * getPixelsPerDay(zoomLevel);
};

export const getPositionFromRelative = (
  relativePosition: number,
  timelineWidth: number
): number => {
  return relativePosition * timelineWidth;
};

export const getRelativeFromPosition = (
  position: number,
  timelineWidth: number
): number => {
  if (timelineWidth <= 0) return 0;
  return Math.max(0, Math.min(1, position / timelineWidth));
};

export const getBarDimensions = (
  relativeStart: number,
  relativeEnd: number,
  timelineWidth: number
): { left: number; width: number } => {
  const left = getPositionFromRelative(relativeStart, timelineWidth);
  const right = getPositionFromRelative(relativeEnd, timelineWidth);
  return {
    left,
    width: Math.max(4, right - left), // Minimum 4px width
  };
};

export const clampRelativePosition = (
  value: number,
  min: number = 0,
  max: number = 1
): number => {
  return Math.max(min, Math.min(max, value));
};

export function calculateSectionHeight(section: Section): number {
  let height = ROW_HEIGHT;
  if (!section.isCollapsed) {
    section.phases.forEach((phase) => {
      height += ROW_HEIGHT;
      if (!phase.isCollapsed) {
        height += phase.tasks.length * TASK_ROW_HEIGHT;
      }
    });
  }
  return height;
}
