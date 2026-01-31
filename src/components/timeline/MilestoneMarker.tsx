import { useRef, useCallback, useEffect } from 'react';
import type { Milestone, Phase } from '../../types';
import { useTimelineStore } from '../../stores/timelineStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT } from '../../utils/timelineUtils';

interface MilestoneMarkerProps {
  readonly milestone: Milestone;
  readonly phase: Phase;
  readonly timelineWidth: number;
}

export default function MilestoneMarker({
  milestone,
  phase,
  timelineWidth,
}: MilestoneMarkerProps) {
  const { updateMilestone } = useTimelineStore();
  const { selection, setSelection, setDragging } = useUIStore();

  const isSelected = selection.type === 'milestone' && selection.id === milestone.id;
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);

  // Calculate absolute position within the phase
  const phaseWidth = (phase.relativeEnd - phase.relativeStart) * timelineWidth;
  const phaseLeft = phase.relativeStart * timelineWidth;
  const milestoneLeft = phaseLeft + milestone.relativePosition * phaseWidth;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelection({ type: 'milestone', id: milestone.id });
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');
    },
    [setDragging]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      // Convert pixel delta to relative position within phase
      const deltaRelative = deltaX / phaseWidth;
      const newPosition = Math.max(0, Math.min(1, milestone.relativePosition + deltaRelative));

      updateMilestone(phase.id, milestone.id, { relativePosition: newPosition });
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setDragging(false);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [milestone.relativePosition, phase.id, milestone.id, phaseWidth, updateMilestone, setDragging]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelection({ type: 'milestone', id: milestone.id });
      }
    },
    [setSelection, milestone.id]
  );

  return (
    <div
      className="absolute z-30 cursor-pointer group focus-ring"
      style={{
        left: milestoneLeft,
        top: 0,
        height: ROW_HEIGHT,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${milestone.name} milestone at ${Math.round(milestone.relativePosition * 100)}% of ${phase.name}`}
      aria-selected={isSelected}
    >
      {/* Diamond marker */}
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }`}
        aria-hidden="true"
      >
        <div
          className={`w-3 h-3 rotate-45 ${
            isSelected
              ? 'bg-blue-600 ring-2 ring-blue-300'
              : 'bg-gray-700 group-hover:bg-gray-900'
          }`}
        />
      </div>

      {/* Vertical line extending down */}
      <div
        className={`absolute top-1/2 left-0 -translate-x-1/2 w-0.5 h-3 ${
          isSelected ? 'bg-blue-600' : 'bg-gray-700 group-hover:bg-gray-900'
        }`}
        aria-hidden="true"
      />

      {/* Tooltip on hover */}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        role="tooltip"
      >
        {milestone.name}
      </div>
    </div>
  );
}
