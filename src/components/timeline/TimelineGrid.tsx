import { useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { getTimeMarkers } from '../../utils/dateUtils';
import { calculateSectionHeight, dayToX } from '../../utils/timelineUtils';
import { toDayKey } from '../../utils/dayKeys';
import { usePinnedSection } from '../../hooks/usePinnedSection';

export function TimelineGrid(): JSX.Element {
  const { viewportBounds, pixelsPerDay, markerZoom } = useViewport();
  const { pinnedSection, unpinnedSections } = usePinnedSection();

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, markerZoom);

  // Calculate total height for vertical gridlines (exact section height, no minimum)
  const sectionHeight = useMemo(() => {
    let height = 0;

    if (pinnedSection) {
      height += calculateSectionHeight(pinnedSection);
    }

    unpinnedSections.forEach((section) => {
      height += calculateSectionHeight(section);
    });

    return height;
  }, [pinnedSection, unpinnedSections]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height: sectionHeight }}
    >
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
              height: sectionHeight,
              borderColor: 'var(--color-gridline)',
            }}
          />
        );
      })}
    </div>
  );
}
