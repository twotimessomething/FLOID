import { useMemo } from 'react';
import { useViewport } from '../../hooks/useViewport';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore, selectMasterSection, selectNonMasterSections } from '../../stores/sectionStore';
import { getTimeMarkers, getDaysBetween } from '../../utils/dateUtils';
import { getPositionFromRelative, ROW_HEIGHT, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';
import type { Section } from '../../types';

export default function TimelineGrid() {
  const { viewportBounds, timelineWidth } = useViewport();
  const { zoomLevel } = useUIStore();
  const masterSection = useSectionStore(selectMasterSection);
  const nonMasterSections = useSectionStore(selectNonMasterSections);

  const markers = getTimeMarkers(viewportBounds.startDate, viewportBounds.endDate, zoomLevel);
  const totalDays = viewportBounds.totalDays;

  // Calculate section height
  const calculateSectionHeight = (section: Section): number => {
    let height = ROW_HEIGHT;
    if (!section.isCollapsed) {
      section.phases.forEach((phase) => {
        height += ROW_HEIGHT;
        if (!phase.isCollapsed && phase.elements.length > 0) {
          height += phase.elements.length * ELEMENT_ROW_HEIGHT;
        }
      });
    }
    return height;
  };

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
            className={`absolute top-0 border-l ${
              marker.isMinor ? 'border-[var(--color-border)]/25' : 'border-[var(--color-border)]/50'
            }`}
            style={{ left, height: sectionHeight }}
          />
        );
      })}
    </div>
  );
}
