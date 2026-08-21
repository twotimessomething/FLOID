import { addDays } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useViewport } from '../../hooks/useViewport';
import { getPositionFromRelative, HEADER_HEIGHT } from '../../utils/timelineUtils';
import { formatDate } from '../../utils/dateUtils';

interface PlayheadProps {
  readonly height: number;
}

export function Playhead({ height }: PlayheadProps): JSX.Element | null {
  const { playheadPosition, playheadY } = useUIStore();
  const { viewportBounds, timelineWidth } = useViewport();

  if (playheadPosition === null) return null;

  const left = getPositionFromRelative(playheadPosition, timelineWidth);
  // Convert viewport-relative position to absolute date
  const daysFromStart = playheadPosition * viewportBounds.totalDays;
  const date = addDays(viewportBounds.startDate, Math.round(daysFromStart));
  const dateLabel = formatDate(date, 'MMM d, yyyy');

  // Position the label above the mouse (subtract header height since playheadY is relative to scroll container)
  const labelY = playheadY !== null ? Math.max(0, playheadY - HEADER_HEIGHT - 32) : 0;

  return (
    <div
      className="absolute top-0 z-40 pointer-events-none"
      style={{ left, height }}
    >
      {/* Vertical line - hairline weight, accent colored */}
      <div className="absolute top-0 bottom-0 w-px bg-[var(--color-accent)] -translate-x-1/2" />

      {/* Date label following the mouse - flat surface, no shadow or blur */}
      <div
        className="absolute left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[var(--color-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs font-medium rounded-[var(--radius-sm)] whitespace-nowrap"
        style={{ top: labelY }}
      >
        {dateLabel}
      </div>
    </div>
  );
}
