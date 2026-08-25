import { useUIStore } from '../../stores/uiStore';
import { useViewport } from '../../hooks/useViewport';
import { ZOOM_LEVELS, ZOOM_LABELS } from '../../utils/zoomSteps';

const STEP_CLASS =
  'p-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:hover:text-[var(--color-text-secondary)] transition-colors duration-fast';

export function ZoomControls(): JSX.Element {
  const zoomLevel = useUIStore((state) => state.zoomLevel);
  const fitPixelsPerDay = useUIStore((state) => state.fitPixelsPerDay);
  const timelineViewportWidth = useUIStore((state) => state.timelineViewportWidth);
  const zoomIn = useUIStore((state) => state.zoomIn);
  const zoomOut = useUIStore((state) => state.zoomOut);
  const zoomToFit = useUIStore((state) => state.zoomToFit);
  const triggerScrollToToday = useUIStore((state) => state.triggerScrollToToday);

  const { totalDays, markerZoom } = useViewport();

  const isFit = fitPixelsPerDay !== null;
  const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
  const canFit = timelineViewportWidth > 0 && totalDays > 0;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={triggerScrollToToday}
        className="text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-fast"
      >
        Today
      </button>

      {/* One control, one box: minus and plus step the named levels, and the
          scale between them is the fit — it reads as the current scale and
          offers Fit on hover, so the header keeps a single view control
          instead of a row of look-alike text links. */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 border border-[var(--color-border)]">
        <button
          onClick={zoomOut}
          disabled={!isFit && currentIndex >= ZOOM_LEVELS.length - 1}
          className={STEP_CLASS}
          aria-label="Zoom out"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <button
          onClick={zoomToFit}
          disabled={!canFit}
          title="Fit the whole timeline on screen"
          aria-label="Fit timeline to screen"
          className={`group relative h-4 min-w-[56px] text-body leading-4 text-center transition-colors duration-fast disabled:opacity-30 ${
            isFit ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
          }`}
        >
          <span className={isFit ? '' : 'transition-opacity duration-fast group-hover:opacity-0'}>
            {isFit ? 'Fit' : ZOOM_LABELS[markerZoom]}
          </span>
          {!isFit && (
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-fast group-hover:opacity-100 text-[var(--color-text-primary)]">
              Fit
            </span>
          )}
        </button>

        <button
          onClick={zoomIn}
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
