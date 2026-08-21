import { useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { useUIStore } from '../../stores/uiStore';
import { getTimeMarkers, getDaysBetween } from '../../utils/dateUtils';
import { getPositionFromRelative, calculateSectionHeight } from '../../utils/timelineUtils';
import { usePinnedSection } from '../../hooks/usePinnedSection';

export function TimelineGrid(): JSX.Element {
  const { viewportBounds, timelineWidth } = useViewport();
  const { zoomLevel } = useUIStore();
  const { pinnedSection, unpinnedSections } = usePinnedSection();

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, zoomLevel);
  const totalDays = viewportBounds.totalDays;

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

        const daysSinceStart = getDaysBetween(viewportBounds.startDate, marker.date);
        const relativePos = totalDays > 0 ? daysSinceStart / totalDays : 0;
        const left = getPositionFromRelative(relativePos, timelineWidth);

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
