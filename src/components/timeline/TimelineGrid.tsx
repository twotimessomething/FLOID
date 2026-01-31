import { useMemo } from 'react';
import { useTimeline } from '../../hooks/useTimeline';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTeamStore } from '../../stores/teamStore';
import { getTimeMarkers, getDaysBetween, getTodayPosition } from '../../utils/dateUtils';
import { getPositionFromRelative, ROW_HEIGHT, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';

interface RowInfo {
  top: number;
  height: number;
  isSection: boolean;
}

export default function TimelineGrid() {
  const { projectStart, projectEnd, timelineWidth, project } = useTimeline();
  const { zoomLevel, isIDTimelineCollapsed } = useUIStore();
  const { phases } = useTimelineStore();
  const { teams } = useTeamStore();

  const markers = getTimeMarkers(projectStart, projectEnd, zoomLevel);
  const totalDays = getDaysBetween(projectStart, projectEnd);

  // Calculate total height and row positions for horizontal gridlines
  const { gridHeight, rows } = useMemo(() => {
    const rowList: RowInfo[] = [];
    let currentTop = 0;

    // Industrial Design section header
    rowList.push({ top: currentTop, height: ROW_HEIGHT, isSection: true });
    currentTop += ROW_HEIGHT;

    // ID phases and elements (when expanded)
    if (!isIDTimelineCollapsed) {
      phases.forEach((phase) => {
        rowList.push({ top: currentTop, height: ROW_HEIGHT, isSection: false });
        currentTop += ROW_HEIGHT;
        if (!phase.isCollapsed && phase.elements.length > 0) {
          phase.elements.forEach(() => {
            rowList.push({ top: currentTop, height: ELEMENT_ROW_HEIGHT, isSection: false });
            currentTop += ELEMENT_ROW_HEIGHT;
          });
        }
      });
    }

    // Teams
    teams.forEach((team) => {
      rowList.push({ top: currentTop, height: ROW_HEIGHT, isSection: true });
      currentTop += ROW_HEIGHT;
      if (!team.isCollapsed) {
        team.phases.forEach((teamPhase) => {
          rowList.push({ top: currentTop, height: ROW_HEIGHT, isSection: false });
          currentTop += ROW_HEIGHT;
          if (!teamPhase.isCollapsed && teamPhase.elements.length > 0) {
            teamPhase.elements.forEach(() => {
              rowList.push({ top: currentTop, height: ELEMENT_ROW_HEIGHT, isSection: false });
              currentTop += ELEMENT_ROW_HEIGHT;
            });
          }
        });
      }
    });

    // Don't include "Add Team" button row - grid should stop before it

    return {
      gridHeight: Math.max(currentTop, 200),
      rows: rowList,
    };
  }, [phases, teams, isIDTimelineCollapsed]);

  // Today's position
  const todayPosition = getTodayPosition(project.startDate, project.endDate);
  const todayLeft = getPositionFromRelative(todayPosition, timelineWidth);
  const showToday = todayPosition >= 0 && todayPosition <= 1;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ height: gridHeight }}
    >
      {/* Horizontal row lines */}
      {rows.map((row, index) => (
        <div
          key={`row-${index}`}
          className={`absolute left-0 right-0 border-b ${
            row.isSection ? 'border-[#e5e7eb]' : 'border-[#e5e7eb]/50'
          }`}
          style={{ top: row.top + row.height }}
        />
      ))}

      {/* Vertical grid lines */}
      {markers.map((marker, index) => {
        const daysSinceStart = getDaysBetween(projectStart, marker.date);
        const relativePos = totalDays > 0 ? daysSinceStart / totalDays : 0;
        const left = getPositionFromRelative(relativePos, timelineWidth);

        return (
          <div
            key={`col-${index}`}
            className={`absolute top-0 border-l ${
              marker.isMinor ? 'border-[#e5e7eb]/50' : 'border-[#e5e7eb]'
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
