import { useTimeline } from '../../hooks/useTimeline';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { getTimeMarkers, getDaysBetween, getTodayPosition } from '../../utils/dateUtils';
import { getPositionFromRelative, ROW_HEIGHT, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';

export default function TimelineGrid() {
  const { projectStart, projectEnd, timelineWidth, project } = useTimeline();
  const { zoomLevel } = useUIStore();
  const { phases } = useTimelineStore();

  const markers = getTimeMarkers(projectStart, projectEnd, zoomLevel);
  const totalDays = getDaysBetween(projectStart, projectEnd);

  // Calculate total height based on phases and elements
  const calculateTotalHeight = () => {
    let height = 0;
    phases.forEach((phase) => {
      height += ROW_HEIGHT; // Phase row
      if (!phase.isCollapsed) {
        height += phase.elements.length * ELEMENT_ROW_HEIGHT; // Element rows
      }
    });
    return Math.max(height, 200); // Minimum height
  };

  const gridHeight = calculateTotalHeight();

  // Today's position
  const todayPosition = getTodayPosition(project.startDate, project.endDate);
  const todayLeft = getPositionFromRelative(todayPosition, timelineWidth);
  const showToday = todayPosition >= 0 && todayPosition <= 1;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height: gridHeight }}
    >
      {/* Vertical grid lines */}
      {markers.map((marker, index) => {
        const daysSinceStart = getDaysBetween(projectStart, marker.date);
        const relativePos = totalDays > 0 ? daysSinceStart / totalDays : 0;
        const left = getPositionFromRelative(relativePos, timelineWidth);

        return (
          <div
            key={index}
            className={`absolute top-0 bottom-0 border-l ${
              marker.isMinor ? 'border-gray-100' : 'border-gray-200'
            }`}
            style={{ left }}
          />
        );
      })}

      {/* Today line */}
      {showToday && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
          style={{ left: todayLeft }}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
        </div>
      )}
    </div>
  );
}
