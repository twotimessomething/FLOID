import { memo, useCallback, useMemo, useRef } from 'react';
import type { DependencyAnchor, Section, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import type { FlatRow } from '../../utils/timelineUtils';
import { barInsetForDepth, labelInsetForDepth, xToDay } from '../../utils/timelineUtils';
import { lastDayOf, snapKeyToBusinessDay, snapSpanToBusinessDays } from '../../utils/dayKeys';
import { formatDayKey } from '../../utils/dateUtils';
import { getReadableTextColor } from '../../utils/colorUtils';
import { measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { titleIfTruncated } from '../../utils/truncatedTitle';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useBarResize } from '../../hooks/useBarResize';
import { resistLockedDrag } from '../../utils/lockedResist';
import { commitWithSlide } from '../../commands/slideCommit';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useItemDrag } from '../../hooks/useItemDrag';
import { useDependencyDraw } from '../../hooks/useDependencyDraw';
import {
  useAnchorConnected,
  useItemConnected,
  useShowDependencies,
} from '../../hooks/useDependencyState';
import { reportDependencyHover, reportDependencyLeave } from '../../utils/dependencyHover';
import { reportRowHover, reportRowLeave, useIsRowHovered } from '../../hooks/useRowHover';
import { useCreateGhost, type CreateGestureInfo } from '../../hooks/useCreateGhost';
import { useIsTaskPointer } from '../../hooks/useTaskPointer';
import {
  useDropClosingDepth,
  useIsDragged,
  useIsDropReceiver,
  useIsDropSlotIn,
} from '../../hooks/useDropState';
import {
  createBarAt,
  createTaskAt,
  drawnSpanAt,
  drawnSpanDescriber,
  DEFAULT_BAR_DAYS,
  DEFAULT_NESTED_BAR_DAYS,
  type CreateSpan,
} from '../../utils/creationUtils';
import { DragHandle } from './DragHandle';
import { DependencyDot } from './DependencyDot';
import { GhostBar } from './GhostBar';
import { GhostTask } from './GhostTask';
import { DropLine } from './DropLine';

interface ItemRowProps {
  readonly row: FlatRow;
  readonly section: Section;
  readonly isLabel: boolean;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
}

/**
 * One row of the timeline, at any depth.
 *
 * A root bar, a bar nested three deep, and a milestone that was dragged inside
 * something are all this component — the only differences are row height, indent
 * and whether the thing has edges to grab. That is the whole point of the item
 * model: there is no "task row" to keep in sync with a "phase row" any more.
 */
