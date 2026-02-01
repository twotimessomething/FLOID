import { useMemo } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { computeViewportBounds } from '../utils/dateUtils';
import { getTimelineWidth, getPixelsPerDay } from '../utils/timelineUtils';
import type { ViewportBounds } from '../types';

interface UseViewportResult {
  viewportBounds: ViewportBounds;
  timelineWidth: number;
  pixelsPerDay: number;
  totalDays: number;
}

export function useViewport(): UseViewportResult {
  const sections = useSectionStore((state) => state.sections);
  const zoomLevel = useUIStore((state) => state.zoomLevel);

  const viewportBounds = useMemo(
    () => computeViewportBounds(sections),
    [sections]
  );

  const pixelsPerDay = getPixelsPerDay(zoomLevel);
  const timelineWidth = getTimelineWidth(viewportBounds.totalDays, zoomLevel);

  return {
    viewportBounds,
    timelineWidth,
    pixelsPerDay,
    totalDays: viewportBounds.totalDays,
  };
}
