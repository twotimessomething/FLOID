import { useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { getTimeMarkers } from '../../utils/dateUtils';
import { dayToX, sectionBoxHeight } from '../../utils/timelineUtils';
import { toDayKey } from '../../utils/dayKeys';
import { usePinnedSection } from '../../hooks/usePinnedSection';

interface TimelineGridProps {
  /** Override the drawn height — the sticky strip rules its own short band. */
  readonly height?: number;
}

export function TimelineGrid({ height }: TimelineGridProps = {}): JSX.Element {
  const { viewportBounds, pixelsPerDay, markerZoom } = useViewport();
  const { pinnedSection, unpinnedSections } = usePinnedSection();

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, markerZoom);

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
