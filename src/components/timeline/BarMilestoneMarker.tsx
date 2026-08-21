import { useRef, useCallback, useEffect, useState, useMemo, memo } from 'react';
import type { BarMilestone } from '../../types';
import { useSectionStore, selectSection, selectPhase, selectTask } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import type { ContextMenuLocation } from '../../stores/uiStore';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';
import { getReadableTextColor } from '../../utils/colorUtils';

interface BarMilestoneMarkerProps {
  readonly barMilestone: BarMilestone;
  readonly sectionId: string;
  readonly phaseId: string;
  readonly taskId?: string;
  readonly barWidth: number;
  readonly color: string;
}

export const BarMilestoneMarker = memo(function BarMilestoneMarker({
  barMilestone,
  sectionId,
  phaseId,
  taskId,
  barWidth,
  color,
}: BarMilestoneMarkerProps): JSX.Element {
  const updatePhaseBarMilestone = useSectionStore((s) => s.updatePhaseBarMilestone);
  const updateTaskBarMilestone = useSectionStore((s) => s.updateTaskBarMilestone);
  const beginDragTransaction = useSectionStore((s) => s.beginDragTransaction);
  const commitDragTransaction = useSectionStore((s) => s.commitDragTransaction);
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const setDragging = useUIStore((s) => s.setDragging);
  const openContextMenu = useUIStore((s) => s.openContextMenu);

  // Get section, phase, and task data for date calculations
  const sectionSelector = useMemo(() => selectSection(sectionId), [sectionId]);
  const phaseSelector = useMemo(() => selectPhase(sectionId, phaseId), [sectionId, phaseId]);
  const taskSelector = useMemo(() => selectTask(sectionId, phaseId, taskId || ''), [sectionId, phaseId, taskId]);
  const section = useSectionStore(sectionSelector);
  const phase = useSectionStore(phaseSelector);
  const task = useSectionStore(taskSelector);

  const isSelected =
    selection.type === 'barMilestone' &&
    selection.id === barMilestone.id &&
    selection.phaseId === phaseId &&
    selection.taskId === taskId;

  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const hasDragged = useRef(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragDate, setDragDate] = useState<string | null>(null);

  // Ref to avoid effect re-runs during drag
  const positionRef = useRef(barMilestone.relativePosition);
  positionRef.current = barMilestone.relativePosition;

  const markerLeft = barMilestone.relativePosition * barWidth;

  // Calculate date from bar milestone position
  const calculateDate = useCallback((relativePos: number): string | null => {
    if (!section || !phase) return null;

    const phaseWidth = phase.relativeEnd - phase.relativeStart;

    if (taskId && task) {
      // Bar milestone on task: convert task-relative to section-relative
      const taskSectionStart = phase.relativeStart + task.relativeStart * phaseWidth;
      const taskSectionEnd = phase.relativeStart + task.relativeEnd * phaseWidth;
      const taskWidth = taskSectionEnd - taskSectionStart;
      const sectionRelative = taskSectionStart + relativePos * taskWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
      return formatDate(date, 'MMM d');
    } else {
      // Bar milestone on phase: convert phase-relative to section-relative
      const sectionRelative = phase.relativeStart + relativePos * phaseWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
      return formatDate(date, 'MMM d');
    }
  }, [section, phase, task, taskId]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasDragged.current) {
        hasDragged.current = false;
        return;
      }
      selectItem('barMilestone', barMilestone.id, sectionId, phaseId, { x: e.clientX, y: e.clientY }, taskId);
    },
    [selectItem, barMilestone.id, sectionId, phaseId, taskId]
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Begin undo transaction before any state changes
      beginDragTransaction();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      setIsDragActive(true);
      setDragDate(calculateDate(positionRef.current));
      document.body.classList.add('no-select');
    },
    [beginDragTransaction, setDragging, calculateDate]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      // Convert pixel delta to relative position within bar
      const deltaRelative = barWidth > 0 ? deltaX / barWidth : 0;
      const newPosition = Math.max(0, Math.min(1, positionRef.current + deltaRelative));

      if (taskId) {
        updateTaskBarMilestone(sectionId, phaseId, taskId, barMilestone.id, { relativePosition: newPosition });
      } else {
        updatePhaseBarMilestone(sectionId, phaseId, barMilestone.id, { relativePosition: newPosition });
      }

      // Update drag date
      setDragDate(calculateDate(newPosition));
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setDragging(false);
      setIsDragActive(false);
      setDragDate(null);
      document.body.classList.remove('no-select');

      // Commit transaction to create single undo entry
      commitDragTransaction();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sectionId, phaseId, taskId, barMilestone.id, barWidth, updatePhaseBarMilestone, updateTaskBarMilestone, setDragging, calculateDate, commitDragTransaction]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('barMilestone', barMilestone.id, sectionId, phaseId, { x: rect.right, y: rect.top }, taskId);
      }
    },
    [selectItem, barMilestone.id, sectionId, phaseId, taskId]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const location: ContextMenuLocation = 'bar';
      openContextMenu(
        { x: e.clientX, y: e.clientY },
        'barMilestone',
        barMilestone.id,
        sectionId,
        phaseId,
        taskId,
        location
      );
    },
    [openContextMenu, barMilestone.id, sectionId, phaseId, taskId]
  );

  const textColor = getReadableTextColor(color);

  return (
    <div
      className={`absolute top-0 bottom-0 w-4 -ml-2 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 ${
        isSelected ? 'z-20' : ''
      }`}
      style={{ left: markerLeft }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      aria-label={`${barMilestone.name} bar milestone at ${Math.round(barMilestone.relativePosition * 100)}%`}
      aria-selected={isSelected}
    >
      {/* Tick mark - visual line centered in wider touch target */}
      <div
        className={`absolute top-0 bottom-0 w-px left-1/2 -translate-x-1/2 ${isDragActive ? 'opacity-80' : 'opacity-60'}`}
        style={{ backgroundColor: textColor }}
        aria-hidden="true"
      />

      {/* Date bubble - shown while dragging */}
      {isDragActive && dragDate && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 px-2 py-1 bg-[var(--color-tooltip)] text-[var(--color-tooltip-text)] text-xs rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] whitespace-nowrap z-50 pointer-events-none"
          aria-hidden="true"
        >
          {dragDate}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-tooltip)]" />
        </div>
      )}

      {/* Label - positioned above the bar, also draggable */}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] rounded-[var(--radius-sm)] whitespace-nowrap cursor-grab active:cursor-grabbing bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)]"
        style={{
          marginBottom: 1,
          boxShadow: isSelected ? 'inset 0 0 0 1.5px var(--color-focus)' : undefined,
        }}
      >
        {barMilestone.name || 'Milestone'}
      </div>
    </div>
  );
});
