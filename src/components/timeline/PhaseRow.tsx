import { useCallback, useRef, useEffect, useState, useMemo, memo } from 'react';
import type { Phase, Section, ViewportBounds } from '../../types';
import { getPhaseColor } from '../../types';
import { getNextPhaseColor } from '../../constants/colors';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { getBarDimensions, ROW_HEIGHT, TASK_ROW_HEIGHT, getRelativeFromPosition } from '../../utils/timelineUtils';
import {
  getDateFromRelativePosition,
  formatDate,
  getDaysBetween,
  sectionToViewportRelative,
  viewportToSectionRelative,
  snapRelativeToBusinessDay,
} from '../../utils/dateUtils';
import { TaskRow } from './TaskRow';
import { DragHandle } from './DragHandle';
import { BarMilestoneMarker } from './BarMilestoneMarker';
import { AddItemButton } from './AddItemButton';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDragReorder } from '../../hooks/useDragReorder';
import { useDragAxis } from '../../hooks/useDragAxis';

interface DragHandleRowProps {
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly style: React.CSSProperties;
}

interface PhaseRowProps {
  readonly phase: Phase;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly onCreatePhaseAfter?: (afterOrder: number, clickX: number, clickY: number) => void;
  readonly phaseIndex?: number;
  readonly totalPhases?: number;
  readonly dragHandleProps?: DragHandleRowProps;
  readonly isDragTarget?: boolean;
  readonly onTimelineReorder?: (index: number, startY: number) => void;
}