export const ItemRow = memo(function ItemRow({
  row,
  section,
  isLabel,
  viewport,
  pixelsPerDay,
}: ItemRowProps): JSX.Element {
  const { item, depth, color, isLocked } = row;

  const updateItem = useSectionStore((s) => s.updateItem);
  const toggleItemCollapse = useSectionStore((s) => s.toggleItemCollapse);
  const toggleItemDone = useSectionStore((s) => s.toggleItemDone);

  const skipWeekends = useProjectStore(
    (s) => s.project?.settings?.skipWeekends ?? DEFAULT_PROJECT_SETTINGS.skipWeekends
  );

  const selectItem = useUIStore((s) => s.selectItem);
  const isSelected = useUIStore((s) => s.selection.type === 'item' && s.selection.id === item.id);

  const isDragged = useIsDragged(item.id);
  const isReceiver = useIsDropReceiver(item.id);
  const isSlotBefore = useIsDropSlotIn(section.id, row.parentId, row.slotFrom, row.index);
  const closingDepth = useDropClosingDepth(section.id, row.closes);

  const { startDrag, hasDraggedRef } = useItemDrag();
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === item.id;
  const { handleLabelContextMenu, handleBarContextMenu, openAt } = useContextMenu(
    'item',
    item.id,
    section.id
  );

  const inset = barInsetForDepth(depth);
  const textColor = getReadableTextColor(color);
  const isBar = item.kind === 'bar';
  const isTask = item.kind === 'task';
  const isDone = isTask && item.isDone === true;
  const hasChildren = item.children.length > 0;
  const isOpenGroup = isBar && hasChildren && !item.isCollapsed;
  // What the labels column prints for an item with no name, and what every
  // spoken label says for it, so neither ever reads as a gap
  const displayName = item.name || (isBar ? 'Untitled' : isTask ? 'Task' : 'Milestone');
  // What a drop beside or onto this row may do. A locked list takes no new
  // members; a locked bar takes no children.
  const dropAttributes = {
    'data-drop-row': item.id,
    'data-drop-section': section.id,
    'data-drop-parent': row.parentId ?? '',
    'data-drop-index': row.index,
    'data-drop-expanded': isOpenGroup ? '' : undefined,
    'data-drop-into-locked': isOpenGroup && isLocked ? '' : undefined,
    'data-drop-slot-locked': row.parentLocked ? '' : undefined,
  };

  // -- selection, rename ---------------------------------------------------

  const handleSelect = useCallback(
    (e: React.MouseEvent): void => {
      selectItem(item.id, section.id, { x: e.clientX, y: e.clientY });
    },
    [selectItem, item.id, section.id]
  );

  /**
   * The outline, on the press itself.
   *
   * Selecting is idempotent and costs nothing to undo, so there is no reason
   * to hold it behind the double-click window — only the editor has to wait.
   * A press that turns into a drag keeps the outline, which is the right
   * answer anyway: the thing under the cursor is the thing being moved.
   */
  const handlePressSelect = useCallback(
    (e: React.PointerEvent): void => {
      // Secondary and middle buttons belong to the context menu and to panning
      if (e.button !== 0) return;
      selectItem(item.id, section.id, { x: e.clientX, y: e.clientY }, { openEditor: false });
    },
    [selectItem, item.id, section.id]
  );

  const handleRename = useCallback((): void => {
    inlineEdit.startEditing(item.id, item.name || '');
  }, [inlineEdit, item.id, item.name]);

  const handleSaveName = useCallback(
    (name: string): void => {
      updateItem(section.id, item.id, { name });
    },
    [updateItem, section.id, item.id]
  );

  // Double-click on a bar opens or closes the group it holds
  const handleToggleFromBar = useCallback((): void => {
    if (isBar && hasChildren) commitWithSlide(() => toggleItemCollapse(section.id, item.id));
  }, [isBar, hasChildren, toggleItemCollapse, section.id, item.id]);

  const label = useDoubleClick(handleSelect, handleRename);
  // Double-clicking a bar opens its group. A bar with no group has no second
  // meaning, so its click is not worth delaying.
  const bar = useDoubleClick(handleSelect, handleToggleFromBar, {
    hasDoubleClickAction: isBar && hasChildren,
  });

  // A short drag can still end on the bar it started from, which would fire a
  // click and pop the editor open over the move that just happened.
  const handleBarClick = useCallback(
    (e: React.MouseEvent): void => {
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false;
        return;
      }
      bar.handleClick(e);
    },
    [bar, hasDraggedRef]
  );

  /**
   * The circle is the checkbox, but the click never reaches it: the drag hook
   * captures the pointer on the wrapper the moment it is pressed, and a
   * captured pointer's click is retargeted to the capturing element. So the
   * wrapper answers every click and asks where the press began. A click that
   * arrives after a move is the move's echo, not a tick; a keyboard click on
   * the focused circle has no press at all, so the target speaks for it.
   */
  const pressedCheckRef = useRef(false);

  const handleCheckPointerDown = useCallback((): void => {
    pressedCheckRef.current = true;
  }, []);

  const handleTaskClick = useCallback(
    (e: React.MouseEvent): void => {
      const pressedCheck =
        pressedCheckRef.current ||
        (e.target instanceof Element && e.target.closest('[data-task-check]') !== null);
      pressedCheckRef.current = false;
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false;
        return;
      }
      if (pressedCheck) {
        toggleItemDone(section.id, item.id);
        return;
      }
      bar.handleClick(e);
    },
    [hasDraggedRef, toggleItemDone, section.id, item.id, bar]
  );

  // Folding is the sheet changing shape: the rows below slide, the children
  // fade, as they do when the same fold comes from the keyboard or the menu
  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      commitWithSlide(() => toggleItemCollapse(section.id, item.id));
    },
    [toggleItemCollapse, section.id, item.id]
  );

  // -- dependencies --------------------------------------------------------

  const showDependencies = useShowDependencies();
  const { startDraw: startDependencyDraw } = useDependencyDraw();
  const isStartConnected = useAnchorConnected(item.id, 'start');
  const isEndConnected = useAnchorConnected(item.id, 'end');
  const isMilestoneConnected = useItemConnected(item.id);

  const handleDependencyDraw = useCallback(
    (e: React.PointerEvent, anchor: DependencyAnchor): void => {
      const dotRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      startDependencyDraw(e, {
        origin: { x: dotRect.left + dotRect.width / 2, y: dotRect.top + dotRect.height / 2 },
        fixed: { end: 'from', itemId: item.id, anchor },
      });
    },
    [startDependencyDraw, item.id]
  );

  // Hover is what reveals this item's links, and what lights its name in the
  // labels column so the eye can cross the gap; a finger has no hover to report
  const handleHoverEnter = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      reportDependencyHover(item.id);
      reportRowHover(item.id);
    },
    [item.id]
  );
  const handleHoverLeave = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      reportDependencyLeave(item.id);
      reportRowLeave(item.id);
    },
    [item.id]
  );
  // Only the labels column listens; the sheet's own row has nothing to light
  const isHoveredOnSheet = useIsRowHovered(isLabel ? item.id : null);

  // -- moving --------------------------------------------------------------

  const handleBarPointerDown = useCallback(
    (e: React.PointerEvent): void => {
      // Another pointer is already moving something; this press is not news
      if (useUIStore.getState().isDragging) return;
      handlePressSelect(e);
      if (isLocked) {
        resistLockedDrag(e, e.currentTarget as HTMLElement);
        return;
      }
      startDrag(e, { item, sectionId: section.id, pixelsPerDay });
    },
    [handlePressSelect, isLocked, startDrag, item, section.id, pixelsPerDay]
  );

  const handleLabelClick = useCallback(
    (e: React.MouseEvent): void => {
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false;
        return;
      }
      label.handleClick(e);
    },
    [label, hasDraggedRef]
  );

  // A drag started from the labels column only re-parents; there is no time
  // axis over there, so nothing should move in time.
  const handleLabelPointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (useUIStore.getState().isDragging) return;
      handlePressSelect(e);
      if (isLocked) {
        resistLockedDrag(e, e.currentTarget as HTMLElement);
        return;
      }
      startDrag(e, { item, sectionId: section.id, pixelsPerDay: 0 });
    },
    [handlePressSelect, isLocked, startDrag, item, section.id]
  );

  // -- resizing ------------------------------------------------------------

  const barRef = useRef<HTMLDivElement>(null);
  const {
    rect,
    startBubble,
    endBubble,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
    handleResizeCancel,
  } = useBarResize({
    item,
    sectionId: section.id,
    isLocked,
    viewport,
    pixelsPerDay,
    skipWeekends,
    barRef,
    hasDraggedRef,
  });

  // -- creating in this row's empty space ----------------------------------

  // Open space beside any row draws a new bar into that row's own group, and
  // lands it directly below the row it was drawn in. Drawing where the work
  // belongs beats drawing it at the root and dragging it in afterwards. A
  // locked list takes no new members this way any more than by a drop.
  const canCreateHere = !isLabel && !row.parentLocked;

  // "Skip weekends" belongs to the commit, not the gesture: the ghost tracks
  // the cursor exactly, and the day it lands on is squared up once, here.
  const snapCreateDay = useCallback(
    (key: string): string => (skipWeekends ? snapKeyToBusinessDay(key) : key),
    [skipWeekends]
  );
  const snapCreateSpan = useCallback(
    (span: CreateSpan): CreateSpan => (skipWeekends ? snapSpanToBusinessDays(span) : span),
    [skipWeekends]
  );

  const handleGhostDoubleClick = useCallback(
    ({ startPx, point }: CreateGestureInfo): void => {
      createBarAt(
        section.id,
        {
          startDay: snapCreateDay(xToDay(startPx, viewport, pixelsPerDay)),
          parentId: row.parentId,
          index: row.index + 1,
        },
        point
      );
    },
    [section.id, viewport, pixelsPerDay, row.parentId, row.index, snapCreateDay]
  );

  // ⌥-click drops a task where the bar would have gone
  const handleGhostClick = useCallback(
    ({ startPx, point }: CreateGestureInfo): void => {
      createTaskAt(
        section.id,
        {
          day: snapCreateDay(xToDay(startPx, viewport, pixelsPerDay)),
          parentId: row.parentId,
          index: row.index + 1,
        },
        point
      );
    },
    [section.id, viewport, pixelsPerDay, row.parentId, row.index, snapCreateDay]
  );

  const handleGhostDraw = useCallback(
    ({ startPx, endPx, point }: CreateGestureInfo): void => {
      // Both drawn edges were chosen, so each squares up on its own — the same
      // bargain resize strikes. A span drawn wholly inside a weekend has no
      // weekday to square up to, so it lands where it was drawn.
      createBarAt(
        section.id,
        {
          span: drawnSpanAt(startPx, endPx, viewport, pixelsPerDay, snapCreateSpan),
          parentId: row.parentId,
          index: row.index + 1,
        },
        point
      );
    },
    [section.id, viewport, pixelsPerDay, row.parentId, row.index, snapCreateSpan]
  );

  // The dates the draw reports come off the same conversion the drop commits
  const describeSpan = useMemo(
    () => drawnSpanDescriber(viewport, pixelsPerDay, snapCreateSpan),
    [viewport, pixelsPerDay, snapCreateSpan]
  );

  const isTaskPointer = useIsTaskPointer();

  const ghost = useCreateGhost({
    // The hover ghost previews the bar creation will actually produce, which is
    // shorter inside a group than at the root
    defaultWidth:
      (row.parentId === null ? DEFAULT_BAR_DAYS : DEFAULT_NESTED_BAR_DAYS) * pixelsPerDay,
    disabled: !canCreateHere,
    describeSpan,
    onDoubleClickCreate: handleGhostDoubleClick,
    onDrawCreate: handleGhostDraw,
    pointMode: isTaskPointer,
    onClickCreate: handleGhostClick,
  });

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      const rowRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openAt(e, 'row', xToDay(e.clientX - rowRect.left, viewport, pixelsPerDay));
    },
    [openAt, viewport, pixelsPerDay]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      // Return edits and Space folds, as they do on the sheet — but for this
      // row, which a Tab may have reached without selecting it
      if (e.key === 'Enter') {
        e.preventDefault();
        const bounds = (e.target as HTMLElement).getBoundingClientRect();
        selectItem(item.id, section.id, { x: bounds.right, y: bounds.top });
      } else if (e.key === ' ') {
        e.preventDefault();
        selectItem(item.id, section.id, undefined, { openEditor: false });
        handleToggleFromBar();
      }
    },
    [selectItem, item.id, section.id, handleToggleFromBar]
  );

  // A name the bar cannot hold prints on the paper past its end instead.
  // Bar and milestone names set the same 12px type, so the milestone measure
  // answers it — once per name, cached, never per frame — with 18px of chrome
  // standing in for the bar's 16px of padding.
  const nameWidth = useMemo(
    () => (isBar && item.name ? measureMilestoneLabelWidth(item.name) : 0),
    [isBar, item.name]
  );
  const isNameOutside = nameWidth > rect.width;

  // -- labels column -------------------------------------------------------

  if (isLabel) {
    return (
      <div
        className={`group relative flex items-center gap-1.5 pr-3 cursor-pointer row-selectable focus-ring touch-none ${
          isSelected ? 'selected' : ''
        } ${isDragged ? 'is-dragged-row' : ''} ${isReceiver ? 'is-drop-receiver' : ''} ${
          isHoveredOnSheet ? 'is-hovered-on-sheet' : ''
        }`}
        style={{ height: row.height, paddingLeft: labelInsetForDepth(depth) }}
        data-flip-item={item.id}
        data-drag-item={item.id}
        {...dropAttributes}
        data-drop-into={isBar && !isLocked ? item.id : undefined}
        onClick={isEditingName ? undefined : handleLabelClick}
        onDoubleClick={isEditingName ? undefined : label.handleDoubleClick}
        onPointerDown={isEditingName ? undefined : handleLabelPointerDown}
        onContextMenu={handleLabelContextMenu}
        onKeyDown={isEditingName ? undefined : handleKeyDown}
        role="listitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`${displayName}${isSelected ? ', selected' : ''}${
          isLocked ? ', locked' : ''
        }${isTask ? (isDone ? ', done' : ', not done') : ''}`}
      >
        {isSlotBefore && <DropLine position="top" inset={labelInsetForDepth(depth)} />}
        {closingDepth >= 0 && (
          <DropLine position="bottom" inset={labelInsetForDepth(closingDepth)} />
        )}
        {isBar && hasChildren ? (
          <button
            onClick={handleToggleCollapse}
            onPointerDown={(e) => e.stopPropagation()}
            className="row-affordance w-5 h-5 flex-shrink-0 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded transition-colors duration-fast"
            data-always-visible={item.isCollapsed ? 'true' : undefined}
            aria-expanded={!item.isCollapsed}
            aria-label={`${item.isCollapsed ? 'Expand' : 'Collapse'} ${displayName}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${item.isCollapsed ? '' : 'expanded'}`}
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
        ) : (
          <span className="w-5 flex-shrink-0" aria-hidden="true">
            {isTask ? (
              <span
                className={`task-check task-check--small mx-auto ${isDone ? 'task-check--done' : ''}`}
              />
            ) : (
              !isBar && (
                <span className="block w-1.5 h-1.5 mx-auto rotate-45 bg-[var(--color-text-muted)]" />
              )
            )}
          </span>
        )}

        {isEditingName ? (
          <input
            ref={inlineEdit.inputRef}
            {...inlineEdit.inputProps}
            className="text-body text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1"
            value={inlineEdit.editedName}
            onChange={inlineEdit.handleChange}
            onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSaveName)}
            onBlur={() => inlineEdit.saveEdit(handleSaveName)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`truncate flex-1 text-body ${
              !item.name
                ? 'text-[var(--color-text-muted)]'
                : depth === 0
                  ? 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)]'
            } ${isDone ? 'task-name--done' : ''}`}
            onPointerEnter={titleIfTruncated}
          >
            {displayName}
          </span>
        )}

        {isLocked && (
          <svg
            className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-label="Locked"
          >
            <path
              fillRule="evenodd"
              d="M4 6V4a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 7.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.5 6H4zm2-2a2 2 0 1 1 4 0v2H6V4z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    );
  }

  // -- timeline column -----------------------------------------------------

  // A row that takes nothing new stands down the plot's crosshair and the task
  // pointer, which would otherwise promise a bar or a task that never comes.
  // Its click stays wired: a plain click on open paper still lets go of the
  // selection, and the hook creates nothing while disabled.
  return (
    <div
      className={`group relative ${
        !canCreateHere ? 'cursor-default' : ghost.ghost !== null ? 'cursor-copy' : ''
      }`}
      style={{ height: row.height }}
      data-flip-item={item.id}
      {...dropAttributes}
      onContextMenu={handleRowContextMenu}
      onClick={ghost.handleClick}
      onDoubleClick={canCreateHere ? ghost.handleDoubleClick : undefined}
      onPointerMove={canCreateHere ? ghost.handlePointerMove : undefined}
      onPointerLeave={canCreateHere ? ghost.handlePointerLeave : undefined}
      onPointerDown={canCreateHere ? ghost.handlePointerDown : undefined}
      role="listitem"
    >
      {isSlotBefore && <DropLine position="top" />}
      {closingDepth >= 0 && <DropLine position="bottom" />}

      {ghost.ghost !== null &&
        (isTaskPointer ? (
          <GhostTask left={ghost.ghost.left} />
        ) : (
          <GhostBar
            ref={ghost.ghostRef}
            readoutRef={ghost.readoutRef}
            left={ghost.ghost.left}
            width={ghost.ghost.width}
            color={color}
            isDrawing={ghost.ghost.isDrawing}
            verticalClassName=""
            style={{ top: inset, bottom: inset }}
          />
        ))}

      {isBar ? (
        <div
          ref={barRef}
          data-drop-bar={item.id}
          data-drop-section={section.id}
          data-drop-locked={isLocked ? '' : undefined}
          data-drag-item={item.id}
          className={`absolute timeline-bar group/bar overflow-visible touch-none focus-ring ${
            isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          } ${isSelected ? 'timeline-bar--selected' : ''} ${
            isReceiver ? 'timeline-bar--receiving' : ''
          } ${isDragged ? 'timeline-bar--lifted' : ''}`}
          style={{ left: rect.left, width: rect.width, top: inset, bottom: inset }}
          onPointerDown={handleBarPointerDown}
          onPointerEnter={handleHoverEnter}
          onPointerLeave={handleHoverLeave}
          onClick={handleBarClick}
          onDoubleClick={bar.handleDoubleClick}
          onContextMenu={handleBarContextMenu}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${displayName}, ${formatDayKey(item.start)} to ${formatDayKey(
            lastDayOf(item.end)
          )}${isLocked ? ', locked' : ''}`}
        >
          <div className="timeline-bar__fill" style={{ backgroundColor: color }} />
          {hasChildren && item.isCollapsed && (
            <div
              className="timeline-bar__collapsed-line"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          )}
          {/* Too long for its bar, the name prints on the paper just past the
              end, as a task's or a milestone's does beside its glyph. It is
              still the bar's: hovering it, pressing it and clicking it are the
              bar's own, and it stays behind when the bar is picked up. */}
          {isNameOutside ? (
            <span
              className={`timeline-bar__outside-label text-meta ${
                showDependencies ? '' : 'timeline-bar__outside-label--near'
              }`}
              data-strip-on-drag=""
            >
              {item.name}
            </span>
          ) : (
            <span className="timeline-bar__label">
              <span className="truncate" style={{ color: textColor }}>
                {item.name}
              </span>
            </span>
          )}

          {!isLocked && (
            <>
              <DragHandle
                edge="start"
                barWidth={rect.width}
                onDragStart={handleResizeStart}
                onDrag={handleResize}
                onDragEnd={handleResizeEnd}
                onDragCancel={handleResizeCancel}
                label={`Resize ${displayName} start`}
                dragDate={startBubble}
              />
              <DragHandle
                edge="end"
                barWidth={rect.width}
                onDragStart={handleResizeStart}
                onDrag={handleResize}
                onDragEnd={handleResizeEnd}
                onDragCancel={handleResizeCancel}
                label={`Resize ${displayName} end`}
                dragDate={endBubble}
              />
            </>
          )}

          {showDependencies && (
            <>
              <DependencyDot
                anchor="start"
                variant="bar"
                isConnected={isStartConnected}
                onStartDraw={handleDependencyDraw}
                label={`Link ${item.name || 'bar'} from its start`}
              />
              <DependencyDot
                anchor="end"
                variant="bar"
                isConnected={isEndConnected}
                onStartDraw={handleDependencyDraw}
                label={`Link ${item.name || 'bar'} from its end`}
              />
            </>
          )}
        </div>
      ) : isTask ? (
        <div
          className={`absolute top-0 bottom-0 timeline-task timeline-point touch-none ${
            isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          } ${
            isDragged ? 'timeline-point--lifted' : ''
          } ${isSelected ? 'timeline-task--selected' : ''}`}
          style={{ left: rect.left }}
          data-drag-item={item.id}
          onPointerDown={handleBarPointerDown}
          onPointerEnter={handleHoverEnter}
          onPointerLeave={handleHoverLeave}
          onClick={handleTaskClick}
          onContextMenu={handleBarContextMenu}
          onKeyDown={handleKeyDown}
          aria-label={`${item.name || 'Task'}, ${formatDayKey(item.start)}${
            isDone ? ', done' : ', not done'
          }`}
        >
          {/* A point is a small target; this box is what a drawn link lands on */}
          <span
            className="absolute top-0 bottom-0 -left-3 w-6"
            data-dep-milestone={item.id}
            data-drop-section={section.id}
            aria-hidden="true"
          />
          {/* The circle is the checkbox: click to tick, press and move to drag */}
          <button
            type="button"
            role="checkbox"
            aria-checked={isDone}
            aria-label={`${isDone ? 'Uncheck' : 'Check'} ${item.name || 'task'}`}
            data-task-check=""
            onPointerDown={handleCheckPointerDown}
            className={`task-check absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 focus-ring ${
              isDone ? 'task-check--done' : ''
            } ${isSelected ? 'task-check--selected' : ''}`}
          />
          {/* The name is part of the task: hovering it reveals the dot, a click
              on it selects, and a press on it drags — as a bar's label does */}
          <span
            className={`absolute top-1/2 left-3 -translate-y-1/2 text-meta text-[var(--color-text-secondary)] whitespace-nowrap ${
              isDone ? 'task-name--done' : ''
            }`}
          >
            {item.name}
          </span>
          {showDependencies && (
            <DependencyDot
              anchor="end"
              variant="task"
              isConnected={isMilestoneConnected}
              onStartDraw={handleDependencyDraw}
              label={`Link ${item.name || 'task'}`}
            />
          )}
        </div>
      ) : (
        <div
          className={`absolute top-0 bottom-0 timeline-point touch-none focus-ring ${
            isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          } ${isDragged ? 'timeline-point--lifted' : ''}`}
          style={{ left: rect.left }}
          data-drag-item={item.id}
          onPointerDown={handleBarPointerDown}
          onPointerEnter={handleHoverEnter}
          onPointerLeave={handleHoverLeave}
          onClick={handleBarClick}
          onContextMenu={handleBarContextMenu}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${displayName}, ${formatDayKey(item.start)}`}
        >
          {/* A point is a small target; this box is what a drawn link lands on */}
          <span
            className="absolute top-0 bottom-0 -left-3 w-6"
            data-dep-milestone={item.id}
            data-drop-section={section.id}
            aria-hidden="true"
          />
          <div
            className={`absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 ${
              isSelected ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-primary)]'
            }`}
            aria-hidden="true"
          />
          {/* The name is part of the milestone, as a task's is: a click on it
              selects and a press on it drags, rather than drawing a bar */}
          <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-meta text-[var(--color-text-secondary)] whitespace-nowrap">
            {item.name}
          </span>
          {showDependencies && (
            <DependencyDot
              anchor="end"
              variant="milestone"
              isConnected={isMilestoneConnected}
              onStartDraw={handleDependencyDraw}
              label={`Link ${item.name || 'milestone'}`}
            />
          )}
        </div>
      )}
    </div>
  );
});
