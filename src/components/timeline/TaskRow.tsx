import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import type { Phase, Task, Section, ViewportBounds } from '../../types';
import { getPhaseColor } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { getBarDimensions, TASK_ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate, sectionToViewportRelative, viewportToSectionRelative, getDaysBetween, snapRelativeToBusinessDay } from '../../utils/dateUtils';
import { DragHandle } from './DragHandle';
import { BarMilestoneMarker } from './BarMilestoneMarker';
import { AddItemButton } from './AddItemButton';

interface TaskRowProps {
  readonly task: Task;
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly phaseIndex?: number;
  readonly totalPhases?: number;
}

export function TaskRow({
  task,
  phase,
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
  phaseIndex,
  totalPhases,
}: TaskRowProps): JSX.Element {
  const { updateTaskPosition, addTaskBarMilestone, addTask, beginDragTransaction, commitDragTransaction } = useSectionStore();
  const project = useProjectStore((state) => state.project);
  const { selection, selectItem, setDragging, openContextMenu } = useUIStore();

  const isMasterSection = section.id === project?.masterSectionId;
  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);
  const isSelected = selection.type === 'task' && selection.id === task.id;

  // Memoize phaseWidth (section-relative) to prevent unnecessary effect re-runs
  const phaseWidth = useMemo(
    () => phase.relativeEnd - phase.relativeStart,
    [phase.relativeEnd, phase.relativeStart]
  );

  // Calculate section-relative absolute position of task
  const sectionRelativeStart = phase.relativeStart + task.relativeStart * phaseWidth;
  const sectionRelativeEnd = phase.relativeStart + task.relativeEnd * phaseWidth;

  // Convert section-relative to viewport-relative for rendering
  const viewportStart = sectionToViewportRelative(sectionRelativeStart, section, viewportBounds);
  const viewportEnd = sectionToViewportRelative(sectionRelativeEnd, section, viewportBounds);

  const { left, width } = getBarDimensions(
    viewportStart,
    viewportEnd,
    timelineWidth
  );

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);
  const hasDragged = useRef(false);

  // Refs to avoid effect re-runs during drag (store latest values for use in event handlers)
  const taskRef = useRef({ relativeStart: task.relativeStart, relativeEnd: task.relativeEnd });
  const phaseRelativeStartRef = useRef(phase.relativeStart);
  taskRef.current = { relativeStart: task.relativeStart, relativeEnd: task.relativeEnd };
  phaseRelativeStartRef.current = phase.relativeStart;

  // Drag date bubble state
  const [startDragDate, setStartDragDate] = useState<string | undefined>(undefined);
  const [endDragDate, setEndDragDate] = useState<string | undefined>(undefined);

  // Track click timeout for distinguishing single vs double click
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClickEvent = useRef<{ x: number; y: number } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent): void => {
    // Don't trigger selection if we just finished dragging
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }

    // Store click position and delay to allow double-click detection
    pendingClickEvent.current = { x: e.clientX, y: e.clientY };

    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    // Wait briefly to see if this is a double-click
    clickTimeoutRef.current = setTimeout(() => {
      if (pendingClickEvent.current) {
        selectItem('task', task.id, section.id, phase.id, pendingClickEvent.current);
        pendingClickEvent.current = null;
      }
    }, 200);
  }, [selectItem, task.id, section.id, phase.id]);

  // Context menu for label area
  const handleLabelContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'task', task.id, section.id, phase.id, null, 'label');
  }, [openContextMenu, task.id, section.id, phase.id]);

  // Context menu for bar area - includes click position for "Add Milestone Here"
  const handleBarContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const barElement = e.currentTarget as HTMLElement;
    const barRect = barElement.getBoundingClientRect();
    const clickX = e.clientX - barRect.left;
    const clickRelativePosition = Math.max(0, Math.min(1, clickX / barRect.width));
    openContextMenu({ x: e.clientX, y: e.clientY }, 'task', task.id, section.id, phase.id, task.id, 'bar', clickRelativePosition);
  }, [openContextMenu, task.id, section.id, phase.id]);

  // Context menu for task row empty area - for adding tasks
  const handleRowContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    // Calculate phase-relative position from click
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
    const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);
    // Convert to phase-relative
    const phaseRelative = phaseWidth > 0 ? (sectionRelative - phase.relativeStart) / phaseWidth : 0.5;
    const clickRelativePosition = Math.max(0, Math.min(1, phaseRelative));
    // Use 'empty' location with phase as target for "Add Task Here"
    openContextMenu({ x: e.clientX, y: e.clientY }, 'phase', phase.id, section.id, phase.id, null, 'empty', clickRelativePosition);
  }, [openContextMenu, section, phase.id, phase.relativeStart, phaseWidth, timelineWidth, viewportBounds]);

  // Double-click on task bar creates a bar milestone
  const handleDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();

    // Cancel any pending single-click action
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    pendingClickEvent.current = null;

    // Reset drag state to prevent interference
    hasDragged.current = false;

    // Calculate click position relative to the bar
    const barElement = e.currentTarget as HTMLElement;
    const barRect = barElement.getBoundingClientRect();
    const clickX = e.clientX - barRect.left;
    const relativePosition = Math.max(0, Math.min(1, clickX / barRect.width));

    // Create bar milestone
    const newId = addTaskBarMilestone(section.id, phase.id, task.id, {
      name: '',
      relativePosition,
    });

    // Select the new bar milestone to open editor
    selectItem('barMilestone', newId, section.id, phase.id, { x: e.clientX, y: e.clientY }, task.id);
  }, [addTaskBarMilestone, section.id, phase.id, task.id, selectItem]);

  // Click on "+" button creates a new task starting at the end of this task
  const handleAddTaskAfter = useCallback(
    (e: React.MouseEvent): void => {
      // Calculate new task position - starts at current task's end (phase-relative)
      // Default to 7 days width relative to section, converted to phase-relative
      const sectionDayCount = getDaysBetween(section.startDate, section.endDate);
      const sevenDaysRelative = sectionDayCount > 0 ? (7 / sectionDayCount) / phaseWidth : 0.15;
      const relativeStart = task.relativeEnd;
      const relativeEnd = Math.min(1, relativeStart + sevenDaysRelative);

      // Add the task
      addTask(section.id, phase.id, {
        name: '',
        description: '',
        relativeStart,
        relativeEnd,
        order: task.order + 1,
      });

      // Get the new task and select it
      const updatedSections = useSectionStore.getState().sections;
      const updatedSection = updatedSections.find((s) => s.id === section.id);
      const updatedPhase = updatedSection?.phases.find((p) => p.id === phase.id);
      const newTask = updatedPhase?.tasks[updatedPhase.tasks.length - 1];

      if (newTask) {
        selectItem('task', newTask.id, section.id, phase.id, { x: e.clientX, y: e.clientY });
      }
    },
    [section.id, section.startDate, section.endDate, phase.id, phaseWidth, task.relativeEnd, task.order, addTask, selectItem]
  );

  const handleDragStart = (edge: 'start' | 'end', _e?: React.MouseEvent): void => {
    // Begin undo transaction before any state changes
    beginDragTransaction();
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
    // Calculate section-relative position and set drag date using section dates
    const relativeInPhase = edge === 'start' ? task.relativeStart : task.relativeEnd;
    const sectionPosition = phase.relativeStart + relativeInPhase * phaseWidth;
    const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionPosition);
    const dateStr = formatDate(date, 'MMM d');
    if (edge === 'start') {
      setStartDragDate(dateStr);
    } else {
      setEndDragDate(dateStr);
    }
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    // Calculate the pixel width of the phase in viewport coordinates
    const sectionDays = getDaysBetween(section.startDate, section.endDate);
    const sectionViewportWidth = viewportBounds.totalDays > 0
      ? (sectionDays / viewportBounds.totalDays) * timelineWidth
      : timelineWidth;
    const phasePixelWidth = phaseWidth * sectionViewportWidth;
    const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;

    if (edge === 'start') {
      const newStart = Math.max(
        0,
        Math.min(task.relativeEnd - 0.02, task.relativeStart + deltaRelative)
      );
      updateTaskPosition(section.id, phase.id, task.id, newStart, task.relativeEnd);
      // Update drag date using section dates
      const sectionPosition = phase.relativeStart + newStart * phaseWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionPosition);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      const newEnd = Math.max(
        task.relativeStart + 0.02,
        Math.min(1, task.relativeEnd + deltaRelative)
      );
      updateTaskPosition(section.id, phase.id, task.id, task.relativeStart, newEnd);
      // Update drag date using section dates
      const sectionPosition = phase.relativeStart + newEnd * phaseWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionPosition);
      setEndDragDate(formatDate(date, 'MMM d'));
    }
  };

  const handleDragEnd = (edge: 'start' | 'end'): void => {
    setDragging(false);
    // Mark that a drag occurred to prevent click from triggering
    hasDragged.current = true;
    // Clear the drag date
    if (edge === 'start') {
      setStartDragDate(undefined);
    } else {
      setEndDragDate(undefined);
    }

    // Smart weekend snapping: snap edge to next business day if on weekend (if enabled)
    // Task positions are relative to phase, so convert to section-relative for snapping
    if (settings.skipWeekends) {
      const relativeInPhase = edge === 'start' ? task.relativeStart : task.relativeEnd;
      const sectionPosition = phase.relativeStart + relativeInPhase * phaseWidth;
      const snappedSectionPosition = snapRelativeToBusinessDay(sectionPosition, section.startDate, section.endDate);
      if (snappedSectionPosition !== sectionPosition) {
        // Convert back to phase-relative
        const snappedPhaseRelative = phaseWidth > 0 ? (snappedSectionPosition - phase.relativeStart) / phaseWidth : relativeInPhase;
        const clampedSnapped = Math.max(0, Math.min(1, snappedPhaseRelative));
        if (edge === 'start') {
          updateTaskPosition(section.id, phase.id, task.id, clampedSnapped, task.relativeEnd);
        } else {
          updateTaskPosition(section.id, phase.id, task.id, task.relativeStart, clampedSnapped);
        }
      }
    }

    // Commit transaction to create single undo entry
    commitDragTransaction();
  };

  // Move handlers for dragging the entire bar
  const handleMoveStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Begin undo transaction before any state changes
      beginDragTransaction();
      isMoving.current = true;
      moveLastX.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');
    },
    [beginDragTransaction, setDragging]
  );

  // Calculate the pixel width of the phase in viewport coordinates (memoized for effect)
  const sectionDays = useMemo(() => getDaysBetween(section.startDate, section.endDate), [section.startDate, section.endDate]);
  const phasePixelWidth = useMemo(() => {
    const sectionViewportWidth = viewportBounds.totalDays > 0
      ? (sectionDays / viewportBounds.totalDays) * timelineWidth
      : timelineWidth;
    return phaseWidth * sectionViewportWidth;
  }, [sectionDays, viewportBounds.totalDays, timelineWidth, phaseWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMoving.current) return;
      const deltaX = e.clientX - moveLastX.current;
      moveLastX.current = e.clientX;

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      const deltaRelative = phasePixelWidth > 0 ? deltaX / phasePixelWidth : 0;
      // Use refs to get latest values without causing effect re-runs
      const { relativeStart, relativeEnd } = taskRef.current;
      const barWidth = relativeEnd - relativeStart;

      let newStart = relativeStart + deltaRelative;
      let newEnd = relativeEnd + deltaRelative;

      // Clamp to bounds (0-1 within phase)
      if (newStart < 0) {
        newStart = 0;
        newEnd = barWidth;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - barWidth;
      }

      updateTaskPosition(section.id, phase.id, task.id, newStart, newEnd);
    };

    const handleMouseUp = () => {
      if (!isMoving.current) return;
      isMoving.current = false;
      setDragging(false);
      document.body.classList.remove('no-select');

      // Smart weekend snapping: snap both edges to next business day if on weekend (if enabled)
      // Convert task positions to section-relative for snapping
      if (settings.skipWeekends) {
        // Use refs to get latest values
        const { relativeStart, relativeEnd } = taskRef.current;
        const phaseStart = phaseRelativeStartRef.current;
        const startSectionPosition = phaseStart + relativeStart * phaseWidth;
        const endSectionPosition = phaseStart + relativeEnd * phaseWidth;
        const snappedStartSection = snapRelativeToBusinessDay(startSectionPosition, section.startDate, section.endDate);
        const snappedEndSection = snapRelativeToBusinessDay(endSectionPosition, section.startDate, section.endDate);

        if (snappedStartSection !== startSectionPosition || snappedEndSection !== endSectionPosition) {
          // Convert back to phase-relative
          const snappedStartPhase = phaseWidth > 0 ? (snappedStartSection - phaseStart) / phaseWidth : relativeStart;
          const snappedEndPhase = phaseWidth > 0 ? (snappedEndSection - phaseStart) / phaseWidth : relativeEnd;
          updateTaskPosition(
            section.id,
            phase.id,
            task.id,
            Math.max(0, Math.min(1, snappedStartPhase)),
            Math.max(0, Math.min(1, snappedEndPhase))
          );
        }
      }

      // Commit transaction to create single undo entry
      commitDragTransaction();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [section.id, section.startDate, section.endDate, phase.id, task.id, phaseWidth, phasePixelWidth, updateTaskPosition, setDragging, settings.skipWeekends, commitDragTransaction]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('task', task.id, section.id, phase.id, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, task.id, section.id, phase.id]
  );

  if (isLabel) {
    return (
      <div
        className={`flex items-center ${isMasterSection ? 'pl-9' : 'pl-12'} pr-3 border-b cursor-pointer row-selectable focus-ring ${
          isSelected ? 'selected' : ''
        }`}
        style={{ height: TASK_ROW_HEIGHT, borderColor: 'var(--color-row-border-light)' }}
        onClick={handleClick}
        onContextMenu={handleLabelContextMenu}
        onKeyDown={handleKeyDown}
        role="listitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`${task.name} task${isSelected ? ', selected' : ''}`}
      >
        <span className="text-sm text-[var(--color-text-secondary)] truncate">{task.name}</span>
      </div>
    );
  }

  // Get effective color for task (80% opacity)
  const effectiveColor = getPhaseColor(phase, section, phaseIndex, totalPhases);
  const taskColor = effectiveColor + 'CC';

  return (
    <div
      className="relative border-b overflow-visible"
      style={{ height: TASK_ROW_HEIGHT, borderColor: 'var(--color-row-border-light)' }}
      role="listitem"
      onContextMenu={handleRowContextMenu}
    >
      <div
        className={`absolute top-1 bottom-1 rounded-[10px] cursor-grab active:cursor-grabbing timeline-bar group overflow-visible ${
          isSelected ? 'ring-2 ring-[var(--color-focus)] ring-offset-1' : ''
        }`}
        style={{
          left,
          width,
          backgroundColor: taskColor,
        }}
        onClick={handleClick}
        onContextMenu={handleBarContextMenu}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMoveStart}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${task.name} task bar`}
        aria-selected={isSelected}
      >
        {/* Left drag handle */}
        <DragHandle
          edge="start"
          onDragStart={(e) => handleDragStart('start', e)}
          onDrag={(deltaX) => handleDrag('start', deltaX)}
          onDragEnd={() => handleDragEnd('start')}
          label={`Resize ${task.name} start`}
          dragDate={startDragDate}
          color={taskColor}
        />

        {/* Right drag handle */}
        <DragHandle
          edge="end"
          onDragStart={(e) => handleDragStart('end', e)}
          onDrag={(deltaX) => handleDrag('end', deltaX)}
          onDragEnd={() => handleDragEnd('end')}
          label={`Resize ${task.name} end`}
          dragDate={endDragDate}
          color={taskColor}
        />

        {/* Task name on bar */}
        <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
          <span className="text-xs text-white/90 truncate drop-shadow-sm">
            {task.name}
          </span>
        </div>

        {/* Bar milestones */}
        {task.barMilestones?.map((bm) => (
          <BarMilestoneMarker
            key={bm.id}
            barMilestone={bm}
            sectionId={section.id}
            phaseId={phase.id}
            taskId={task.id}
            barWidth={width}
            color={taskColor}
          />
        ))}

        {/* Add task button - appears on hover */}
        <AddItemButton
          onClick={handleAddTaskAfter}
          label="Add task after"
        />
      </div>
    </div>
  );
}
