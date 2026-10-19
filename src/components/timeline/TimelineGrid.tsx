import { useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { useProjectStore } from '../../stores/projectStore';
import { getTimeMarkers, weekendStartKeys } from '../../utils/dateUtils';
import { READABLE_DAY_PX, dayToX, sectionBoxHeight } from '../../utils/timelineUtils';
import { toDayKey } from '../../utils/dayKeys';
import { usePinnedSection } from '../../hooks/usePinnedSection';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';

/**
 * Weekends are washed in only once a day is wide enough to be read on its own
 * — the week axis and finer. Coarser than that a weekend is a few pixels, and
 * the sheet would stripe without saying anything.
 */
const WEEKEND_MIN_PIXELS_PER_DAY = READABLE_DAY_PX;
/** Hoisted: a fresh [] would re-render the bands for nothing. */
const NO_WEEKENDS: readonly number[] = [];

interface TimelineGridProps {
  /** Override the drawn height — the sticky strip rules its own short band. */
  readonly height?: number;
}

export function TimelineGrid({ height }: TimelineGridProps = {}): JSX.Element {
  const { viewportBounds, pixelsPerDay, markerZoom } = useViewport();
  const { pinnedSection, unpinnedSections } = usePinnedSection();
  const skipWeekends = useProjectStore(
    (s) => s.project?.settings?.skipWeekends ?? DEFAULT_PROJECT_SETTINGS.skipWeekends
  );

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, markerZoom);

  // With "skip weekends" on, bars square up past Saturday and Sunday; the
  // weekends themselves are what explains a bar landing on Monday, so they
  // are shown — and only then.
  const weekendLefts = useMemo(
    () =>
      skipWeekends && pixelsPerDay >= WEEKEND_MIN_PIXELS_PER_DAY
        ? weekendStartKeys(viewportBounds.startKey, viewportBounds.endKey).map((key) =>
            dayToX(key, viewportBounds, pixelsPerDay)
          )
        : NO_WEEKENDS,
    [skipWeekends, viewportBounds, pixelsPerDay]
  );

  // Calculate total height for vertical gridlines (exact section height, no minimum).
  // A caller that rules its own band has already decided the height — skip the walk.
  const contentHeight = useMemo(() => {
    if (height !== undefined) return 0;

    let total = 0;

    if (pinnedSection) {
      total += sectionBoxHeight(pinnedSection);
    }

    unpinnedSections.forEach((section) => {
      total += sectionBoxHeight(section);
    });

    return total;
  }, [height, pinnedSection, unpinnedSections]);

  const drawnHeight = height ?? contentHeight;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ height: drawnHeight }}>
      {/* A weekend is a gap in the working week, so it is drawn the way the
          gridlines are: lighter than the ground, a wash and never a rule. */}
      {weekendLefts.map((left) => (
        <div
          key={`weekend-${left}`}
          className="absolute top-0 bg-[var(--color-weekend)]"
          style={{ left, width: pixelsPerDay * 2, height: drawnHeight }}
        />
      ))}

      {/* Vertical grid lines only - horizontal lines come from row components.
          Only major markers render: minor lines are dropped entirely to keep
          the sheet reading as gaps in the paper, not rules drawn on it. */}
      {markers.map((marker, index) => {
        if (marker.isMinor) return null;

        const left = dayToX(toDayKey(marker.date), viewportBounds, pixelsPerDay);

        return (
          <div
            key={`col-${index}`}
            className="absolute top-0 border-l"
            style={{
              left,
              height: drawnHeight,
              borderColor: 'var(--color-gridline)',
            }}
          />
        );
      })}
    </div>
  );
}
