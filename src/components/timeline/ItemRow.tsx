import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { DependencyAnchor, Section, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import type { FlatRow } from '../../utils/timelineUtils';
import {
  barInsetForDepth,
  getBarRect,
  labelInsetForDepth,
  xToDay,
} from '../../utils/timelineUtils';
import { addDaysToKey, dayKeyDiff, snapKeyToBusinessDay } from '../../utils/dayKeys';
import { formatDayKey } from '../../utils/dateUtils';
import { getReadableTextColor } from '../../utils/colorUtils';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useItemDrag } from '../../hooks/useItemDrag';
import { useDependencyDraw } from '../../hooks/useDependencyDraw';
import { useAnchorConnected, useItemConnected } from '../../hooks/useDependencyState';
import { reportDependencyHover, reportDependencyLeave } from '../../utils/dependencyHover';
import { useCreateGhost, type CreateGestureInfo } from '../../hooks/useCreateGhost';
import { useIsDragged, useIsDropReceiver, useIsDropSlot } from '../../hooks/useDropState';
import {
  createBarAt,
  drawnSpanDescriber,
  DEFAULT_BAR_DAYS,
  DEFAULT_NESTED_BAR_DAYS,
} from '../../utils/creationUtils';
import { DragHandle } from './DragHandle';
import { DependencyDot } from './DependencyDot';
import { GhostBar } from './GhostBar';
import { DropLine } from './DropLine';

/** The dates a resize is currently showing, and which edge is doing it. */
interface ResizeState {
  readonly edge: 'start' | 'end';
  readonly start: string;
  readonly end: string;
}

