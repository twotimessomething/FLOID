import { useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { useUIStore } from '../../stores/uiStore';
import { getTimeMarkers, getDaysBetween } from '../../utils/dateUtils';
import { getPositionFromRelative, ROW_HEIGHT, TASK_ROW_HEIGHT } from '../../utils/timelineUtils';
import { useMasterSection } from '../../hooks/useMasterSection';
import type { Section } from '../../types';

// Pure function hoisted outside component to avoid recreation on each render
function calculateSectionHeight(section: Section): number {
  let height = ROW_HEIGHT;
  if (!section.isCollapsed) {
    section.phases.forEach((phase) => {
      height += ROW_HEIGHT;
      if (!phase.isCollapsed && phase.tasks.length > 0) {
        height += phase.tasks.length * TASK_ROW_HEIGHT;
      }
    });
  }
  return height;
}

export function TimelineGrid() {
  const { viewportBounds, timelineWidth } = useViewport();
  const { zoomLevel } = useUIStore();
  const { masterSection, nonMasterSections } = useMasterSection();

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, zoomLevel);
  const totalDays = viewportBounds.totalDays;

  // Calculate total height for vertical gridlines (exact section height, no minimum)
  const sectionHeight = useMemo(() => {
    let height = 0;

    // Master section
    if (masterSection) {
      height += calculateSectionHeight(masterSection);
    }

    // Non-master sections
    nonMasterSections.forEach((section) => {
      height += calculateSectionHeight(section);
    });

    return height;
  }, [masterSection, nonMasterSections]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height: sectionHeight }}
    >
      {/* Vertical grid lines only - horizontal lines come from row components */}
      {markers.map((marker, index) => {
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
              borderColor: marker.isMinor ? 'var(--color-gridline-minor)' : 'var(--color-gridline-major)'
            }}
          />
        );
      })}
    </div>
  );
}
