import { useUIStore } from '../../stores/uiStore';
import { useTimeline } from '../../hooks/useTimeline';
import { getPositionFromRelative } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';

interface PlayheadProps {
  readonly height: number;
}

export default function Playhead({ height }: PlayheadProps) {
  const { playheadPosition } = useUIStore();
  const { timelineWidth, project } = useTimeline();

  if (playheadPosition === null) return null;

  const left = getPositionFromRelative(playheadPosition, timelineWidth);
  const date = getDateFromRelativePosition(
    project.startDate,
    project.endDate,
    playheadPosition
  );
  const dateLabel = formatDate(date, 'MMM d, yyyy');

  return (
    <div
      className="absolute top-0 z-40 pointer-events-none"
      style={{ left, height }}
    >
      {/* Vertical line */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 -translate-x-1/2" />

      {/* Date label at top */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded whitespace-nowrap shadow-sm">
        {dateLabel}
      </div>

      {/* Triangle indicator pointing down */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-blue-500" />
    </div>
  );
}
