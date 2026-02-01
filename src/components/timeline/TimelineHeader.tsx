import { useTimeline } from '../../hooks/useTimeline';
import { useUIStore } from '../../stores/uiStore';
import { getTimeMarkers, getMonthMarkers, getDaysBetween } from '../../utils/dateUtils';
import { getPositionFromRelative, HEADER_HEIGHT } from '../../utils/timelineUtils';

interface TimelineHeaderProps {
  readonly onPlayheadMouseDown?: (e: React.MouseEvent) => void;
}

export default function TimelineHeader({ onPlayheadMouseDown }: TimelineHeaderProps) {
  const { projectStart, projectEnd, timelineWidth } = useTimeline();
  const { zoomLevel } = useUIStore();

  const markers = getTimeMarkers(projectStart, projectEnd, zoomLevel);
  const monthMarkers = getMonthMarkers(projectStart, projectEnd);
  const totalDays = getDaysBetween(projectStart, projectEnd);

  return (
    <div
      className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10 cursor-crosshair select-none"
      style={{ height: HEADER_HEIGHT }}
      onMouseDown={onPlayheadMouseDown}
    >
      <div className="relative h-full flex items-end pointer-events-none">
        {/* Month labels on top row */}
        {zoomLevel !== 'quarter' && (
          <div className="absolute top-0 left-0 right-0 h-1/2 flex items-center">
            {monthMarkers.map((marker, index) => {
              const daysSinceStart = getDaysBetween(projectStart, marker.date);
              const relativePos = totalDays > 0 ? daysSinceStart / totalDays : 0;
              const left = getPositionFromRelative(relativePos, timelineWidth);

              return (
                <div
                  key={index}
                  className="absolute text-xs font-medium text-[var(--color-text-primary)]"
                  style={{ left }}
                >
                  {marker.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Day/Week markers on bottom row */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 flex items-center border-t border-[var(--color-border)]/50">
          {markers.map((marker, index) => {
            const daysSinceStart = getDaysBetween(projectStart, marker.date);
            const relativePos = totalDays > 0 ? daysSinceStart / totalDays : 0;
            const left = getPositionFromRelative(relativePos, timelineWidth);

            return (
              <div
                key={index}
                className={`absolute text-xs ${
                  marker.isMinor ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-secondary)]'
                }`}
                style={{ left }}
              >
                {marker.label}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
