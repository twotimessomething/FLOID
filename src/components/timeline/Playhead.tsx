import { useUIStore } from '../../stores/uiStore';
import { useTimeline } from '../../hooks/useTimeline';
import { getPositionFromRelative, HEADER_HEIGHT } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';

interface PlayheadProps {
  readonly height: number;
}

export default function Playhead({ height }: PlayheadProps) {
  const { playheadPosition, playheadY } = useUIStore();
  const { timelineWidth, project } = useTimeline();

  if (playheadPosition === null) return null;

  const left = getPositionFromRelative(playheadPosition, timelineWidth);
  const date = getDateFromRelativePosition(
    project.startDate,
    project.endDate,
    playheadPosition
  );
  const dateLabel = formatDate(date, 'MMM d, yyyy');

  // Position the label above the mouse (subtract header height since playheadY is relative to scroll container)
  const labelY = playheadY !== null ? Math.max(0, playheadY - HEADER_HEIGHT - 32) : 0;

  return (
    <div
      className="absolute top-0 z-40 pointer-events-none"
      style={{ left, height }}
    >
      {/* Vertical line */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 -translate-x-1/2" />

      {/* Date label following mouse */}
      <div
        className="absolute left-1/2 -translate-x-1/2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded whitespace-nowrap shadow-sm"
        style={{ top: labelY }}
      >
        {dateLabel}
      </div>
    </div>
  );
}
