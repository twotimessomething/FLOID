import { useRef, useCallback, useEffect, useState } from 'react';
import type { Milestone, Section } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';

interface MilestoneMarkerProps {
  readonly milestone: Milestone;
  readonly section: Section;
  readonly timelineWidth: number;
  readonly lineHeight?: number; // Height of the vertical line extending down
}

export default function MilestoneMarker({
  milestone,
  section,
  timelineWidth,
  lineHeight = 0,
}: MilestoneMarkerProps) {
  const { updateMilestone } = useSectionStore();
  const { project } = useProjectStore();
  const { selection, selectItem, setDragging } = useUIStore();

  const isSelected = selection.type === 'milestone' && selection.id === milestone.id;
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const hasDragged = useRef(false);
  const [dragDate, setDragDate] = useState<string | undefined>(undefined);

  // Calculate absolute position within the full timeline
  const milestoneLeft = milestone.relativePosition * timelineWidth;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't trigger selection if we just finished dragging
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    selectItem('milestone', milestone.id, section.id, null, { x: e.clientX, y: e.clientY });
  };

  // Prevent double-click from propagating to parent
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');

      // Initialize drag date
      const date = getDateFromRelativePosition(project.startDate, project.endDate, milestone.relativePosition);
      setDragDate(formatDate(date, 'MMM d'));
    },
    [setDragging, milestone.relativePosition, project.startDate, project.endDate]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      // Convert pixel delta to relative position within timeline
      const deltaRelative = deltaX / timelineWidth;
      const newPosition = Math.max(0, Math.min(1, milestone.relativePosition + deltaRelative));

      updateMilestone(section.id, milestone.id, { relativePosition: newPosition });

      // Update drag date
      const date = getDateFromRelativePosition(project.startDate, project.endDate, newPosition);
      setDragDate(formatDate(date, 'MMM d'));
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setDragging(false);
      setDragDate(undefined);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [section.id, milestone.relativePosition, milestone.id, timelineWidth, project.startDate, project.endDate, updateMilestone, setDragging]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('milestone', milestone.id, section.id, null, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, milestone.id, section.id]
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
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${milestone.name} milestone at ${Math.round(milestone.relativePosition * 100)}%`}
      aria-selected={isSelected}
    >
      {/* Drag date bubble */}
      {dragDate && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 px-2 py-1 bg-[#1f2937] text-white text-xs font-medium rounded shadow-lg whitespace-nowrap z-50 pointer-events-none"
          aria-hidden="true"
        >
          {dragDate}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#1f2937]" />
        </div>
      )}

      {/* Diamond marker */}
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }`}
        aria-hidden="true"
      >
        <div
          className={`w-3 h-3 rotate-45 ${
            isSelected
              ? 'bg-blue-600 ring-2 ring-blue-300'
              : 'bg-[#111827] group-hover:bg-[#1f2937]'
          }`}
        />
      </div>

      {/* Short vertical line extending down from marker */}
      <div
        className={`absolute top-1/2 left-0 -translate-x-1/2 w-0.5 h-3 ${
          isSelected ? 'bg-blue-600' : 'bg-[#111827] group-hover:bg-[#1f2937]'
        }`}
        aria-hidden="true"
      />

      {/* Extended vertical line through content rows */}
      {lineHeight > 0 && (
        <div
          className="absolute left-0 -translate-x-1/2 w-px bg-[#d1d5db] pointer-events-none"
          style={{
            top: ROW_HEIGHT,
            height: lineHeight,
          }}
          aria-hidden="true"
        />
      )}

      {/* Always visible title - below the marker */}
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 -mt-2 px-2 py-0.5 bg-white/70 backdrop-blur-[2px] text-[#111827] text-xs rounded-md whitespace-nowrap pointer-events-none border border-white/50"
        role="tooltip"
      >
        {milestone.name}
      </div>
    </div>
  );
}
