import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import {
  CREATE_ROW_HEIGHT,
  LABEL_ROOT_INSET,
  ROW_HEIGHT,
  dayToX,
  flattenSection,
  getBarRect,
  headerMilestones,
  sectionBodyHeight,
  xToDay,
} from '../../utils/timelineUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { createBarAt, createMilestoneAt, DEFAULT_BAR_DAYS } from '../../utils/creationUtils';
import { getItemColor } from '../../types';
import { getReadableTextColor } from '../../utils/colorUtils';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useCreateGhost, type CreateGestureInfo } from '../../hooks/useCreateGhost';
import { useIsDropSlot } from '../../hooks/useDropState';
import { ItemRow } from './ItemRow';
import { HeaderMilestone } from './HeaderMilestone';
import { DropLine } from './DropLine';
import { GhostBar } from './GhostBar';
import { GhostMilestone } from './GhostMilestone';
import { PinBadge } from '../common';

interface DragHandleProps {
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly style: React.CSSProperties;
}

interface SectionRowProps {
  readonly section: Section;
  readonly isLabel: boolean;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly sectionIndex?: number;
  readonly dragHandleProps?: DragHandleProps;
  readonly isDragging?: boolean;
  readonly stickyMilestoneIds?: ReadonlySet<string>;
}

/**
 * A schedule: its own row, then one row per item at whatever depth.
 *
 * Both columns walk the same flattened row list, which is what keeps labels and
 * bars aligned no matter how deeply things have been nested by dragging.
 */