/** Where the resize began, plus what it has most recently shown. */
interface ResizeOrigin {
  accumulated: number;
  readonly start: string;
  readonly end: string;
  latest: ResizeState;
}

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
  const setItemDates = useSectionStore((s) => s.setItemDates);
  const toggleItemCollapse = useSectionStore((s) => s.toggleItemCollapse);

  const skipWeekends = useProjectStore(
    (s) => s.project?.settings?.skipWeekends ?? DEFAULT_PROJECT_SETTINGS.skipWeekends
  );

  const selectItem = useUIStore((s) => s.selectItem);
  const setDragging = useUIStore((s) => s.setDragging);
  const isSelected = useUIStore((s) => s.selection.type === 'item' && s.selection.id === item.id);

  const isDragged = useIsDragged(item.id);
  const isReceiver = useIsDropReceiver(item.id);
  const isSlotBefore = useIsDropSlot(section.id, row.parentId, row.index);
  const isSlotAfter = useIsDropSlot(section.id, row.parentId, row.index + 1);

  const { startDrag, hasDraggedRef } = useItemDrag();
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === item.id;
  const { handleLabelContextMenu, handleBarContextMenu, openAt } = useContextMenu(
    'item',
    item.id,
    section.id
  );

  /**
   * A resize in flight is a local preview, not a store write. The rect is the
   * one place that has to know, so the bar answers the pointer while the rest
   * of the timeline carries on believing the dates it already had.
   */
  const [resize, setResize] = useState<ResizeState | null>(null);

  const rect = useMemo(
    () =>
      getBarRect(
        resize ? { ...item, start: resize.start, end: resize.end } : item,
        viewport,
        pixelsPerDay
      ),
    [item, resize, viewport, pixelsPerDay]
  );
  const inset = barInsetForDepth(depth);
  const textColor = getReadableTextColor(color);
  const isBar = item.kind === 'bar';
  const hasChildren = item.children.length > 0;

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
    if (isBar && hasChildren) toggleItemCollapse(section.id, item.id);
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

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      toggleItemCollapse(section.id, item.id);
    },
    [toggleItemCollapse, section.id, item.id]
  );

  // -- dependencies --------------------------------------------------------

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

  // Hover is what reveals this item's links; a finger has no hover to report
  const handleDependencyHoverEnter = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType === 'mouse') reportDependencyHover(item.id);
    },
    [item.id]
  );
  const handleDependencyHoverLeave = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType === 'mouse') reportDependencyLeave(item.id);
    },
    [item.id]
  );

  // -- moving --------------------------------------------------------------

  const handleBarPointerDown = useCallback(
    (e: React.PointerEvent): void => {
      handlePressSelect(e);
      if (isLocked) return;
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
      handlePressSelect(e);
      if (isLocked) return;
      startDrag(e, { item, sectionId: section.id, pixelsPerDay: 0 });
    },
    [handlePressSelect, isLocked, startDrag, item, section.id]
  );

  // -- resizing ------------------------------------------------------------

  /**
   * Resizing is the same bargain dragging already struck: show it, then write
   * it once.
   *
   * The old path called `setItemDates` on every move, which re-rendered the
   * whole timeline column at pointer rate to move one edge of one bar. Holding
   * the candidate dates here instead means a move costs this row and nothing
   * else, undo gets a single step without needing a transaction to collapse
   * one, and Escape is free — there is nothing written to take back.
   */
  const resizeOrigin = useRef<ResizeOrigin | null>(null);

  const handleResizeStart = useCallback(
    (edge: 'start' | 'end'): void => {
      if (isLocked) return;
      setDragging(true, edge === 'start' ? 'resize-start' : 'resize-end');
      resizeOrigin.current = {
        accumulated: 0,
        start: item.start,
        end: item.end,
        latest: { edge, start: item.start, end: item.end },
      };
      setResize({ edge, start: item.start, end: item.end });
    },
    [isLocked, setDragging, item.start, item.end]
  );

  const handleResize = useCallback(
    (edge: 'start' | 'end', deltaX: number): void => {
      const origin = resizeOrigin.current;
      if (!origin || pixelsPerDay <= 0) return;
      origin.accumulated += deltaX;
      const days = Math.round(origin.accumulated / pixelsPerDay);

      let next: ResizeState;
      if (edge === 'start') {
        const candidate = addDaysToKey(origin.start, days);
        // An edge never crosses the other one; one day is the floor
        const start =
          dayKeyDiff(candidate, origin.end) < 1 ? addDaysToKey(origin.end, -1) : candidate;
        next = { edge, start, end: origin.end };
      } else {
        const candidate = addDaysToKey(origin.end, days);
        const end =
          dayKeyDiff(origin.start, candidate) < 1 ? addDaysToKey(origin.start, 1) : candidate;
        next = { edge, start: origin.start, end };
      }

      const previous = origin.latest;
      if (previous.start === next.start && previous.end === next.end) return;
      // Pixels arrive far faster than days change. Only a new day is news.
      origin.latest = next;
      setResize(next);
    },
    [pixelsPerDay]
  );

  const handleResizeEnd = useCallback((): void => {
    const origin = resizeOrigin.current;
    resizeOrigin.current = null;
    setDragging(false);
    hasDraggedRef.current = true;
    setResize(null);
    if (!origin) return;

    const { start: from, end: to, latest } = origin;
    if (latest.start === from && latest.end === to) return;

    // "Skip weekends" belongs to the commit, not the gesture: both edges were
    // chosen, so each squares up on its own — unless squaring up would leave no
    // bar at all, in which case the dragged dates stand.
    const start = skipWeekends ? snapKeyToBusinessDay(latest.start) : latest.start;
    const end = skipWeekends ? snapKeyToBusinessDay(latest.end) : latest.end;
    const collapsed = dayKeyDiff(start, end) < 1;
    setItemDates(
      section.id,
      item.id,
      collapsed ? latest.start : start,
      collapsed ? latest.end : end
    );
  }, [setDragging, hasDraggedRef, skipWeekends, setItemDates, section.id, item.id]);

  /** Escape, or a gesture the browser took back. The preview simply goes. */
  const handleResizeCancel = useCallback((): void => {
    resizeOrigin.current = null;
    setDragging(false);
    hasDraggedRef.current = true;
    setResize(null);
  }, [setDragging, hasDraggedRef]);

  const startBubble = resize?.edge === 'start' ? formatDayKey(resize.start, 'MMM d') : undefined;
  const endBubble = resize?.edge === 'end' ? formatDayKey(resize.end, 'MMM d') : undefined;

  // -- creating in this row's empty space ----------------------------------

  // Open space beside any row draws a new bar into that row's own group, and
  // lands it directly below the row it was drawn in. Drawing where the work
  // belongs beats drawing it at the root and dragging it in afterwards.
  const canCreateHere = !isLabel;

  // "Skip weekends" belongs to the commit, not the gesture: the ghost tracks
  // the cursor exactly, and the day it lands on is squared up once, here.
  const snapCreateDay = useCallback(
    (key: string): string => (skipWeekends ? snapKeyToBusinessDay(key) : key),
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

  const handleGhostDraw = useCallback(
    ({ startPx, endPx, point }: CreateGestureInfo): void => {
      // Both drawn edges were chosen, so each squares up on its own — the same
      // bargain resize strikes. A span drawn across a weekend can collapse onto
      // a single Monday that way; `createBarAt` holds the floor of one day.
      createBarAt(
        section.id,
        {
          span: {
            start: snapCreateDay(xToDay(startPx, viewport, pixelsPerDay)),
            end: snapCreateDay(xToDay(endPx, viewport, pixelsPerDay)),
          },
          parentId: row.parentId,
          index: row.index + 1,
        },
        point
      );
    },
    [section.id, viewport, pixelsPerDay, row.parentId, row.index, snapCreateDay]
  );

  // The dates the draw reports come off the same conversion the drop commits
  const describeSpan = useMemo(
    () => drawnSpanDescriber(viewport, pixelsPerDay, snapCreateDay),
    [viewport, pixelsPerDay, snapCreateDay]
  );

  const ghost = useCreateGhost({
    // The hover ghost previews the bar creation will actually produce, which is
    // shorter inside a group than at the root
    defaultWidth:
      (row.parentId === null ? DEFAULT_BAR_DAYS : DEFAULT_NESTED_BAR_DAYS) * pixelsPerDay,
    disabled: !canCreateHere,
    describeSpan,
    onDoubleClickCreate: handleGhostDoubleClick,
    onDrawCreate: handleGhostDraw,
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
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const bounds = (e.target as HTMLElement).getBoundingClientRect();
        selectItem(item.id, section.id, { x: bounds.right, y: bounds.top });
      }
    },
    [selectItem, item.id, section.id]
  );

  // -- labels column -------------------------------------------------------

  if (isLabel) {
    return (
      <div
        className={`group flex items-center gap-1.5 pr-3 cursor-pointer row-selectable focus-ring ${
          isSelected ? 'selected' : ''
        } ${isDragged ? 'is-dragged-row' : ''}`}
        style={{ height: row.height, paddingLeft: labelInsetForDepth(depth) }}
        onClick={isEditingName ? undefined : handleLabelClick}
        onDoubleClick={isEditingName ? undefined : label.handleDoubleClick}
        onPointerDown={isEditingName ? undefined : handleLabelPointerDown}
        onContextMenu={handleLabelContextMenu}
        onKeyDown={isEditingName ? undefined : handleKeyDown}
        role="listitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-label={`${item.name || 'Untitled'}${isSelected ? ', selected' : ''}${
          isLocked ? ', locked' : ''
        }`}
      >
        {isBar && hasChildren ? (
          <button
            onClick={handleToggleCollapse}
            onPointerDown={(e) => e.stopPropagation()}
            className="row-affordance w-5 h-5 flex-shrink-0 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded transition-colors duration-fast"
            data-always-visible={item.isCollapsed ? 'true' : undefined}
            aria-expanded={!item.isCollapsed}
            aria-label={`${item.isCollapsed ? 'Expand' : 'Collapse'} ${item.name}`}
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
            {!isBar && (
              <span className="block w-1.5 h-1.5 mx-auto rotate-45 bg-[var(--color-text-muted)]" />
            )}
          </span>
        )}

        {isEditingName ? (
          <input
            ref={inlineEdit.inputRef}
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
            className={`truncate flex-1 ${
              depth === 0
                ? 'text-body text-[var(--color-text-primary)]'
                : 'text-body text-[var(--color-text-secondary)]'
            }`}
          >
            {item.name || (isBar ? 'Untitled' : 'Milestone')}
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

  return (
    <div
      className={`group relative ${ghost.ghost !== null ? 'cursor-copy' : ''}`}
      style={{ height: row.height }}
      data-drop-row={item.id}
      data-drop-section={section.id}
      data-drop-parent={row.parentId ?? ''}
      data-drop-index={row.index}
      onContextMenu={handleRowContextMenu}
      onDoubleClick={canCreateHere ? ghost.handleDoubleClick : undefined}
      onPointerMove={canCreateHere ? ghost.handlePointerMove : undefined}
      onPointerLeave={canCreateHere ? ghost.handlePointerLeave : undefined}
      onPointerDown={canCreateHere ? ghost.handlePointerDown : undefined}
      role="listitem"
    >
      {/* The row in flight is already where it is; a line there says nothing */}
      {isSlotBefore && !isDragged && <DropLine position="top" />}
      {row.isLastRenderedSibling && isSlotAfter && !isDragged && <DropLine position="bottom" />}

      {ghost.ghost !== null && (
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
      )}

      {isBar ? (
        <div
          data-drop-bar={item.id}
          data-drop-section={section.id}
          className={`absolute timeline-bar group/bar overflow-visible touch-none ${
            isLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
          } ${isSelected ? 'timeline-bar--selected' : ''} ${
            isReceiver ? 'timeline-bar--receiving' : ''
          } ${isDragged ? 'timeline-bar--lifted' : ''}`}
          style={{ left: rect.left, width: rect.width, top: inset, bottom: inset }}
          onPointerDown={handleBarPointerDown}
          onPointerEnter={handleDependencyHoverEnter}
          onPointerLeave={handleDependencyHoverLeave}
          onClick={handleBarClick}
          onDoubleClick={bar.handleDoubleClick}
          onContextMenu={handleBarContextMenu}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${item.name || 'Untitled'}, ${formatDayKey(item.start)} to ${formatDayKey(
            item.end
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
          <span className="timeline-bar__label">
            <span className="truncate" style={{ color: textColor }}>
              {item.name}
            </span>
          </span>

          {!isLocked && (
            <>
              <DragHandle
                edge="start"
                onDragStart={handleResizeStart}
                onDrag={handleResize}
                onDragEnd={handleResizeEnd}
                onDragCancel={handleResizeCancel}
                label={`Resize ${item.name} start`}
                dragDate={startBubble}
              />
              <DragHandle
                edge="end"
                onDragStart={handleResizeStart}
                onDrag={handleResize}
                onDragEnd={handleResizeEnd}
                onDragCancel={handleResizeCancel}
                label={`Resize ${item.name} end`}
                dragDate={endBubble}
              />
            </>
          )}

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
        </div>
      ) : (
        <div
          className={`absolute top-0 bottom-0 cursor-grab active:cursor-grabbing touch-none ${
            isDragged ? 'opacity-30' : ''
          }`}
          style={{ left: rect.left }}
          onPointerDown={handleBarPointerDown}
          onPointerEnter={handleDependencyHoverEnter}
          onPointerLeave={handleDependencyHoverLeave}
          onClick={handleBarClick}
          onContextMenu={handleBarContextMenu}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${item.name || 'Milestone'}, ${formatDayKey(item.start)}`}
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
          <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-meta text-[var(--color-text-secondary)] whitespace-nowrap pointer-events-none">
            {item.name}
          </span>
          <DependencyDot
            anchor="end"
            variant="milestone"
            isConnected={isMilestoneConnected}
            onStartDraw={handleDependencyDraw}
            label={`Link ${item.name || 'milestone'}`}
          />
        </div>
      )}
    </div>
  );
});
