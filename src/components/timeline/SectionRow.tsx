import { useCallback, useRef, useMemo, useState, memo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, TASK_ROW_HEIGHT, getBarDimensions, getRelativeFromPosition } from '../../utils/timelineUtils';
import { sectionToViewportRelative, viewportToSectionRelative } from '../../utils/dateUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { createPhaseAt, createMilestoneAt, DEFAULT_PHASE_DAYS } from '../../utils/creationUtils';
import { getNextPhaseColor } from '../../constants/colors';
import { getPhaseColor } from '../../types';
import { getReadableTextColor } from '../../utils/colorUtils';
import { PhaseRow } from './PhaseRow';
import { MilestoneMarker } from './MilestoneMarker';
import { EmptyStateHint } from './EmptyStateHint';
import { GhostBar } from './GhostBar';
import { PinBadge } from '../common';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useDragReorder } from '../../hooks/useDragReorder';
import { useCreateGhost } from '../../hooks/useCreateGhost';
import type { CreateGestureInfo } from '../../hooks/useCreateGhost';

interface DragHandleProps {
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly style: React.CSSProperties;
}

interface SectionRowProps {
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly sectionIndex?: number;
  readonly dragHandleProps?: DragHandleProps;
  readonly isDragging?: boolean;
  readonly stickyMilestoneIds?: ReadonlySet<string>;
}

