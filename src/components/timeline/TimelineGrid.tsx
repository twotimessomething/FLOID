import { useMemo } from 'react';
import { useTimeline } from '../../hooks/useTimeline';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore, selectIDTimeline, selectTeams } from '../../stores/sectionStore';
import { getTimeMarkers, getDaysBetween, getTodayPosition } from '../../utils/dateUtils';
import { getPositionFromRelative, ROW_HEIGHT, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';

export default function TimelineGrid() {
  const { projectStart, projectEnd, timelineWidth, project } = useTimeline();
  const { zoomLevel } = useUIStore();
  const idTimeline = useSectionStore(selectIDTimeline);
  const teams = useSectionStore(selectTeams);

  const markers = getTimeMarkers(projectStart, projectEnd, zoomLevel);
  const totalDays = getDaysBetween(projectStart, projectEnd);

  // Calculate total height for vertical gridlines
  const gridHeight = useMemo(() => {
    let height = 0;

    // ID Timeline section
    if (idTimeline) {
      height += ROW_HEIGHT;
      if (!idTimeline.isCollapsed) {
        idTimeline.phases.forEach((phase) => {
          height += ROW_HEIGHT;
          if (!phase.isCollapsed && phase.elements.length > 0) {
            height += phase.elements.length * ELEMENT_ROW_HEIGHT;
          }
        });
      }
    }

    // Teams
    teams.forEach((team) => {
      height += ROW_HEIGHT;
      if (!team.isCollapsed) {
        team.phases.forEach((teamPhase) => {
          height += ROW_HEIGHT;
          if (!teamPhase.isCollapsed && teamPhase.elements.length > 0) {
            height += teamPhase.elements.length * ELEMENT_ROW_HEIGHT;
          }
        });
      }
    });

    return Math.max(height, 200);
  }, [idTimeline, teams]);

  // Today's position
  const todayPosition = getTodayPosition(project.startDate, project.endDate);
  const todayLeft = getPositionFromRelative(todayPosition, timelineWidth);
  const showToday = todayPosition >= 0 && todayPosition <= 1;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height: gridHeight }}
    >
      {/* Vertical grid lines only - horizontal lines come from row components */}
      {markers.map((marker, index) => {
        const daysSinceStart = getDaysBetween(projectStart, marker.date);
        const relativePos = totalDays > 0 ? daysSinceStart / totalDays : 0;
        const left = getPositionFromRelative(relativePos, timelineWidth);

        return (
          <div
            key={`col-${index}`}
            className={`absolute top-0 border-l ${
              marker.isMinor ? 'border-[var(--color-border)]/25' : 'border-[var(--color-border)]/50'
            }`}
            style={{ left, height: gridHeight }}
          />
        );
      })}

      {/* Today line */}
      {showToday && (
        <div
          className="absolute top-0 w-0.5 bg-red-500 z-20"
          style={{ left: todayLeft, height: gridHeight }}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
        </div>
      )}
    </div>
  );
}
