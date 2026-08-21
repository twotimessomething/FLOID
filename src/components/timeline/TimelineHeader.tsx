import { getQuarter } from 'date-fns';
import { useViewport } from '../../hooks/useViewport';
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

export function TimelineHeader(): JSX.Element {
  const { viewportBounds, pixelsPerDay, markerZoom } = useViewport();

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, markerZoom);
  const majorMarkers = markers.filter((marker) => !marker.isMinor);

  return (
    <div
      className="sticky top-0 bg-[var(--color-background)] z-50 select-none"
      style={{ height: HEADER_HEIGHT }}
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
      </div>
    </div>
  );
}
