import { useUIStore } from '../../stores/uiStore';
import type { ZoomLevel } from '../../types';

const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];

const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

export function ZoomControls() {
  const { zoomLevel, setZoomLevel, triggerScrollToToday } = useUIStore();

  const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);

  const handleZoomIn = () => {
    if (currentIndex > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  const handleZoomOut = () => {
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    }
  };

  const handleToday = () => {
    triggerScrollToToday();
  };

  return (
    <div className="flex items-center gap-1">
      {/* Today button */}
      <button
        onClick={handleToday}
        className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-black/5 rounded-md glass-bordered transition-colors duration-150"
      >
        Today
      </button>

      {/* Zoom controls group */}
      <div className="flex items-center rounded-md glass-bordered overflow-hidden">
        {/* Minus button */}
        <button
          onClick={handleZoomOut}
          disabled={currentIndex >= ZOOM_LEVELS.length - 1}
          className="px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-black/5 disabled:text-[var(--color-text-muted)] disabled:hover:bg-transparent transition-colors duration-150"
          aria-label="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        {/* Current zoom level text */}
        <span className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] border-l border-r border-white/20 min-w-[60px] text-center">
          {ZOOM_LABELS[zoomLevel]}
        </span>

        {/* Plus button */}
        <button
          onClick={handleZoomIn}
          disabled={currentIndex <= 0}
          className="px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-black/5 disabled:text-[var(--color-text-muted)] disabled:hover:bg-transparent transition-colors duration-150"
          aria-label="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
