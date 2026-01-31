import { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { getDaysBetween, parseDate } from '../utils/dateUtils';
import { getTimelineWidth, getPixelsPerDay } from '../utils/timelineUtils';

export function useTimeline() {
  const { project } = useProjectStore();
  const { zoomLevel } = useUIStore();

  const projectStart = parseDate(project.startDate);
  const projectEnd = parseDate(project.endDate);
  const totalDays = getDaysBetween(projectStart, projectEnd);
  const pixelsPerDay = getPixelsPerDay(zoomLevel);
  const timelineWidth = getTimelineWidth(totalDays, zoomLevel);

  return useMemo(
    () => ({
      projectStart,
      projectEnd,
      totalDays,
      pixelsPerDay,
      timelineWidth,
      project,
    }),
    [projectStart, projectEnd, totalDays, pixelsPerDay, timelineWidth, project]
  );
}
