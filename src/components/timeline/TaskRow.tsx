import { useCallback, useRef, useEffect, useState, useMemo, memo } from 'react';
import type { Phase, Task, Section, ViewportBounds } from '../../types';
import { getPhaseColor } from '../../types';
import { getReadableTextColor } from '../../utils/colorUtils';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { getBarDimensions, TASK_ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import { getDateFromRelativePosition, formatDate, sectionToViewportRelative, viewportToSectionRelative, getDaysBetween, snapRelativeToBusinessDay } from '../../utils/dateUtils';
import { DragHandle } from './DragHandle';
import { BarMilestoneMarker } from './BarMilestoneMarker';
import { BarMilestoneHint } from './BarMilestoneHint';
import { AddItemButton } from './AddItemButton';
import { createTaskAt, createBarMilestoneAt } from '../../utils/creationUtils';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDragAxis } from '../../hooks/useDragAxis';

interface DragHandleRowProps {
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly style: React.CSSProperties;
}

interface TaskRowProps {
  readonly task: Task;
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly phaseIndex?: number;
  readonly totalPhases?: number;
  readonly dragHandleProps?: DragHandleRowProps;
  readonly isDragTarget?: boolean;
  readonly onTimelineReorder?: (index: number, startY: number) => void;
  readonly taskIndex?: number;
}