export const SectionRow = memo(function SectionRow({
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
  sectionIndex,
  dragHandleProps,
  isDragging,
  stickyMilestoneIds,
}: SectionRowProps): JSX.Element {
  const toggleSectionCollapse = useSectionStore((s) => s.toggleSectionCollapse);
  const updateSection = useSectionStore((s) => s.updateSection);
  const reorderPhases = useSectionStore((s) => s.reorderPhases);
  const project = useProjectStore((state) => state.project);
  const coloredRows = useProjectStore((state) => state.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows);
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const [ghostX, setGhostX] = useState<number | null>(null);

  // Inline edit for section name
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === section.id;

  const isPinned = section.id === project?.pinnedSectionId;

  // Sort phases by order for consistent rendering and gradient coloring
  const sortedPhases = useMemo(
    () => [...section.phases].sort((a, b) => a.order - b.order),
    [section.phases]
  );
  const totalPhases = sortedPhases.length;

  // Calculate the height of content below header for milestone line
  const milestoneLineHeight = useMemo(() => {
    if (section.isCollapsed) return 0;
    let height = 0;
    section.phases.forEach((phase) => {
      height += ROW_HEIGHT; // Phase row
      if (!phase.isCollapsed) {
        // Expanded empty phases show one empty task-creation row
        height += Math.max(phase.tasks.length, 1) * TASK_ROW_HEIGHT;
      }
    });
    return height;
  }, [section.phases, section.isCollapsed]);

  // Collision-aware label placement: overlapping labels are dodged right or
  // hidden (revealed on diamond hover). Sticky milestones render their label
  // in the sticky strip, so they don't reserve space here.
  //
  // Labels sit in the lower half of the header row, which is empty while the
  // section is expanded. Collapsing folds every phase bar into that same row,
  // so the labels would land on top of the bars — hide them there and let the
  // existing hover-reveal surface a name on demand. A collapsed section is
  // asking for less detail, not more.
  const milestoneLabelPlacements = useMemo(() => {
    const candidates = section.milestones
      .filter((milestone) => !stickyMilestoneIds?.has(milestone.id))
      .map((milestone) => ({
        id: milestone.id,
        center:
          sectionToViewportRelative(milestone.relativePosition, section, viewportBounds) *
          timelineWidth,
        width: measureMilestoneLabelWidth(milestone.name),
      }));
    const placements = layoutLabels(candidates);
    if (!section.isCollapsed) return placements;

    return new Map(
      [...placements].map(([id, placement]) => [id, { ...placement, isHidden: true }])
    );
  }, [section, stickyMilestoneIds, viewportBounds, timelineWidth]);

  // Handle keyboard interaction for team selection
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('section', section.id, section.id, null, { x: rect.right, y: rect.top });
      }
    },
    [selectItem, section.id]
  );

  const isSelected = selection.type === 'section' && selection.id === section.id;

  // Inline edit callbacks
  const handleSaveEdit = useCallback(
    (trimmedName: string) => {
      updateSection(section.id, { name: trimmedName });
    },
    [updateSection, section.id]
  );

  // Double-click on section label starts inline edit
  const onLabelDoubleClick = useCallback(
    (_e: React.MouseEvent) => {
      inlineEdit.startEditing(section.id, section.name || '');
    },
    [inlineEdit, section.id, section.name]
  );

  const onLabelSingleClick = useCallback(
    (e: React.MouseEvent) => {
      selectItem('section', section.id, section.id, null, { x: e.clientX, y: e.clientY });
    },
    [selectItem, section.id]
  );

  const { handleClick: handleLabelClick, handleDoubleClick: handleLabelDoubleClick } = useDoubleClick(
    onLabelSingleClick,
    onLabelDoubleClick
  );

  // Phase drag reorder
  const handlePhaseReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderPhases(section.id, fromIndex, toIndex);
    },
    [reorderPhases, section.id]
  );

  const phaseDragReorder = useDragReorder({
    onReorder: handlePhaseReorder,
    itemCount: sortedPhases.length,
    rowHeight: ROW_HEIGHT,
  });

  // Handle click on collapsed phase bar - use data-attributes to avoid creating new functions per phase
  const handleCollapsedPhaseClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      const phaseId = (e.currentTarget as HTMLElement).dataset.phaseId;
      if (phaseId) {
        selectItem('phase', phaseId, section.id, null, { x: e.clientX, y: e.clientY });
      }
    },
    [selectItem, section.id]
  );

  // Handle keyboard on collapsed phase bar - use data-attributes to avoid creating new functions per phase
  const handleCollapsedPhaseKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const phaseId = (e.currentTarget as HTMLElement).dataset.phaseId;
        if (phaseId) {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          selectItem('phase', phaseId, section.id, null, { x: rect.right, y: rect.top });
        }
      }
    },
    [selectItem, section.id]
  );

  // Prevent double-click from propagating on collapsed phase bars
  const handleCollapsedPhaseDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);


  // Context menu for label area (section header label)
  const handleLabelContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'section', section.id, section.id, null, null, 'label');
  }, [openContextMenu, section.id]);

  // Context menu for header row (timeline side) - includes click position for "Add Milestone Here"
  const handleHeaderContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const rect = headerRowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    // Convert viewport-relative position to section-relative
    const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
    const clickRelativePosition = viewportToSectionRelative(viewportRelative, section, viewportBounds);
    openContextMenu({ x: e.clientX, y: e.clientY }, 'section', section.id, section.id, null, null, 'header', Math.max(0, Math.min(1, clickRelativePosition)));
  }, [openContextMenu, section.id, section, timelineWidth, viewportBounds]);

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleSectionCollapse(section.id);
  };

  // Ghost milestone preview while hovering free space of the header row.
  // Only tracks when the cursor is on the row itself — not over phase bars or
  // existing milestones, where double-click would do something different.
  const handleHeaderMouseMove = useCallback((e: React.MouseEvent): void => {
    if (e.target !== e.currentTarget) {
      setGhostX((prev) => (prev !== null ? null : prev));
      return;
    }
    const rect = headerRowRef.current?.getBoundingClientRect();
    if (!rect) return;
    setGhostX(e.clientX - rect.left);
  }, []);

  const handleHeaderMouseLeave = useCallback((): void => {
    setGhostX(null);
  }, []);

  // Double-click on header row creates a milestone
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      const rect = headerRowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clickX = e.clientX - rect.left;
      // Convert viewport-relative position to section-relative
      const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
      const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);

      createMilestoneAt(section.id, sectionRelative, { x: e.clientX, y: e.clientY });
    },
    [section, timelineWidth, viewportBounds]
  );

  // Convert a container px position to a section-relative position
  const pxToSectionRelative = useCallback(
    (px: number): number => {
      const viewportRelative = getRelativeFromPosition(px, timelineWidth);
      return viewportToSectionRelative(viewportRelative, section, viewportBounds);
    },
    [timelineWidth, section, viewportBounds]
  );

  // Px range the section's date range occupies — ghosts stay honest to it
  const sectionPxBounds = useMemo(
    () => ({
      min: sectionToViewportRelative(0, section, viewportBounds) * timelineWidth,
      max: sectionToViewportRelative(1, section, viewportBounds) * timelineWidth,
    }),
    [section, viewportBounds, timelineWidth]
  );

  // Width matches createPhaseAt's default (30 days, fallback 0.15 of timeline)
  const ghostPhaseWidth = useMemo(() => {
    if (viewportBounds.totalDays > 0) {
      return (DEFAULT_PHASE_DAYS / viewportBounds.totalDays) * timelineWidth;
    }
    return 0.15 * timelineWidth;
  }, [viewportBounds.totalDays, timelineWidth]);

  const ghostPhaseColor = section.isMulticolor ? getNextPhaseColor(0) : section.color;

  // Hover ghost + drag-to-draw for the empty phases area (no phases yet).
  // When phases exist their rows cover this container, so it stays inert.
  const handlePhaseGhostDoubleClick = useCallback(
    ({ startPx, point }: CreateGestureInfo): void => {
      createPhaseAt(section.id, { startAt: pxToSectionRelative(startPx) }, point);
    },
    [section.id, pxToSectionRelative]
  );

  const handlePhaseGhostDraw = useCallback(
    ({ startPx, endPx, point }: CreateGestureInfo): void => {
      createPhaseAt(
        section.id,
        { span: { start: pxToSectionRelative(startPx), end: pxToSectionRelative(endPx) } },
        point
      );
    },
    [section.id, pxToSectionRelative]
  );

  const phaseGhost = useCreateGhost({
    defaultWidth: ghostPhaseWidth,
    clampBounds: sectionPxBounds,
    onDoubleClickCreate: handlePhaseGhostDoubleClick,
    onDrawCreate: handlePhaseGhostDraw,
  });

  const phaseGhostDays =
    phaseGhost.ghost && timelineWidth > 0
      ? Math.max(1, Math.round((phaseGhost.ghost.width / timelineWidth) * viewportBounds.totalDays))
      : 0;
  const phaseGhostLabel = phaseGhost.ghost?.isDrawing
    ? `${phaseGhostDays}d`
    : 'Double-click · drag';

  if (isLabel) {
    // Render label column content
    return (
      <div
        className={`border-t border-[var(--color-hairline)] ${isDragging ? 'opacity-50' : ''}`}
        style={coloredRows && !section.isMulticolor ? { backgroundColor: section.color + '08' } : undefined}
        role="group"
        aria-label={`${section.name} schedule`}
      >
        {/* Section header label */}
        <div
          className={`group flex items-center gap-2 px-3 cursor-pointer row-selectable focus-ring ${isSelected ? 'selected' : ''}`}
          style={{ height: ROW_HEIGHT }}
          onClick={isEditingName ? undefined : handleLabelClick}
          onDoubleClick={isEditingName ? undefined : handleLabelDoubleClick}
          onContextMenu={handleLabelContextMenu}
          onKeyDown={!isEditingName ? handleKeyDown : undefined}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-label={`${section.name} schedule${isSelected ? ', selected' : ''}`}
        >
          {/* Drag handle for reordering (unpinned schedules only) */}
          {dragHandleProps && sectionIndex !== undefined && (
            <div
              {...dragHandleProps}
              className="row-affordance flex items-center justify-center w-4 h-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded transition-colors duration-150"
              title="Drag to reorder"
              aria-label={`Drag to reorder ${section.name}`}
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
            className="row-affordance w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded-md transition-colors duration-150"
            data-always-visible={section.isCollapsed ? 'true' : undefined}
            aria-expanded={!section.isCollapsed}
            aria-label={`${section.isCollapsed ? 'Expand' : 'Collapse'} ${section.name}`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${
                section.isCollapsed ? '' : 'expanded'
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
          {isEditingName ? (
            <input
              ref={inlineEdit.inputRef}
              className="text-sm font-medium text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1"
              value={inlineEdit.editedName}
              onChange={inlineEdit.handleChange}
              onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSaveEdit)}
              onBlur={() => inlineEdit.saveEdit(handleSaveEdit)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {section.name || 'Untitled Schedule'}
            </span>
          )}
          <span className="flex-1" />
          {section.isLocked && (
            <svg className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-label="Locked">
              <path
                fillRule="evenodd"
                d="M4 6V4a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 7.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.5 6H4zm2-2a2 2 0 1 1 4 0v2H6V4z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {isPinned && <PinBadge size="sm" />}
        </div>

        {/* Phase labels (when expanded) */}
        {!section.isCollapsed && (
          <div role="list" aria-label={`${section.name} phases`} data-drag-container className="relative">
            {sortedPhases.length === 0 ? (
              <div style={{ height: ROW_HEIGHT }} />
            ) : (
              sortedPhases.map((phase, index) => (
                <PhaseRow
                  key={phase.id}
                  phase={phase}
                  section={section}
                  isLabel
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                  phaseIndex={index}
                  totalPhases={totalPhases}
                  dragHandleProps={phaseDragReorder.getDragHandleProps(index)}
                  isDragTarget={phaseDragReorder.state.isDragging && phaseDragReorder.state.dragIndex === index}
                />
              ))
            )}
            {phaseDragReorder.getDropIndicatorStyle() && (
              <div style={phaseDragReorder.getDropIndicatorStyle()!} />
            )}
          </div>
        )}
      </div>
    );
  }

  // Render timeline content
  return (
    <div
      className={`border-t border-[var(--color-hairline)] ${isDragging ? 'opacity-50' : ''}`}
      style={coloredRows && !section.isMulticolor ? { backgroundColor: section.color + '08' } : undefined}
      role="group"
      aria-label={`${section.name} schedule timeline`}
    >
      {/* Section header row with collapsed phase bars when collapsed */}
      <div
        ref={headerRowRef}
        className={`relative timeline-plot ${ghostX !== null ? 'cursor-copy' : ''}`}
        style={{ height: ROW_HEIGHT }}
        onDoubleClick={handleHeaderDoubleClick}
        onContextMenu={handleHeaderContextMenu}
        onMouseMove={handleHeaderMouseMove}
        onMouseLeave={handleHeaderMouseLeave}
      >
        {ghostX !== null && (
          <div
            className="absolute top-0 pointer-events-none z-20"
            style={{ left: ghostX, height: ROW_HEIGHT }}
            aria-hidden="true"
          >
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[var(--color-text-primary)] opacity-25" />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] whitespace-nowrap opacity-70">
              Double-click
            </div>
            {milestoneLineHeight > 0 && (
              <div
                className="absolute -translate-x-1/2"
                style={{
                  left: 0,
                  top: ROW_HEIGHT,
                  height: milestoneLineHeight,
                  borderLeft: '1px dashed var(--color-milestone-line)',
                  opacity: 0.6,
                }}
              />
            )}
          </div>
        )}
        {section.isCollapsed && (
          <>
            {sortedPhases.map((phase, index) => {
              // Convert section-relative positions to viewport-relative
              const viewportStart = sectionToViewportRelative(phase.relativeStart, section, viewportBounds);
              const viewportEnd = sectionToViewportRelative(phase.relativeEnd, section, viewportBounds);
              const { left, width } = getBarDimensions(
                viewportStart,
                viewportEnd,
                timelineWidth
              );
              const isPhaseSelected = selection.type === 'phase' && selection.id === phase.id;
              const effectiveColor = getPhaseColor(phase, section, index, totalPhases);

              return (
                <div
                  key={phase.id}
                  data-phase-id={phase.id}
                  className={`absolute top-1 bottom-1 cursor-pointer timeline-bar ${
                    isPhaseSelected ? 'timeline-bar--selected' : ''
                  }`}
                  style={{ left, width }}
                  onClick={handleCollapsedPhaseClick}
                  onDoubleClick={handleCollapsedPhaseDoubleClick}
                  onKeyDown={handleCollapsedPhaseKeyDown}
                  role="button"
                  tabIndex={0}
                  aria-label={`${phase.name} phase bar (collapsed view)`}
                  aria-selected={isPhaseSelected}
                >
                  <div className="timeline-bar__fill" style={{ backgroundColor: effectiveColor }} />
                  <span className="timeline-bar__label">
                    <span className="truncate" style={{ color: getReadableTextColor(effectiveColor) }}>
                      {phase.name}
                    </span>
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* Milestones rendered in header row */}
        {section.milestones.map((milestone) => (
          <MilestoneMarker
            key={milestone.id}
            milestone={milestone}
            section={section}
            timelineWidth={timelineWidth}
            viewportBounds={viewportBounds}
            lineHeight={milestoneLineHeight}
            isHidden={stickyMilestoneIds?.has(milestone.id)}
            labelPlacement={milestoneLabelPlacements.get(milestone.id)}
          />
        ))}
      </div>

      {/* Phase bars (when expanded) */}
      {!section.isCollapsed && (
        <div
          role="list"
          aria-label={`${section.name} phase bars`}
          className={`relative timeline-plot ${phaseGhost.ghost !== null ? 'cursor-copy' : ''}`}
          onDoubleClick={phaseGhost.handleDoubleClick}
          onMouseMove={phaseGhost.handleMouseMove}
          onMouseLeave={phaseGhost.handleMouseLeave}
          onMouseDown={phaseGhost.handleMouseDown}
        >
          {sortedPhases.length === 0 ? (
            <>
              {phaseGhost.ghost === null ? (
                <EmptyStateHint
                  text="Double-click or drag to add phase"
                  height={ROW_HEIGHT}
                  borderClass=""
                />
              ) : (
                <>
                  <div className="pointer-events-none" style={{ height: ROW_HEIGHT }} />
                  <GhostBar
                    left={phaseGhost.ghost.left}
                    width={phaseGhost.ghost.width}
                    color={ghostPhaseColor}
                    label={phaseGhostLabel}
                  />
                </>
              )}
            </>
          ) : (
            sortedPhases.map((phase, index) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                section={section}
                isLabel={false}
                timelineWidth={timelineWidth}
                viewportBounds={viewportBounds}
                phaseIndex={index}
                totalPhases={totalPhases}
                onTimelineReorder={phaseDragReorder.startReorder}
                isDragTarget={phaseDragReorder.state.isDragging && phaseDragReorder.state.dragIndex === index}
              />
            ))
          )}
          {phaseDragReorder.getDropIndicatorStyle() && (
            <div style={phaseDragReorder.getDropIndicatorStyle()!} />
          )}
        </div>
      )}
    </div>
  );
});
