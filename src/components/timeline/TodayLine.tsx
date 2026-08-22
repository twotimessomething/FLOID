import type { ViewportBounds } from '../../types';
import { dayToX } from '../../utils/timelineUtils';
import { isTodayInViewport } from '../../utils/dateUtils';
import { todayKey } from '../../utils/dayKeys';

interface TodayLineProps {
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly height: number;
}

/**
 * Today, ruled down the sheet.
 *
 * Drawn once through the plot and again inside the sticky strip: the strip is
 * paper laid over a schedule's own row, and a rule that stopped at it would
 * read as two lines rather than one.
 */
export function TodayLine({ viewport, pixelsPerDay, height }: TodayLineProps): JSX.Element | null {
  if (!isTodayInViewport(viewport)) return null;

  return (
    <div
      className="absolute top-0 w-px bg-[var(--color-today)] z-20 pointer-events-none"
      style={{ left: dayToX(todayKey(), viewport, pixelsPerDay), height }}
      aria-hidden="true"
    />
  );
}