export const TaskRow = memo(function TaskRow({
  task,
  phase,
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
  phaseIndex,
  totalPhases,
  dragHandleProps: taskDragHandleProps,
  isDragTarget,
  onTimelineReorder,
  taskIndex,
}: TaskRowProps): JSX.Element {
  const { updateTaskPosition, updateTask, beginDragTransaction, commitDragTransaction } = useSectionStore();
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const setDragging = useUIStore((s) => s.setDragging);
  const openContextMenu = useUIStore((s) => s.openContextMenu);

  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);
  const isSelected = selection.type === 'task' && selection.id === task.id;
  const isLocked = section.isLocked || phase.isLocked;

  // Inline edit for task name
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === task.id;

  const handleSaveTaskEdit = useCallback(
    (trimmedName: string) => {
      updateTask(section.id, phase.id, task.id, { name: trimmedName });
    },
    [updateTask, section.id, phase.id, task.id]
  );

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

  // Refs to avoid effect re-runs during drag (store latest values for use in event handlers)
  const taskRef = useRef({ relativeStart: task.relativeStart, relativeEnd: task.relativeEnd });
  const phaseRelativeStartRef = useRef(phase.relativeStart);
  taskRef.current = { relativeStart: task.relativeStart, relativeEnd: task.relativeEnd };
  phaseRelativeStartRef.current = phase.relativeStart;

  // Drag date bubble state
  const [startDragDate, setStartDragDate] = useState<string | undefined>(undefined);
  const [endDragDate, setEndDragDate] = useState<string | undefined>(undefined);

  // Double-click on task bar creates a bar milestone
  const onBarDoubleClick = useCallback((e: React.MouseEvent): void => {
    const barRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relativePosition = barRect.width > 0 ? (e.clientX - barRect.left) / barRect.width : 0.5;
    createBarMilestoneAt(section.id, phase.id, task.id, relativePosition, { x: e.clientX, y: e.clientY });
  }, [section.id, phase.id, task.id]);

  // Faint diamond on bar hover hinting that double-click drops a milestone
  const [milestoneHintX, setMilestoneHintX] = useState<number | null>(null);

  const handleBarHintMouseMove = useCallback((e: React.MouseEvent): void => {
    if (e.buttons !== 0 || e.target !== e.currentTarget) {
      setMilestoneHintX((prev) => (prev !== null ? null : prev));
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMilestoneHintX(e.clientX - rect.left);
  }, []);

  const handleBarHintMouseLeave = useCallback((): void => {
    setMilestoneHintX(null);
  }, []);

  // Single click selects task
  const onTaskClick = useCallback((e: React.MouseEvent): void => {
    selectItem('task', task.id, section.id, phase.id, { x: e.clientX, y: e.clientY });
  }, [selectItem, task.id, section.id, phase.id]);

  const { handleClick, handleDoubleClick, hasDragged } = useDoubleClick(onTaskClick, onBarDoubleClick);

  // Label inline edit: double-click starts editing
  const onLabelDoubleClick = useCallback(
    (_e: React.MouseEvent) => {
      inlineEdit.startEditing(task.id, task.name || '');
    },
    [inlineEdit, task.id, task.name]
  );

  const { handleClick: handleLabelClick, handleDoubleClick: handleLabelDoubleClick } = useDoubleClick(
    onTaskClick,
    onLabelDoubleClick
  );

  // Context menus via shared hook
  const { handleLabelContextMenu, handleBarContextMenu } = useContextMenu('task', task.id, section.id, phase.id, task.id);

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


  // Click on "+" button creates a new task starting at the end of this task
  const handleAddTaskAfter = useCallback(
    (e: React.MouseEvent): void => {
      createTaskAt(
        section.id,
        phase.id,
        { startAt: task.relativeEnd, afterTaskId: task.id },
        { x: e.clientX, y: e.clientY }
      );
    },
    [section.id, phase.id, task.relativeEnd, task.id]
  );

  const handleDragStart = (edge: 'start' | 'end', _e?: React.MouseEvent): void => {
    if (isLocked) return;
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
      if (isLocked) return;
      e.preventDefault();
      // Begin undo transaction before any state changes
      beginDragTransaction();
      isMoving.current = true;
      moveLastX.current = e.clientX;
      setDragging(true, 'move');
      document.body.classList.add('no-select');
    },
    [isLocked, beginDragTransaction, setDragging]
  );

  // Axis-detecting mousedown for timeline bar: horizontal = move, vertical = reorder
  const handleHorizontalDrag = useCallback(
    (startX: number) => {
      beginDragTransaction();
      isMoving.current = true;
      moveLastX.current = startX;
      setDragging(true, 'move');
      hasDragged.current = true;
    },
    [beginDragTransaction, setDragging]
  );

  const handleVerticalDrag = useCallback(
    (startY: number) => {
      hasDragged.current = true;
      if (onTimelineReorder && taskIndex !== undefined) {
        onTimelineReorder(taskIndex, startY);
      }
    },
    [onTimelineReorder, taskIndex]
  );

  const handleBarMouseDown = useDragAxis({
    onHorizontalDrag: handleHorizontalDrag,
    onVerticalDrag: handleVerticalDrag,
    disabled: isLocked,
  });

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
        className={`group flex items-center gap-1 pl-12 pr-3 cursor-pointer row-selectable focus-ring ${
          isSelected ? 'selected' : ''
        } ${isDragTarget ? 'opacity-50' : ''}`}
        style={{ height: TASK_ROW_HEIGHT }}
        onClick={isEditingName ? undefined : handleLabelClick}
        onDoubleClick={isEditingName ? undefined : handleLabelDoubleClick}
        onContextMenu={handleLabelContextMenu}
        onKeyDown={!isEditingName ? handleKeyDown : undefined}
        role="listitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`${task.name} task${isSelected ? ', selected' : ''}`}
      >
        {/* Drag handle for reordering tasks */}
        {taskDragHandleProps && (
          <div
            {...taskDragHandleProps}
            className="flex items-center justify-center w-3 h-3 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-text-secondary)] rounded transition-opacity duration-150"
            title="Drag to reorder"
            aria-label={`Drag to reorder ${task.name}`}
          >
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 10 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="2" cy="2" r="1.5" />
              <circle cx="8" cy="2" r="1.5" />
              <circle cx="2" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="2" cy="14" r="1.5" />
              <circle cx="8" cy="14" r="1.5" />
            </svg>
          </div>
        )}
        {isEditingName ? (
          <input
            ref={inlineEdit.inputRef}
            className="text-sm text-[var(--color-text-secondary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1"
            value={inlineEdit.editedName}
            onChange={inlineEdit.handleChange}
            onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSaveTaskEdit)}
            onBlur={() => inlineEdit.saveEdit(handleSaveTaskEdit)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm text-[var(--color-text-secondary)] truncate">{task.name}</span>
        )}
      </div>
    );
  }

  // Get effective color for task (80% opacity)
  const effectiveColor = getPhaseColor(phase, section, phaseIndex, totalPhases);
  const taskColor = effectiveColor + 'CC';

  return (
    <div
      className={`relative overflow-visible ${isDragTarget ? 'opacity-50' : ''}`}
      style={{ height: TASK_ROW_HEIGHT }}
      role="listitem"
      data-creation-zone="true"
      onContextMenu={handleRowContextMenu}
    >
      <div
        className={`absolute top-1 bottom-1 timeline-bar group overflow-visible ${
          isLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
        } ${isSelected ? 'timeline-bar--selected' : ''}`}
        style={{ left, width }}
        onClick={handleClick}
        onContextMenu={handleBarContextMenu}
        onDoubleClick={handleDoubleClick}
        onMouseDown={onTimelineReorder ? handleBarMouseDown : handleMoveStart}
        onMouseMove={handleBarHintMouseMove}
        onMouseLeave={handleBarHintMouseLeave}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${task.name} task bar`}
        aria-selected={isSelected}
      >
        <div className="timeline-bar__fill" style={{ backgroundColor: taskColor }} />
        <span className="timeline-bar__label">
          <span className="truncate" style={{ color: getReadableTextColor(taskColor) }}>
            {task.name}
          </span>
        </span>
        {milestoneHintX !== null && <BarMilestoneHint x={milestoneHintX} color={taskColor} />}
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
});
