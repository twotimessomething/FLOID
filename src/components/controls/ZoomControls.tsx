import { useUIStore } from '../../stores/uiStore';
import type { ZoomLevel } from '../../types';

const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];

const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

export function ZoomControls(): JSX.Element {
  const { zoomLevel, setZoomLevel, triggerScrollToToday } = useUIStore();

  const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);

  const handleZoomIn = (): void => {
    if (currentIndex > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  const handleZoomOut = (): void => {
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    }
  };

  const handleToday = (): void => {
    triggerScrollToToday();
  };

  return (
    <div className="flex items-center gap-3">
      {/* Today button */}
      <button
        onClick={handleToday}
        className="axis-label hover:text-[var(--color-text-primary)] transition-colors duration-150"
      >
        Today
      </button>

      {/* Zoom controls group */}
      <div className="flex items-center gap-1">
        {/* Minus button */}
        <button
          onClick={handleZoomOut}
          disabled={currentIndex >= ZOOM_LEVELS.length - 1}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:hover:text-[var(--color-text-muted)] transition-colors duration-150"
          aria-label="Zoom out"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        {/* Current zoom level text */}
        <span className="axis-label min-w-[44px] text-center">
          {ZOOM_LABELS[zoomLevel]}
        </span>

        {/* Plus button */}
        <button
          onClick={handleZoomIn}
          disabled={currentIndex <= 0}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:hover:text-[var(--color-text-muted)] transition-colors duration-150"
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
