import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useViewport } from '../../hooks/useViewport';
import { ZOOM_PIXELS_PER_DAY, getFitPixelsPerDay } from '../../utils/timelineUtils';
import type { ZoomLevel } from '../../types';

/** Finest first, so zooming in walks the list backwards. */
const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];

const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

/**
 * A fitted view sits between the named levels, so stepping out of one lands on
 * the nearest level in the direction asked for rather than on a remembered one.
 */
function stepFromFit(fitPixelsPerDay: number, direction: 'in' | 'out'): ZoomLevel {
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

const STEP_CLASS =
  'p-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:hover:text-[var(--color-text-secondary)] transition-colors duration-150';

export function ZoomControls(): JSX.Element {
  const zoomLevel = useUIStore((state) => state.zoomLevel);
  const setZoomLevel = useUIStore((state) => state.setZoomLevel);
  const fitPixelsPerDay = useUIStore((state) => state.fitPixelsPerDay);
  const setFitPixelsPerDay = useUIStore((state) => state.setFitPixelsPerDay);
  const timelineViewportWidth = useUIStore((state) => state.timelineViewportWidth);
  const triggerScrollToToday = useUIStore((state) => state.triggerScrollToToday);

  const { totalDays, markerZoom } = useViewport();

  const isFit = fitPixelsPerDay !== null;
  const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
  const canFit = timelineViewportWidth > 0 && totalDays > 0;

  const handleZoomIn = useCallback((): void => {
    if (fitPixelsPerDay !== null) {
      setZoomLevel(stepFromFit(fitPixelsPerDay, 'in'));
      return;
    }
    const index = ZOOM_LEVELS.indexOf(useUIStore.getState().zoomLevel);
    if (index > 0) setZoomLevel(ZOOM_LEVELS[index - 1]);
  }, [fitPixelsPerDay, setZoomLevel]);

  const handleZoomOut = useCallback((): void => {
    if (fitPixelsPerDay !== null) {
      setZoomLevel(stepFromFit(fitPixelsPerDay, 'out'));
      return;
    }
    const index = ZOOM_LEVELS.indexOf(useUIStore.getState().zoomLevel);
    if (index < ZOOM_LEVELS.length - 1) setZoomLevel(ZOOM_LEVELS[index + 1]);
  }, [fitPixelsPerDay, setZoomLevel]);

  const handleFit = useCallback((): void => {
    const fitted = getFitPixelsPerDay(totalDays, timelineViewportWidth);
    if (fitted === null) return;
    setFitPixelsPerDay(fitted);
  }, [totalDays, timelineViewportWidth, setFitPixelsPerDay]);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={triggerScrollToToday}
        className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
      >
        Today
      </button>

      {/* One control, one box: minus and plus step the named levels, and the
          scale between them is the fit — it reads as the current scale and
          offers Fit on hover, so the header keeps a single view control
          instead of a row of look-alike text links. */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 border border-[var(--color-border)]">
        <button
          onClick={handleZoomOut}
          disabled={!isFit && currentIndex >= ZOOM_LEVELS.length - 1}
          className={STEP_CLASS}
          aria-label="Zoom out"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <button
          onClick={handleFit}
          disabled={!canFit}
          title="Fit the whole timeline on screen"
          aria-label="Fit timeline to screen"
          className={`group relative h-4 min-w-[56px] text-[13px] leading-4 text-center transition-colors duration-150 disabled:opacity-30 ${
            isFit ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
          }`}
        >
          <span className={isFit ? '' : 'transition-opacity duration-150 group-hover:opacity-0'}>
            {isFit ? 'Fit' : ZOOM_LABELS[markerZoom]}
          </span>
          {!isFit && (
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 text-[var(--color-text-primary)]">
              Fit
            </span>
          )}
        </button>

        <button
          onClick={handleZoomIn}
          disabled={!isFit && currentIndex <= 0}
          className={STEP_CLASS}
          aria-label="Zoom in"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