export const SectionRow = memo(function SectionRow({
  section,
  isLabel,
  viewport,
  pixelsPerDay,
  sectionIndex,
  dragHandleProps,
  isDragging,
  stickyMilestoneIds,
}: SectionRowProps): JSX.Element {
  const toggleSectionCollapse = useSectionStore((s) => s.toggleSectionCollapse);
  const updateSection = useSectionStore((s) => s.updateSection);
  const pinnedSectionId = useProjectStore((s) => s.project?.pinnedSectionId ?? null);
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );

  const selectSection = useUIStore((s) => s.selectSection);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const isSelected = useUIStore(
    (s) => s.selection.type === 'section' && s.selection.id === section.id
  );
  // A press the playhead has claimed is a date scrub, not a create
  const isPlayheadActive = useUIStore((s) => s.playheadPosition !== null);

  const headerRef = useRef<HTMLDivElement>(null);
  const [milestoneGhostX, setMilestoneGhostX] = useState<number | null>(null);
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === section.id;
  const isPinned = section.id === pinnedSectionId;

  const rows = useMemo(() => flattenSection(section), [section]);
  const bodyHeight = useMemo(() => sectionBodyHeight(section), [section]);
  const markers = useMemo(() => headerMilestones(section), [section]);
  const rootBarCount = useMemo(
    () => section.items.filter((item) => item.kind === 'bar').length,
    [section.items]
  );

  // Slot at the very end of the root list — where "drop past the last row" goes
  const isAppendSlot = useIsDropSlot(section.id, null, section.items.length);

  // Collision-aware label placement. A sticky marker prints its label up in the
  // sticky strip, so it does not reserve room here; a collapsed schedule folds
  // its bars into this same row, so labels stand down entirely.
  const labelPlacements = useMemo(() => {
    const candidates = markers
      .filter((milestone) => !stickyMilestoneIds?.has(milestone.id))
      .map((milestone) => ({
        id: milestone.id,
        center: dayToX(milestone.start, viewport, pixelsPerDay),
        width: measureMilestoneLabelWidth(milestone.name),
      }));
    const placements = layoutLabels(candidates);
    if (!section.isCollapsed) return placements;
    return new Map(
      [...placements].map(([id, placement]) => [id, { ...placement, isHidden: true }])
    );
  }, [markers, stickyMilestoneIds, viewport, pixelsPerDay, section.isCollapsed]);

  // -- schedule label ------------------------------------------------------

  const handleSelectSection = useCallback(
    (e: React.MouseEvent): void => {
      selectSection(section.id, { x: e.clientX, y: e.clientY });
    },
    [selectSection, section.id]
  );

  const handleRenameSection = useCallback((): void => {
    inlineEdit.startEditing(section.id, section.name || '');
  }, [inlineEdit, section.id, section.name]);

  const handleSaveName = useCallback(
    (name: string): void => {
      updateSection(section.id, { name });
    },
    [updateSection, section.id]
  );

  const labelClick = useDoubleClick(handleSelectSection, handleRenameSection);

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      toggleSectionCollapse(section.id);
    },
    [toggleSectionCollapse, section.id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const bounds = (e.target as HTMLElement).getBoundingClientRect();
        selectSection(section.id, { x: bounds.right, y: bounds.top });
      }
    },
    [selectSection, section.id]
  );

  const handleLabelContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: 'section',
        targetId: section.id,
        sectionId: section.id,
        location: 'label',
      });
    },
    [openContextMenu, section.id]
  );

  // -- schedule header row (timeline side) ---------------------------------

  const dayAtEvent = useCallback(
    (e: React.MouseEvent, element: HTMLElement | null): string => {
      const bounds = element?.getBoundingClientRect();
      const offset = bounds ? e.clientX - bounds.left : 0;
      return xToDay(offset, viewport, pixelsPerDay);
    },
    [viewport, pixelsPerDay]
  );

  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: 'section',
        targetId: section.id,
        sectionId: section.id,
        location: 'header',
        clickDay: dayAtEvent(e, headerRef.current),
      });
    },
    [openContextMenu, section.id, dayAtEvent]
  );

  // The ghost tracks free space on the schedule's own row only — over a marker
  // or a collapsed bar the double-click would mean something else, so the row
  // stops offering a milestone there. A held button means a drag is passing
  // through, not a hover.
  const handleHeaderMouseMove = useCallback((e: React.MouseEvent): void => {
    if (e.buttons !== 0 || e.target !== e.currentTarget) {
      setMilestoneGhostX((previous) => (previous === null ? previous : null));
      return;
    }
    const bounds = headerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setMilestoneGhostX(e.clientX - bounds.left);
  }, []);

  const handleHeaderMouseLeave = useCallback((): void => {
    setMilestoneGhostX(null);
  }, []);

  // Same bargain the bar ghost strikes: once the playhead is up the hold reads
  // as a date scrub, so the milestone preview stands down until the next move
  useEffect(() => {
    if (!isPlayheadActive) return;
    setMilestoneGhostX((previous) => (previous === null ? previous : null));
  }, [isPlayheadActive]);

  // Double-clicking the schedule's own row drops a milestone there
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target !== e.currentTarget) return;
      createMilestoneAt(
        section.id,
        { day: dayAtEvent(e, headerRef.current) },
        { x: e.clientX, y: e.clientY }
      );
    },
    [section.id, dayAtEvent]
  );

  // -- creating in the schedule's open space --------------------------------

  const handleBodyGhostDoubleClick = useCallback(
    ({ startPx, point }: CreateGestureInfo): void => {
      createBarAt(section.id, { startDay: xToDay(startPx, viewport, pixelsPerDay) }, point);
    },
    [section.id, viewport, pixelsPerDay]
  );

  const handleBodyGhostDraw = useCallback(
    ({ startPx, endPx, point }: CreateGestureInfo): void => {
      createBarAt(
        section.id,
        {
          span: {
            start: xToDay(startPx, viewport, pixelsPerDay),
            end: xToDay(endPx, viewport, pixelsPerDay),
          },
        },
        point
      );
    },
    [section.id, viewport, pixelsPerDay]
  );

  const bodyGhost = useCreateGhost({
    defaultWidth: DEFAULT_BAR_DAYS * pixelsPerDay,
    onDoubleClickCreate: handleBodyGhostDoubleClick,
    onDrawCreate: handleBodyGhostDraw,
  });

  const ghostColor = section.isMulticolor
    ? getItemColor(
        { color: null } as never,
        section,
        rootBarCount,
        Math.max(1, rootBarCount + 1)
      )
    : section.color;

  const tint =
    coloredRows && !section.isMulticolor ? { backgroundColor: `${section.color}08` } : undefined;

  // -- labels column -------------------------------------------------------

  if (isLabel) {
    return (
      <div
        className={`border-t border-[var(--color-hairline)] ${isDragging ? 'opacity-50' : ''}`}
        style={tint}
        role="group"
        aria-label={`${section.name} schedule`}
      >
        <div
          className={`group flex items-center gap-1.5 pr-3 cursor-pointer row-selectable focus-ring ${
            isSelected ? 'selected' : ''
          }`}
          style={{ height: ROW_HEIGHT, paddingLeft: LABEL_ROOT_INSET }}
          onClick={isEditingName ? undefined : labelClick.handleClick}
          onDoubleClick={isEditingName ? undefined : labelClick.handleDoubleClick}
          onContextMenu={handleLabelContextMenu}
          onKeyDown={isEditingName ? undefined : handleKeyDown}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${section.name} schedule${isSelected ? ', selected' : ''}`}
        >
          <button
            onClick={handleToggleCollapse}
            className="row-affordance w-5 h-5 flex-shrink-0 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded transition-colors duration-150"
            data-always-visible={section.isCollapsed ? 'true' : undefined}
            aria-expanded={!section.isCollapsed}
            aria-label={`${section.isCollapsed ? 'Expand' : 'Collapse'} ${section.name}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${section.isCollapsed ? '' : 'expanded'}`}
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
          {isEditingName ? (
            <input
              ref={inlineEdit.inputRef}
              className="text-sm font-semibold text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1"
              value={inlineEdit.editedName}
              onChange={inlineEdit.handleChange}
              onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSaveName)}
              onBlur={() => inlineEdit.saveEdit(handleSaveName)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {section.name || 'Untitled Schedule'}
            </span>
          )}
          <span className="flex-1" />
          {section.isLocked && (
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
          {isPinned && <PinBadge size="sm" />}
          {dragHandleProps && sectionIndex !== undefined && (
            <div
              {...dragHandleProps}
              className="row-affordance flex-shrink-0 flex items-center justify-center w-4 h-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded transition-colors duration-150"
              title="Drag to reorder"
              aria-label={`Drag to reorder ${section.name}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                <circle cx="2" cy="2" r="1.5" />
                <circle cx="8" cy="2" r="1.5" />
                <circle cx="2" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="2" cy="14" r="1.5" />
                <circle cx="8" cy="14" r="1.5" />
              </svg>
            </div>
          )}
        </div>

        {!section.isCollapsed && (
          <div role="list" aria-label={`${section.name} items`}>
            {rows.map((row) => (
              <ItemRow
                key={row.item.id}
                row={row}
                section={section}
                isLabel
                viewport={viewport}
                pixelsPerDay={pixelsPerDay}
              />
            ))}
            <div style={{ height: CREATE_ROW_HEIGHT }} aria-hidden="true" />
          </div>
        )}
      </div>
    );
  }

  // -- timeline column -----------------------------------------------------

  return (
    <div
      className={`border-t border-[var(--color-hairline)] ${isDragging ? 'opacity-50' : ''}`}
      style={tint}
      role="group"
      aria-label={`${section.name} schedule timeline`}
    >
      {/* The schedule's own row: root milestones, and its bars when collapsed */}
      <div
        ref={headerRef}
        className={`relative timeline-plot ${milestoneGhostX !== null ? 'cursor-copy' : ''}`}
        style={{ height: ROW_HEIGHT }}
        data-drop-header={section.id}
        data-drop-section={section.id}
        onDoubleClick={handleHeaderDoubleClick}
        onContextMenu={handleHeaderContextMenu}
        onMouseMove={handleHeaderMouseMove}
        onMouseLeave={handleHeaderMouseLeave}
      >
        {milestoneGhostX !== null && (
          <GhostMilestone x={milestoneGhostX} lineHeight={bodyHeight} />
        )}

        {section.isCollapsed &&
          section.items
            .filter((item) => item.kind === 'bar')
            .map((item, index) => {
              const rect = getBarRect(item, viewport, pixelsPerDay);
              const color = getItemColor(item, section, index, rootBarCount);
              return (
                <div
                  key={item.id}
                  className="absolute top-1 bottom-1 timeline-bar pointer-events-none"
                  style={{ left: rect.left, width: rect.width }}
                  aria-hidden="true"
                >
                  <div className="timeline-bar__fill" style={{ backgroundColor: color }} />
                  <span className="timeline-bar__label">
                    <span className="truncate" style={{ color: getReadableTextColor(color) }}>
                      {item.name}
                    </span>
                  </span>
                </div>
              );
            })}

        {markers.map((milestone) => (
          <HeaderMilestone
            key={milestone.id}
            item={milestone}
            section={section}
            viewport={viewport}
            pixelsPerDay={pixelsPerDay}
            lineHeight={bodyHeight}
            isHidden={stickyMilestoneIds?.has(milestone.id)}
            labelPlacement={labelPlacements.get(milestone.id)}
          />
        ))}
      </div>

      {/* Item rows, then open space that is both a create surface and a drop zone */}
      {!section.isCollapsed && (
        <div className="relative timeline-plot" role="list" aria-label={`${section.name} bars`}>
          {rows.map((row) => (
            <ItemRow
              key={row.item.id}
              row={row}
              section={section}
              isLabel={false}
              viewport={viewport}
              pixelsPerDay={pixelsPerDay}
            />
          ))}

          <div
            className={`group relative ${bodyGhost.ghost !== null ? 'cursor-copy' : ''}`}
            style={{ height: CREATE_ROW_HEIGHT }}
            data-drop-body={section.id}
            data-drop-count={section.items.length}
            onDoubleClick={bodyGhost.handleDoubleClick}
            onMouseMove={bodyGhost.handleMouseMove}
            onMouseLeave={bodyGhost.handleMouseLeave}
            onMouseDown={bodyGhost.handleMouseDown}
          >
            {isAppendSlot && <DropLine position="top" />}
            {bodyGhost.ghost !== null && (
              <GhostBar
                left={bodyGhost.ghost.left}
                width={bodyGhost.ghost.width}
                color={ghostColor}
                isDrawing={bodyGhost.ghost.isDrawing}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});
