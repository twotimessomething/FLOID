import { ZOOM_PIXELS_PER_DAY } from './timelineUtils';
import type { ZoomLevel } from '../types';

/** Finest first, so zooming in walks the list backwards. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = ['day', 'week', 'month', 'quarter'];

export const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

/**
 * A fitted view sits between the named levels, so stepping out of one lands on
 * the nearest level in the direction asked for rather than on a remembered one.
 */
export function stepFromFit(fitPixelsPerDay: number, direction: 'in' | 'out'): ZoomLevel {
  if (direction === 'in') {
    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i -= 1) {
      if (ZOOM_PIXELS_PER_DAY[ZOOM_LEVELS[i]] > fitPixelsPerDay) return ZOOM_LEVELS[i];
    }
    return ZOOM_LEVELS[0];
  }
  for (let i = 0; i < ZOOM_LEVELS.length; i += 1) {
    if (ZOOM_PIXELS_PER_DAY[ZOOM_LEVELS[i]] < fitPixelsPerDay) return ZOOM_LEVELS[i];
  }
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
}
