import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pinchedPixelsPerDay, wheelZoomFactor } from '../hooks/usePinchZoom';
import { pixelsPerDayOf } from '../hooks/useViewport';
import { COMMANDS } from '../commands/commands';
import { DEFAULT_LABEL_WIDTH, parseStoredView, useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import {
  MAX_FIT_PIXELS_PER_DAY,
  MIN_FIT_PIXELS_PER_DAY,
  ZOOM_PIXELS_PER_DAY,
} from '../utils/timelineUtils';
import type { Project, Section } from '../types';

function section(startDate: string, endDate: string): Section {
  return {
    id: 's1',
    name: 's1',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate,
    endDate,
    items: [],
    color: '#333333',
    isCollapsed: false,
  };
}

const PROJECT = {
  id: 'p1',
  name: 'Project',
  pinnedSectionId: null,
  projectStartDate: '2026-01-01',
  projectEndDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies Project;

describe('wheelZoomFactor', () => {
  it('zooms in for an upward wheel and out for a downward one', () => {
    expect(wheelZoomFactor(-10, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(0, 0)).toBe(1);
  });

  it('undoes itself: a pinch out and back in lands where it started', () => {
    expect(wheelZoomFactor(12, 0) * wheelZoomFactor(-12, 0)).toBeCloseTo(1, 10);
  });

  it('holds a mouse wheel notch to a step, however it is reported', () => {
    const cap = wheelZoomFactor(50, 0);
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(cap, 10);
    // Firefox reports a notch in lines, and the odd device in pages
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0), 10);
    expect(wheelZoomFactor(1, 2)).toBeCloseTo(cap, 10);
  });
});

describe('pinchedPixelsPerDay', () => {
  it('scales freely between the named levels', () => {
    expect(pinchedPixelsPerDay(ZOOM_PIXELS_PER_DAY.month, 1.5)).toBeCloseTo(9, 10);
  });

  it('keeps within the bounds a fit keeps', () => {
    expect(pinchedPixelsPerDay(MAX_FIT_PIXELS_PER_DAY, 2)).toBe(MAX_FIT_PIXELS_PER_DAY);
    expect(pinchedPixelsPerDay(MIN_FIT_PIXELS_PER_DAY, 0.5)).toBe(MIN_FIT_PIXELS_PER_DAY);
  });
});

describe('pixelsPerDayOf', () => {
  it('prefers a free scale over the picked level', () => {
    expect(pixelsPerDayOf({ zoomLevel: 'week', fitPixelsPerDay: null })).toBe(ZOOM_PIXELS_PER_DAY.week);
    expect(pixelsPerDayOf({ zoomLevel: 'week', fitPixelsPerDay: 7 })).toBe(7);
  });
});

describe('uiStore free scale', () => {
  beforeEach(() => {
    useUIStore.setState({
      zoomLevel: 'month',
      fitPixelsPerDay: null,
      isFitted: false,
      timelineViewportWidth: 1000,
    });
    useSectionStore.setState({ sections: [section('2026-01-01', '2026-12-31')] });
  });

  it('names a fit, but not a pinch', () => {
    useUIStore.getState().zoomToFit();
    expect(useUIStore.getState().isFitted).toBe(true);

    useUIStore.getState().setPixelsPerDay(9);
    expect(useUIStore.getState().fitPixelsPerDay).toBe(9);
    expect(useUIStore.getState().isFitted).toBe(false);
  });

  it('steps from a pinch to the nearest level that way', () => {
    useUIStore.getState().setPixelsPerDay(9);
    useUIStore.getState().zoomIn();
    expect(useUIStore.getState().zoomLevel).toBe('week');
    expect(useUIStore.getState().fitPixelsPerDay).toBeNull();
  });

  it('a picked level clears a fit', () => {
    useUIStore.getState().zoomToFit();
    useUIStore.getState().setZoomLevel('day');
    expect(useUIStore.getState().isFitted).toBe(false);
    expect(useUIStore.getState().fitPixelsPerDay).toBeNull();
  });
});

describe('stored view', () => {
  it('reads back what was written', () => {
    expect(
      parseStoredView(JSON.stringify({ zoomLevel: 'week', pixelsPerDay: 9, labelColumnWidth: 300 }))
    ).toEqual({ zoomLevel: 'week', pixelsPerDay: 9, labelColumnWidth: 300 });
  });

  it('falls back field by field on anything it cannot use', () => {
    expect(parseStoredView(null)).toEqual({
      zoomLevel: 'month',
      pixelsPerDay: null,
      labelColumnWidth: DEFAULT_LABEL_WIDTH,
    });
    expect(parseStoredView('not json')).toEqual(parseStoredView(null));
    expect(parseStoredView('42')).toEqual(parseStoredView(null));
    expect(
      parseStoredView(JSON.stringify({ zoomLevel: 'decade', pixelsPerDay: 1e6, labelColumnWidth: 'x' }))
    ).toEqual(parseStoredView(null));
  });

  it('clamps a column width that no longer fits the bounds', () => {
    expect(parseStoredView(JSON.stringify({ labelColumnWidth: 5000 })).labelColumnWidth).toBe(400);
    expect(parseStoredView(JSON.stringify({ labelColumnWidth: 10 })).labelColumnWidth).toBe(120);
  });

  it('is written as the view changes', () => {
    useUIStore.getState().setZoomLevel('quarter');
    useUIStore.getState().setLabelColumnWidth(310);
    expect(parseStoredView(localStorage.getItem('floid-view'))).toMatchObject({
      zoomLevel: 'quarter',
      pixelsPerDay: null,
      labelColumnWidth: 310,
    });
  });

  it('opens the next launch on it', async () => {
    localStorage.setItem(
      'floid-view',
      JSON.stringify({ zoomLevel: 'day', pixelsPerDay: 11, labelColumnWidth: 333 })
    );
    vi.resetModules();
    const { useUIStore: freshStore } = await import('../stores/uiStore');
    const state = freshStore.getState();
    expect(state.zoomLevel).toBe('day');
    expect(state.fitPixelsPerDay).toBe(11);
    // A fit belongs to the sheet it was made for; it comes back as a scale
    expect(state.isFitted).toBe(false);
    expect(state.labelColumnWidth).toBe(333);
  });
});

describe('Go to Today', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    useProjectStore.setState({ project: PROJECT });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is enabled while today is on the sheet', () => {
    useSectionStore.setState({ sections: [section('2026-03-01', '2026-09-30')] });
    expect(COMMANDS['view.today'].isEnabled?.()).toBe(true);
  });

  it('is disabled for a project wholly in the past', () => {
    useSectionStore.setState({ sections: [section('2024-01-01', '2024-06-30')] });
    expect(COMMANDS['view.today'].isEnabled?.()).toBe(false);
  });
});
