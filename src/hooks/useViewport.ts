import { useMemo } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import {
  computeViewportBounds,
  getSectionsDateRange,
  viewportFromKeys,
} from '../utils/dateUtils';
import { getPixelsPerDay, zoomLevelForPixelsPerDay } from '../utils/timelineUtils';
import type { ViewportBounds, ZoomLevel } from '../types';

interface UseViewportResult {
  viewportBounds: ViewportBounds;
  timelineWidth: number;
  pixelsPerDay: number;
  totalDays: number;
  /** The level the axis is labelled on — the picked one, or the fit's nearest. */
  markerZoom: ZoomLevel;
  /**
   * The first day anything is actually drawn on, before the viewport's month
   * of padding. `null` when the project is empty.
   */
  contentStartKey: string | null;
}

export function useViewport(): UseViewportResult {
  const sections = useSectionStore((state) => state.sections);
  const zoomLevel = useUIStore((state) => state.zoomLevel);
  const fitPixelsPerDay = useUIStore((state) => state.fitPixelsPerDay);

  // Every edit makes a new `sections`, but most leave the sheet's span alone.
  // Bounds are handed to every row on the sheet, so they are rebuilt only when
  // the span itself moves: a drop that re-renders two schedules should not
  // re-render every row of every schedule because of a fresh, equal object.
  const { startKey, endKey } = useMemo(() => {
    const bounds = computeViewportBounds(sections);
    return { startKey: bounds.startKey, endKey: bounds.endKey };
  }, [sections]);
  const viewportBounds = useMemo(
    () => viewportFromKeys(startKey, endKey),
    [startKey, endKey]
  );

  const contentStartKey = useMemo(
    () => getSectionsDateRange(sections)?.startDate ?? null,
    [sections]
  );

  const pixelsPerDay = fitPixelsPerDay ?? getPixelsPerDay(zoomLevel);
  const timelineWidth = viewportBounds.totalDays * pixelsPerDay;
  const markerZoom = fitPixelsPerDay === null ? zoomLevel : zoomLevelForPixelsPerDay(fitPixelsPerDay);

  return {
    viewportBounds,
    timelineWidth,
    pixelsPerDay,
    totalDays: viewportBounds.totalDays,
    markerZoom,
    contentStartKey,
  };
}
