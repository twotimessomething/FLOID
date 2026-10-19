import { useLayoutEffect, useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { useUIStore } from '../../stores/uiStore';
import {
  paintPlayhead,
  type PlayheadHandle,
  type PlayheadHoverProps,
} from '../../hooks/usePlayhead';
import { getHeaderAxis, isTodayInViewport } from '../../utils/dateUtils';
import type { AxisPeriod } from '../../utils/dateUtils';
import { HEADER_HEIGHT, dayToX } from '../../utils/timelineUtils';
import { toDayKey, todayKey } from '../../utils/dayKeys';
import type { ViewportBounds } from '../../types';

/** A period laid out on the sheet: where it starts, and how far it runs. */
interface AxisSpan {
  readonly key: string;
  readonly left: number;
  readonly width: number;
  readonly label: string;
}

interface TimelineHeaderProps {
  /** Hovering the axis is what raises the date ruler. */
  readonly playheadHover: PlayheadHoverProps;
  readonly playheadHandle: PlayheadHandle;
}

/** Periods laid end to end: each runs to where the next begins, the last to the sheet's end. */
function layOutPeriods(
  periods: readonly AxisPeriod[],
  viewport: ViewportBounds,
  pixelsPerDay: number,
  sheetWidth: number
): AxisSpan[] {
  const lefts = periods.map((period) => dayToX(toDayKey(period.date), viewport, pixelsPerDay));
  return periods.map((period, index) => ({
    key: toDayKey(period.date),
    left: lefts[index],
    width: (index + 1 < lefts.length ? lefts[index + 1] : sheetWidth) - lefts[index],
    label: period.label,
  }));
}

export function TimelineHeader({
  playheadHover,
  playheadHandle,
}: TimelineHeaderProps): JSX.Element {
  const { viewportBounds, pixelsPerDay, timelineWidth, markerZoom } = useViewport();
  const isPlayheadActive = useUIStore((state) => state.playheadPosition !== null);

  const { periods, years, days } = useMemo(() => {
    const axis = getHeaderAxis(viewportBounds.startDate, viewportBounds.endDate, markerZoom);
    return {
      periods: layOutPeriods(axis.periods, viewportBounds, pixelsPerDay, timelineWidth),
      years: layOutPeriods(axis.years, viewportBounds, pixelsPerDay, timelineWidth),
      days: layOutPeriods(axis.days, viewportBounds, pixelsPerDay, timelineWidth),
    };
  }, [viewportBounds, markerZoom, pixelsPerDay, timelineWidth]);

  // Painted here as well as in the ruler itself: the two mount together, and
  // whichever runs first has to find the date already under the cursor.
  useLayoutEffect(() => {
    if (isPlayheadActive) paintPlayhead(playheadHandle);
  }, [isPlayheadActive, playheadHandle]);

  return (
    <div
      className="sticky top-0 bg-[var(--color-background)] z-50 select-none"
      style={{ height: HEADER_HEIGHT }}
      onMouseMove={playheadHover.onMouseMove}
      onMouseLeave={playheadHover.onMouseLeave}
    >
      <div className="relative h-full pointer-events-none">
        {/* Each period is a box as wide as the period, and its name rides it
            the way a travelling bar label rides its bar: sticky against the
            plot's left edge, so the month the sheet is scrolled into — and the
            year under it — stays named until the next one arrives and pushes
            it out. Nothing is measured and nothing listens for scroll. The
            name stays a shrink-to-fit flow child: absolute positioning kills
            sticky, and a full-width one would have nowhere to travel. */}
        {periods.map((period) => (
          <div
            key={period.key}
            className="absolute top-2 pl-1"
            style={{ left: period.left, width: period.width }}
          >
            <span className="axis-label sticky left-1 block w-max">{period.label}</span>
          </div>
        ))}

        {years.map((year) => (
          <div
            key={year.key}
            className="absolute top-5 pl-1"
            style={{ left: year.left, width: year.width }}
          >
            <span className="axis-label sticky left-1 block w-max">{year.label}</span>
          </div>
        ))}

        {/* Day zoom numbers every column under its month, quieter than the
            month itself and with no rule of its own — the days are read off
            the axis, not drawn down the sheet. */}
        {days.map((day) => (
          <span
            key={day.key}
            className="absolute top-5 text-micro tabular-nums text-[var(--color-text-muted)]"
            style={{ left: day.left + 4 }}
          >
            {day.label}
          </span>
        ))}

        {/* The today marker names itself here on the axis rather than inside
            the plot, where a collapsed schedule's bars would sit under it. */}
        {isTodayInViewport(viewportBounds) && (
          <span
            className="axis-label absolute bottom-1.5 -translate-x-1/2 whitespace-nowrap text-[var(--color-today)]"
            style={{ left: dayToX(todayKey(), viewportBounds, pixelsPerDay) }}
          >
            Today
          </span>
        )}

        {/* The hovered date, hung from the foot of the axis so it caps the rule
            below it. It floats over the sheet, so it is the one thing here
            drawn on paper rather than in it — flat, no shadow. Its text and its
            position are written by usePlayhead, never by React. */}
        {isPlayheadActive && (
          <div
            ref={playheadHandle.readoutRef}
            className="absolute bottom-1 left-0 px-1.5 py-0.5 bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-meta tabular-nums text-[var(--color-text-primary)] whitespace-nowrap"
            style={{ willChange: 'transform' }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
