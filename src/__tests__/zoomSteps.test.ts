import { describe, it, expect, beforeEach } from 'vitest';
import { ZOOM_LEVELS, stepFromFit } from '../utils/zoomSteps';
import { ZOOM_PIXELS_PER_DAY } from '../utils/timelineUtils';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import type { Section } from '../types';

describe('stepFromFit', () => {
  it('steps in to the nearest level denser than the fit', () => {
    // 10 px/day sits between week (20) and month (6)
    expect(stepFromFit(10, 'in')).toBe('week');
    expect(stepFromFit(10, 'out')).toBe('month');
  });

  it('clamps at the ends of the scale', () => {
    expect(stepFromFit(ZOOM_PIXELS_PER_DAY.day + 10, 'in')).toBe('day');
    expect(stepFromFit(ZOOM_PIXELS_PER_DAY.quarter - 1, 'out')).toBe('quarter');
  });

  it('steps past a level the fit already matches exactly', () => {
    expect(stepFromFit(ZOOM_PIXELS_PER_DAY.week, 'in')).toBe('day');
    expect(stepFromFit(ZOOM_PIXELS_PER_DAY.week, 'out')).toBe('month');
  });
});

function section(id: string): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items: [],
    color: '#333333',
    isCollapsed: false,
  };
}

describe('uiStore zoom actions', () => {
  beforeEach(() => {
    useUIStore.setState({ zoomLevel: 'month', fitPixelsPerDay: null, timelineViewportWidth: 0 });
    useSectionStore.setState({ sections: [section('s1')] });
  });

  it('zoomIn and zoomOut walk the named levels', () => {
    useUIStore.getState().zoomIn();
    expect(useUIStore.getState().zoomLevel).toBe('week');
    useUIStore.getState().zoomOut();
    useUIStore.getState().zoomOut();
    expect(useUIStore.getState().zoomLevel).toBe('quarter');
  });

  it('stops at the ends of the scale', () => {
    useUIStore.setState({ zoomLevel: ZOOM_LEVELS[0] });
    useUIStore.getState().zoomIn();
    expect(useUIStore.getState().zoomLevel).toBe(ZOOM_LEVELS[0]);
    useUIStore.setState({ zoomLevel: ZOOM_LEVELS[ZOOM_LEVELS.length - 1] });
    useUIStore.getState().zoomOut();
    expect(useUIStore.getState().zoomLevel).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });

  it('stepping out of a fitted view picks a level and clears the fit', () => {
    useUIStore.setState({ fitPixelsPerDay: 10 });
    useUIStore.getState().zoomIn();
    expect(useUIStore.getState().zoomLevel).toBe('week');
    expect(useUIStore.getState().fitPixelsPerDay).toBeNull();
  });

  it('zoomToFit scales to the measured viewport, and refuses without one', () => {
    useUIStore.getState().zoomToFit();
    expect(useUIStore.getState().fitPixelsPerDay).toBeNull();

    useUIStore.setState({ timelineViewportWidth: 1000 });
    useUIStore.getState().zoomToFit();
    expect(useUIStore.getState().fitPixelsPerDay).not.toBeNull();
  });
});
