import { useMemo } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { computeViewportBounds, getSectionsDateRange } from '../utils/dateUtils';
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

  const viewportBounds = useMemo(
    () => computeViewportBounds(sections),
    [sections]
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
