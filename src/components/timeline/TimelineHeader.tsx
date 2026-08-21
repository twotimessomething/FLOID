import { useLayoutEffect, useMemo } from 'react';
import { getQuarter } from 'date-fns';
import { useViewport } from '../../hooks/useViewport';
import { useUIStore } from '../../stores/uiStore';
import {
  paintPlayhead,
  type PlayheadHandle,
  type PlayheadHoverProps,
} from '../../hooks/usePlayhead';
import {
  getTimeMarkers,
  formatDate,
  isTodayInViewport,
} from '../../utils/dateUtils';
import type { TimeMarker } from '../../utils/dateUtils';
import { HEADER_HEIGHT, dayToX } from '../../utils/timelineUtils';
import { toDayKey, todayKey } from '../../utils/dayKeys';
import type { ZoomLevel } from '../../types';

interface HeaderLabelParts {
  readonly primary: string;
  readonly year: string | null;
}

interface TimelineHeaderProps {
  /** Hovering the axis is what raises the date ruler. */
  readonly playheadHover: PlayheadHoverProps;
  readonly playheadHandle: PlayheadHandle;
}

/**
 * One label per major marker. The year is only ever shown where it changes
 * information — the first visible marker and any January — stacked as a
 * small second line under the primary label.
 */
function getHeaderLabelParts(marker: TimeMarker, zoomLevel: ZoomLevel, isFirst: boolean): HeaderLabelParts {
  const showYear = isFirst || marker.date.getMonth() === 0;
  const year = showYear ? formatDate(marker.date, 'yyyy') : null;

  if (zoomLevel === 'month') {
    return { primary: formatDate(marker.date, 'MMM'), year };
  }

  if (zoomLevel === 'quarter') {
    return { primary: `Q${getQuarter(marker.date)}`, year };
  }

  if (zoomLevel === 'day') {
    return { primary: formatDate(marker.date, 'MMM d'), year };
  }

  // Week markers already carry month context ("MMM d").
  return { primary: marker.label, year };
}

export function TimelineHeader({
  playheadHover,
  playheadHandle,
}: TimelineHeaderProps): JSX.Element {
  const { viewportBounds, pixelsPerDay, markerZoom } = useViewport();
  const isPlayheadActive = useUIStore((state) => state.playheadPosition !== null);

  const majorMarkers = useMemo(
    () =>
      getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, markerZoom).filter(
        (marker) => !marker.isMinor
      ),
    [viewportBounds.startDate, viewportBounds.endDate, markerZoom]
  );

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
        {majorMarkers.map((marker, index) => {
          const left = dayToX(toDayKey(marker.date), viewportBounds, pixelsPerDay);
          const { primary, year } = getHeaderLabelParts(marker, markerZoom, index === 0);

          return (
            <div
              key={index}
              className="absolute top-2 flex flex-col gap-0.5"
              style={{ left: left + 4 }}
            >
              <span className="axis-label">{primary}</span>
              {year && <span className="axis-label">{year}</span>}
            </div>
          );
        })}

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