export const PhaseRow = memo(function PhaseRow({
  phase,
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
  onCreatePhaseAfter,
  phaseIndex,
  totalPhases,
  dragHandleProps: phaseDragHandleProps,
  isDragTarget,
  onTimelineReorder,
}: PhaseRowProps): JSX.Element {
  const { togglePhaseCollapse, updatePhase, updatePhasePosition, updatePhaseWithTasks, updatePhaseWithRipple, addTask, addPhaseBarMilestone, clearExpansion, addPhase, reorderPhases, reorderTasks, beginDragTransaction, commitDragTransaction } = useSectionStore();
  const lastExpansion = useSectionStore((state) => state.lastExpansion);
  const project = useProjectStore((state) => state.project);
  const settings = useProjectStore((state) => state.project?.settings ?? DEFAULT_PROJECT_SETTINGS);
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const setDragging = useUIStore((s) => s.setDragging);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const phaseRowRef = useRef<HTMLDivElement>(null);

  const isMasterSection = section.id === project?.masterSectionId;
  const effectiveColor = getPhaseColor(phase, section, phaseIndex, totalPhases);
  const isSelected = selection.type === 'phase' && selection.id === phase.id;
  const isLocked = section.isLocked || phase.isLocked;

  // Inline edit for phase name
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === phase.id;

  const handleSavePhaseEdit = useCallback(
    (trimmedName: string) => {
      updatePhase(section.id, phase.id, { name: trimmedName });
    },
    [updatePhase, section.id, phase.id]
  );

  // Task drag reorder
  const handleTaskReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderTasks(section.id, phase.id, fromIndex, toIndex);
    },
    [reorderTasks, section.id, phase.id]
  );

  const taskDragReorder = useDragReorder({
    onReorder: handleTaskReorder,
    itemCount: phase.tasks.length,
    rowHeight: TASK_ROW_HEIGHT,
  });

  // Convert section-relative positions to viewport-relative for rendering
  const viewportStart = sectionToViewportRelative(phase.relativeStart, section, viewportBounds);
  const viewportEnd = sectionToViewportRelative(phase.relativeEnd, section, viewportBounds);
  const { left, width } = getBarDimensions(
    viewportStart,
    viewportEnd,
    timelineWidth
  );

  // Memoize phaseWidth to prevent unnecessary callback/effect re-runs
  const phaseWidth = useMemo(
    () => phase.relativeEnd - phase.relativeStart,
    [phase.relativeEnd, phase.relativeStart]
  );

  // Move drag state
  const isMoving = useRef(false);
  const moveLastX = useRef(0);

  // Refs to avoid effect re-runs during drag
  const phasePositionRef = useRef({ relativeStart: phase.relativeStart, relativeEnd: phase.relativeEnd });
  phasePositionRef.current = { relativeStart: phase.relativeStart, relativeEnd: phase.relativeEnd };

  // Preserve children state (Shift key modifier)
  const preserveChildrenRef = useRef(false);
  const initialTaskPositions = useRef<Array<{ id: string; absoluteStart: number; absoluteEnd: number }>>([]);

  // Ripple mode state (Shift+Cmd/Ctrl modifier on end handle)
  const rippleModeRef = useRef(false);

  // Drag date bubble state
  const [startDragDate, setStartDragDate] = useState<string | undefined>(undefined);
  const [endDragDate, setEndDragDate] = useState<string | undefined>(undefined);

  // Helper to compensate scroll when expansion happens during drag
  const compensateExpansionScroll = useCallback(() => {
    const expansion = useSectionStore.getState().lastExpansion;
    if (!expansion || expansion.sectionId !== section.id) return;

    const scrollContainer = document.querySelector('.timeline-scroll-container') as HTMLElement | null;
    if (scrollContainer && expansion.expansionStartDays > 0) {
      // When expanding left, content shifts right - compensate by scrolling right
      const scrollDelta = (expansion.expansionStartDays / expansion.newTotalDays) * timelineWidth;
      scrollContainer.scrollLeft += scrollDelta;
    }

    clearExpansion();
  }, [section.id, timelineWidth, clearExpansion]);

  // Double-click on bar creates a bar milestone
  const onBarDoubleClick = useCallback((e: React.MouseEvent): void => {
    const barElement = e.currentTarget as HTMLElement;
    const barRect = barElement.getBoundingClientRect();
    const clickX = e.clientX - barRect.left;
    const relativePosition = Math.max(0, Math.min(1, clickX / barRect.width));

    const newId = addPhaseBarMilestone(section.id, phase.id, {
      name: '',
      relativePosition,
    });

    selectItem('barMilestone', newId, section.id, phase.id, { x: e.clientX, y: e.clientY });
  }, [addPhaseBarMilestone, section.id, phase.id, selectItem]);

  // Single click selects phase
  const onPhaseClick = useCallback((e: React.MouseEvent): void => {
    selectItem('phase', phase.id, section.id, null, { x: e.clientX, y: e.clientY });
  }, [selectItem, phase.id, section.id]);

  const { handleClick, handleDoubleClick: handleBarDoubleClick, hasDragged } = useDoubleClick(onPhaseClick, onBarDoubleClick);

  // Label inline edit: double-click starts editing
  const onLabelDoubleClick = useCallback(
    (_e: React.MouseEvent) => {
      inlineEdit.startEditing(phase.id, phase.name || '');
    },
    [inlineEdit, phase.id, phase.name]
  );

  const { handleClick: handleLabelClick, handleDoubleClick: handleLabelDoubleClick } = useDoubleClick(
    onPhaseClick,
    onLabelDoubleClick
  );

  // Context menus via shared hook
  const { handleLabelContextMenu, handleBarContextMenu } = useContextMenu('phase', phase.id, section.id);

  // Context menu for phase row empty area (not on bar) - for adding phases/milestones
  const handleRowContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    // Calculate section-relative position from click
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
    const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);
    const clickRelativePosition = Math.max(0, Math.min(1, sectionRelative));
    // Use 'empty' location with phase context for "Add Phase After" positioning
    openContextMenu({ x: e.clientX, y: e.clientY }, 'section', section.id, section.id, phase.id, null, 'empty', clickRelativePosition);
  }, [openContextMenu, section, phase.id, timelineWidth, viewportBounds]);

  // Context menu for task container empty area - for adding tasks
  const handleTaskContainerContextMenu = useCallback((e: React.MouseEvent): void => {
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


  // Click on "+" button creates a new phase starting at the end of this phase
  const handleAddPhaseAfter = useCallback(
    (e: React.MouseEvent): void => {
      // Calculate new phase position - starts at current phase's end
      const sectionDays = getDaysBetween(section.startDate, section.endDate);
      const thirtyDaysRelative = sectionDays > 0 ? 30 / sectionDays : 0.15;
      const relativeStart = phase.relativeEnd;
      const relativeEnd = Math.min(1, relativeStart + thirtyDaysRelative);

      // Add the phase
      addPhase(section.id, {
        name: '',
        description: '',
        color: isMasterSection ? getNextPhaseColor(section.phases.length) : null,
        order: phase.order + 1,
        isCollapsed: false,
        tasks: [],
        relativeStart,
        relativeEnd,
      });

      // Get the new phase and reorder if needed
      const updatedSections = useSectionStore.getState().sections;
      const updatedSection = updatedSections.find((s) => s.id === section.id);
      const newPhase = updatedSection?.phases[updatedSection.phases.length - 1];

      if (newPhase) {
        // Reorder phases to put the new phase at the correct position
        const currentIndex = updatedSection.phases.length - 1;
        const targetIndex = Math.min(phase.order + 1, updatedSection.phases.length - 1);

        if (currentIndex !== targetIndex) {
          reorderPhases(section.id, currentIndex, targetIndex);
        }

        selectItem('phase', newPhase.id, section.id, null, { x: e.clientX, y: e.clientY });
      }
    },
    [section.id, section.startDate, section.endDate, section.phases.length, phase.relativeEnd, phase.order, isMasterSection, addPhase, reorderPhases, selectItem]
  );

  // Double-click on the phase row creates a new phase below this one
  const handlePhaseRowDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (onCreatePhaseAfter) {
        e.stopPropagation();
        onCreatePhaseAfter(phase.order, e.clientX, e.clientY);
      }
    },
    [onCreatePhaseAfter, phase.order]
  );

  // Double-click on tasks container creates a new task within this phase
  const handleCreateTask = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();

      // Calculate position relative to the phase
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      // Convert viewport pixel position to viewport-relative
      const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
      // Convert viewport-relative to section-relative
      const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);

      // Convert section-relative to phase-relative position
      const relativeInPhase = phaseWidth > 0
        ? (sectionRelative - phase.relativeStart) / phaseWidth
        : 0.5;

      // Create a task centered at the click position with reasonable width
      const sectionDayCount = getDaysBetween(section.startDate, section.endDate);
      const sevenDaysRelative = sectionDayCount > 0 ? (7 / sectionDayCount) / phaseWidth : 0.15;
      const halfWidth = sevenDaysRelative / 2;
      const relativeStart = Math.max(0, Math.min(1 - sevenDaysRelative, relativeInPhase - halfWidth));
      const relativeEnd = Math.min(1, relativeStart + sevenDaysRelative);

      addTask(section.id, phase.id, {
        name: '',
        description: '',
        relativeStart,
        relativeEnd,
        order: phase.tasks.length,
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
    // section object is passed to viewportToSectionRelative but only startDate/endDate are used
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section.id, section.startDate, section.endDate, phase.id, phase.relativeStart, phaseWidth, phase.tasks.length, timelineWidth, viewportBounds, addTask, selectItem]
  );

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    togglePhaseCollapse(section.id, phase.id);
  };

  const handleDragStart = (edge: 'start' | 'end', e?: React.MouseEvent): void => {
    if (isLocked) return;
    // Begin undo transaction before any state changes
    beginDragTransaction();
    setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');

    // Check for ripple mode: Shift+Cmd/Ctrl on end handle only
    const isRippleModifier = e?.shiftKey && (e?.metaKey || e?.ctrlKey);
    rippleModeRef.current = edge === 'end' && (isRippleModifier ?? false);

    // Check if Shift is held (without Cmd/Ctrl) to preserve children positions
    preserveChildrenRef.current = (e?.shiftKey && !e?.metaKey && !e?.ctrlKey) ?? false;
    if (preserveChildrenRef.current) {
      // Capture initial absolute positions of all tasks (section-relative)
      initialTaskPositions.current = phase.tasks.map((task) => ({
        id: task.id,
        absoluteStart: phase.relativeStart + task.relativeStart * phaseWidth,
        absoluteEnd: phase.relativeStart + task.relativeEnd * phaseWidth,
      }));
    }

    // Initialize the drag date - use section dates for date display
    const position = edge === 'start' ? phase.relativeStart : phase.relativeEnd;
    const date = getDateFromRelativePosition(section.startDate, section.endDate, position);
    const dateStr = formatDate(date, 'MMM d');
    if (edge === 'start') {
      setStartDragDate(dateStr);
    } else {
      setEndDragDate(dateStr);
    }
  };

  const handleDrag = (edge: 'start' | 'end', deltaX: number): void => {
    // Convert pixel delta to section-relative delta
    // We need to scale by the ratio of section width to viewport width
    const sectionDays = getDaysBetween(section.startDate, section.endDate);
    const sectionViewportWidth = (sectionDays / viewportBounds.totalDays) * timelineWidth;
    const deltaSectionRelative = sectionViewportWidth > 0 ? deltaX / sectionViewportWidth : 0;

    let newStart: number;
    let newEnd: number;

    if (edge === 'start') {
      // Allow going below 0 to trigger auto-expansion
      newStart = Math.min(phase.relativeEnd - 0.01, phase.relativeStart + deltaSectionRelative);
      newEnd = phase.relativeEnd;
      // Update drag date
      const clampedStart = Math.max(0, newStart);
      const date = getDateFromRelativePosition(section.startDate, section.endDate, clampedStart);
      setStartDragDate(formatDate(date, 'MMM d'));
    } else {
      newStart = phase.relativeStart;
      // Allow going above 1 to trigger auto-expansion
      newEnd = Math.max(phase.relativeStart + 0.01, phase.relativeEnd + deltaSectionRelative);
      // Update drag date
      const clampedEnd = Math.min(1, newEnd);
      const date = getDateFromRelativePosition(section.startDate, section.endDate, clampedEnd);
      setEndDragDate(formatDate(date, 'MMM d'));
    }

    // Ripple mode: shift all downstream phases when resizing end
    if (rippleModeRef.current && edge === 'end') {
      updatePhaseWithRipple(section.id, phase.id, newEnd);
      return;
    }

    if (preserveChildrenRef.current && initialTaskPositions.current.length > 0) {
      // Calculate new task positions to preserve absolute positions
      const newPhaseWidth = newEnd - newStart;
      const taskUpdates = initialTaskPositions.current.map((initial) => {
        // Clamp absolute positions to new phase bounds
        const clampedAbsStart = Math.max(newStart, Math.min(newEnd, initial.absoluteStart));
        const clampedAbsEnd = Math.max(newStart, Math.min(newEnd, initial.absoluteEnd));

        // Convert back to relative positions within the new phase
        const newRelStart = newPhaseWidth > 0 ? (clampedAbsStart - newStart) / newPhaseWidth : 0;
        const newRelEnd = newPhaseWidth > 0 ? (clampedAbsEnd - newStart) / newPhaseWidth : 1;

        // Ensure minimum task width
        const minWidth = 0.02;
        const finalRelEnd = Math.max(newRelStart + minWidth, newRelEnd);

        return {
          id: initial.id,
          relativeStart: Math.max(0, Math.min(1 - minWidth, newRelStart)),
          relativeEnd: Math.min(1, finalRelEnd),
        };
      });

      updatePhaseWithTasks(section.id, phase.id, newStart, newEnd, taskUpdates);
    } else {
      // updatePhasePosition will handle auto-expansion if newStart < 0 or newEnd > 1
      updatePhasePosition(section.id, phase.id, newStart, newEnd);
      // Compensate scroll immediately if expansion happened
      compensateExpansionScroll();
    }
  };

  const handleDragEnd = (edge: 'start' | 'end'): void => {
    setDragging(false);
    // Mark that a drag occurred to prevent click from triggering
    hasDragged.current = true;
    // Clear preserve children state
    preserveChildrenRef.current = false;
    initialTaskPositions.current = [];
    // Clear ripple mode state
    rippleModeRef.current = false;
    // Clear the drag date
    if (edge === 'start') {
      setStartDragDate(undefined);
    } else {
      setEndDragDate(undefined);
    }

    // Smart weekend snapping: snap edge to next business day if on weekend (if enabled)
    if (settings.skipWeekends) {
      const currentPosition = edge === 'start' ? phase.relativeStart : phase.relativeEnd;
      const snappedPosition = snapRelativeToBusinessDay(currentPosition, section.startDate, section.endDate);
      if (snappedPosition !== currentPosition) {
        if (edge === 'start') {
          updatePhasePosition(section.id, phase.id, snappedPosition, phase.relativeEnd);
        } else {
          updatePhasePosition(section.id, phase.id, phase.relativeStart, snappedPosition);
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
      // Don't start move if clicking on drag handles (they stopPropagation)
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
      if (onTimelineReorder && phaseIndex !== undefined) {
        onTimelineReorder(phaseIndex, startY);
      }
    },
    [onTimelineReorder, phaseIndex]
  );

  const handleBarMouseDown = useDragAxis({
    onHorizontalDrag: handleHorizontalDrag,
    onVerticalDrag: handleVerticalDrag,
    disabled: isLocked,
  });

  // Memoize sectionViewportWidth for the move handler
  const sectionDays = useMemo(() => getDaysBetween(section.startDate, section.endDate), [section.startDate, section.endDate]);
  const sectionViewportWidth = useMemo(
    () => viewportBounds.totalDays > 0 ? (sectionDays / viewportBounds.totalDays) * timelineWidth : timelineWidth,
    [sectionDays, viewportBounds.totalDays, timelineWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMoving.current) return;
      const deltaX = e.clientX - moveLastX.current;
      moveLastX.current = e.clientX;

      // Mark that a drag occurred (to prevent click from triggering)
      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      // Convert pixel delta to section-relative delta
      const deltaSectionRelative = sectionViewportWidth > 0 ? deltaX / sectionViewportWidth : 0;

      // Use refs for latest position values to avoid effect re-runs during drag
      const { relativeStart, relativeEnd } = phasePositionRef.current;
      const newStart = relativeStart + deltaSectionRelative;
      const newEnd = relativeEnd + deltaSectionRelative;

      // Allow moving past bounds to trigger auto-expansion
      // The store's updatePhasePosition will handle the expansion
      updatePhasePosition(section.id, phase.id, newStart, newEnd);

      // Compensate scroll immediately if expansion happened
      compensateExpansionScroll();
    };

    const handleMouseUp = () => {
      if (!isMoving.current) return;
      isMoving.current = false;
      setDragging(false);
      document.body.classList.remove('no-select');

      // Smart weekend snapping: snap both edges to next business day if on weekend (if enabled)
      if (settings.skipWeekends) {
        // Use refs for latest position values
        const { relativeStart, relativeEnd } = phasePositionRef.current;
        const snappedStart = snapRelativeToBusinessDay(relativeStart, section.startDate, section.endDate);
        const snappedEnd = snapRelativeToBusinessDay(relativeEnd, section.startDate, section.endDate);
        if (snappedStart !== relativeStart || snappedEnd !== relativeEnd) {
          updatePhasePosition(section.id, phase.id, snappedStart, snappedEnd);
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
  }, [section.id, section.startDate, section.endDate, phase.id, sectionViewportWidth, updatePhasePosition, setDragging, compensateExpansionScroll, settings.skipWeekends, commitDragTransaction]);

  // Viewport stability: compensate scroll position after auto-expansion
  useEffect(() => {
    if (!lastExpansion || lastExpansion.sectionId !== section.id) return;

    // Find the scroll container
    const scrollContainer = document.querySelector('.timeline-scroll-container') as HTMLElement | null;
    if (!scrollContainer) {
      clearExpansion();
      return;
    }

    // When we expand left, content shifts right - compensate by scrolling right
    if (lastExpansion.expansionStartDays > 0) {
      const scrollDelta = (lastExpansion.expansionStartDays / lastExpansion.newTotalDays) * timelineWidth;
      scrollContainer.scrollLeft += scrollDelta;
    }

    clearExpansion();
  }, [lastExpansion, section.id, timelineWidth, clearExpansion]);

  // Handle keyboard interaction on the label row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('phase', phase.id, section.id, null, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, phase.id, section.id]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label={`${phase.name} phase`} className={isDragTarget ? 'opacity-50' : ''}>
        {/* Phase label */}
        <div
          className={`group flex items-center gap-2 ${isMasterSection ? 'px-3' : 'pl-6 pr-3'} border-b cursor-pointer row-selectable focus-ring ${
            isSelected ? 'selected' : ''
          }`}
          style={{ height: ROW_HEIGHT, borderColor: 'var(--color-row-border)' }}
          onClick={isEditingName ? undefined : handleLabelClick}
          onDoubleClick={isEditingName ? undefined : handleLabelDoubleClick}
          onContextMenu={handleLabelContextMenu}
          onKeyDown={!isEditingName ? handleKeyDown : undefined}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${phase.name} phase${isSelected ? ', selected' : ''}${isLocked ? ', locked' : ''}`}
        >
          {/* Drag handle for reordering phases */}
          {phaseDragHandleProps && (
            <div
              {...phaseDragHandleProps}
              className="flex items-center justify-center w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-text-secondary)] rounded transition-opacity duration-150"
              title="Drag to reorder"
              aria-label={`Drag to reorder ${phase.name}`}
            >
              <svg
                className="w-3 h-3"
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
          <button
            onClick={handleToggleCollapse}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded-md transition-colors duration-150"
            aria-expanded={!phase.isCollapsed}
            aria-label={`${phase.isCollapsed ? 'Expand' : 'Collapse'} ${phase.name}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${
                phase.isCollapsed ? '' : 'expanded'
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {isMasterSection && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: effectiveColor }}
              aria-hidden="true"
            />
          )}
          {isEditingName ? (
            <input
              ref={inlineEdit.inputRef}
              className={`text-sm ${isMasterSection ? 'font-medium' : ''} text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1`}
              value={inlineEdit.editedName}
              onChange={inlineEdit.handleChange}
              onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSavePhaseEdit)}
              onBlur={() => inlineEdit.saveEdit(handleSavePhaseEdit)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`text-sm ${isMasterSection ? 'font-medium' : ''} text-[var(--color-text-primary)] truncate flex-1`}>
              {phase.name}
            </span>
          )}
          {isLocked && (
            <svg className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-label="Locked">
              <path
                fillRule="evenodd"
                d="M4 6V4a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 7.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.5 6H4zm2-2a2 2 0 1 1 4 0v2H6V4z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>

        {/* Task labels */}
        {!phase.isCollapsed && phase.tasks.length > 0 && (
          <div role="list" aria-label={`${phase.name} tasks`} data-drag-container className="relative">
            {phase.tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                phase={phase}
                section={section}
                isLabel
                timelineWidth={timelineWidth}
                viewportBounds={viewportBounds}
                phaseIndex={phaseIndex}
                totalPhases={totalPhases}
                dragHandleProps={taskDragReorder.getDragHandleProps(index)}
                isDragTarget={taskDragReorder.state.isDragging && taskDragReorder.state.dragIndex === index}
              />
            ))}
            {taskDragReorder.getDropIndicatorStyle() && (
              <div style={taskDragReorder.getDropIndicatorStyle()!} />
            )}
          </div>
        )}
      </div>
    );
  }

  // Render timeline content
  return (
    <div role="group" aria-label={`${phase.name} timeline`} className={isDragTarget ? 'opacity-50' : ''}>
      {/* Phase bar row - double-click creates a phase below this one */}
      <div
        ref={phaseRowRef}
        className="relative border-b overflow-visible"
        style={{ height: ROW_HEIGHT, borderColor: 'var(--color-row-border)' }}
        onDoubleClick={handlePhaseRowDoubleClick}
        onContextMenu={handleRowContextMenu}
      >
        <div
          className={`absolute top-2 bottom-2 rounded-[10px] timeline-bar group overflow-visible ${
            isLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
          } ${isSelected ? 'ring-2 ring-[var(--color-focus)] ring-offset-1' : ''}`}
          style={{
            left,
            width,
            backgroundColor: effectiveColor,
          }}
          onClick={handleClick}
          onContextMenu={handleBarContextMenu}
          onDoubleClick={handleBarDoubleClick}
          onMouseDown={onTimelineReorder ? handleBarMouseDown : handleMoveStart}
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label={`${phase.name} phase bar, from ${Math.round(phase.relativeStart * 100)}% to ${Math.round(phase.relativeEnd * 100)}%${isLocked ? ', locked' : ''}`}
          aria-selected={isSelected}
        >
          {/* Left drag handle */}
          <DragHandle
            edge="start"
            onDragStart={(e) => handleDragStart('start', e)}
            onDrag={(deltaX) => handleDrag('start', deltaX)}
            onDragEnd={() => handleDragEnd('start')}
            label={`Resize ${phase.name} start`}
            dragDate={startDragDate}
            color={effectiveColor}
          />

          {/* Right drag handle */}
          <DragHandle
            edge="end"
            onDragStart={(e) => handleDragStart('end', e)}
            onDrag={(deltaX) => handleDrag('end', deltaX)}
            onDragEnd={() => handleDragEnd('end')}
            label={`Resize ${phase.name} end`}
            dragDate={endDragDate}
            color={effectiveColor}
          />

          {/* Phase name on bar */}
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
            <span className="text-xs font-medium text-white truncate drop-shadow-sm">
              {phase.name}
            </span>
          </div>

          {/* Bar milestones */}
          {phase.barMilestones?.map((bm) => (
            <BarMilestoneMarker
              key={bm.id}
              barMilestone={bm}
              sectionId={section.id}
              phaseId={phase.id}
              barWidth={width}
              color={effectiveColor}
            />
          ))}

          {/* Add phase button - appears on hover */}
          <AddItemButton
            onClick={handleAddPhaseAfter}
            label="Add phase after"
          />
        </div>
      </div>

      {/* Task bars */}
      {!phase.isCollapsed && phase.tasks.length > 0 && (
        <div
          role="list"
          aria-label={`${phase.name} task bars`}
          className="relative"
          onDoubleClick={handleCreateTask}
          onContextMenu={handleTaskContainerContextMenu}
        >
          {phase.tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              phase={phase}
              section={section}
              isLabel={false}
              timelineWidth={timelineWidth}
              viewportBounds={viewportBounds}
              phaseIndex={phaseIndex}
              totalPhases={totalPhases}
              taskIndex={index}
              onTimelineReorder={taskDragReorder.startReorder}
              isDragTarget={taskDragReorder.state.isDragging && taskDragReorder.state.dragIndex === index}
            />
          ))}
          {taskDragReorder.getDropIndicatorStyle() && (
            <div style={taskDragReorder.getDropIndicatorStyle()!} />
          )}
        </div>
      )}
    </div>
  );
});
