import { useCallback, useRef, useMemo, useState, memo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, TASK_ROW_HEIGHT, getBarDimensions, getRelativeFromPosition } from '../../utils/timelineUtils';
import { sectionToViewportRelative, viewportToSectionRelative, getDaysBetween } from '../../utils/dateUtils';
import { getNextPhaseColor } from '../../constants/colors';
import { getPhaseColor } from '../../types';
import { PhaseRow } from './PhaseRow';
import { MilestoneMarker } from './MilestoneMarker';
import { EmptyStateHint } from './EmptyStateHint';
import { MasterBadge } from '../common';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { useDragReorder } from '../../hooks/useDragReorder';

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
  const addPhase = useSectionStore((s) => s.addPhase);
  const addMilestone = useSectionStore((s) => s.addMilestone);
  const reorderPhases = useSectionStore((s) => s.reorderPhases);
  const project = useProjectStore((state) => state.project);
  const coloredRows = useProjectStore((state) => state.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows);
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const phasesContainerRef = useRef<HTMLDivElement>(null);
  const [ghostX, setGhostX] = useState<number | null>(null);
  const [phaseGhostX, setPhaseGhostX] = useState<number | null>(null);

  // Inline edit for section name
  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === section.id;

  const isMasterSection = section.id === project?.masterSectionId;

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
        height += phase.tasks.length * TASK_ROW_HEIGHT;
      }
    });
    return height;
  }, [section.phases, section.isCollapsed]);

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
      if (!isMasterSection) {
        selectItem('section', section.id, section.id, null, { x: e.clientX, y: e.clientY });
      }
    },
    [isMasterSection, selectItem, section.id]
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

      addMilestone(section.id, {
        name: '',
        description: '',
        relativePosition: Math.max(0, Math.min(1, sectionRelative)),
        order: section.milestones.length,
      });

      // Get the new milestone
      const updatedSections = useSectionStore.getState().sections;
      const updatedSection = updatedSections.find((s) => s.id === section.id);
      const newMilestone = updatedSection?.milestones[updatedSection.milestones.length - 1];

      if (newMilestone) {
        selectItem('milestone', newMilestone.id, section.id, null, { x: e.clientX, y: e.clientY });
      }
    },
    [section, timelineWidth, viewportBounds, addMilestone, selectItem]
  );

  // Create a phase at a specific position (called by PhaseRow or container double-click)
  const createPhaseAtPosition = useCallback(
    (clientX: number, clientY: number, insertAtIndex: number): void => {
      // Get the phases container to calculate position
      const phasesContainer = document.querySelector(`[aria-label="${section.name} phase bars"]`) as HTMLElement | null;
      if (!phasesContainer) return;

      const rect = phasesContainer.getBoundingClientRect();
      const clickX = clientX - rect.left;
      // Convert viewport-relative position to section-relative
      const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
      const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);

      // Create a phase centered at the click position with 30-day width (relative to section)
      const sectionDays = getDaysBetween(section.startDate, section.endDate);
      const thirtyDaysRelative = sectionDays > 0 ? 30 / sectionDays : 0.15;
      const halfWidth = thirtyDaysRelative / 2;
      const relativeStart = Math.max(0, sectionRelative - halfWidth);
      const relativeEnd = Math.min(1, sectionRelative + halfWidth);

      // Add the phase at the end first
      addPhase(section.id, {
        name: '',
        description: '',
        color: isMasterSection ? getNextPhaseColor(section.phases.length) : null,
        order: insertAtIndex,
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
        // The new phase is at the end, move it to insertAtIndex position
        const currentIndex = updatedSection.phases.length - 1;
        const targetIndex = Math.min(insertAtIndex, updatedSection.phases.length - 1);

        if (currentIndex !== targetIndex) {
          useSectionStore.getState().reorderPhases(section.id, currentIndex, targetIndex);
        }

        selectItem('phase', newPhase.id, section.id, null, { x: clientX, y: clientY });
      }
    },
    [section, isMasterSection, timelineWidth, viewportBounds, addPhase, selectItem]
  );

  // Double-click on phases container creates a new phase at the end
  const handleCreatePhase = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      createPhaseAtPosition(e.clientX, e.clientY, section.phases.length);
    },
    [createPhaseAtPosition, section.phases.length]
  );

  // Ghost preview for empty phase row — mirrors what double-click will create.
  const handlePhasesMouseMove = useCallback((e: React.MouseEvent): void => {
    const rect = phasesContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPhaseGhostX(e.clientX - rect.left);
  }, []);

  const handlePhasesMouseLeave = useCallback((): void => {
    setPhaseGhostX(null);
  }, []);

  // Width matches createPhaseAtPosition (30 days, fallback 0.15 of timeline)
  const ghostPhaseWidth = useMemo(() => {
    if (viewportBounds.totalDays > 0) {
      return (30 / viewportBounds.totalDays) * timelineWidth;
    }
    return 0.15 * timelineWidth;
  }, [viewportBounds.totalDays, timelineWidth]);

  const ghostPhaseColor = isMasterSection ? getNextPhaseColor(0) : section.color;

  // Handle creating a phase after a specific phase (called from PhaseRow)
  const handleCreatePhaseAfter = useCallback(
    (afterOrder: number, clickX: number, clickY: number): void => {
      createPhaseAtPosition(clickX, clickY, afterOrder + 1);
    },
    [createPhaseAtPosition]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div
        className={`${!isMasterSection ? 'border-t-2 border-[var(--color-border)]' : ''} ${isDragging ? 'opacity-50' : ''} ${isMasterSection ? 'border-l-2 border-l-amber-400' : ''}`}
        style={!isMasterSection && coloredRows ? { backgroundColor: section.color + '0D' } : undefined}
        role="group"
        aria-label={`${section.name} ${isMasterSection ? 'timeline' : 'team'}`}
      >
        {/* Section header label */}
        <div
          className={`flex items-center gap-2 px-3 border-b ${isMasterSection ? 'bg-[var(--color-background)]' : ''} ${
            !isMasterSection ? 'cursor-pointer row-selectable focus-ring' : ''
          } ${isSelected ? 'selected' : ''}`}
          style={{ height: ROW_HEIGHT, borderColor: isMasterSection ? 'var(--color-row-border-strong)' : 'var(--color-row-border)' }}
          onClick={isEditingName ? undefined : handleLabelClick}
          onDoubleClick={isEditingName ? undefined : handleLabelDoubleClick}
          onContextMenu={handleLabelContextMenu}
          onKeyDown={!isMasterSection && !isEditingName ? handleKeyDown : undefined}
          role={!isMasterSection ? 'button' : undefined}
          tabIndex={!isMasterSection ? 0 : undefined}
          aria-selected={!isMasterSection ? isSelected : undefined}
          aria-label={!isMasterSection ? `${section.name} team${isSelected ? ', selected' : ''}` : undefined}
        >
          {/* Drag handle for reordering (teams only) */}
          {!isMasterSection && dragHandleProps && sectionIndex !== undefined && (
            <div
              {...dragHandleProps}
              className="flex items-center justify-center w-4 h-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded transition-colors duration-150"
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
            className="w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded-md transition-colors duration-150"
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
          {!isMasterSection && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: section.color }}
              aria-hidden="true"
            />
          )}
          {isEditingName ? (
            <input
              ref={inlineEdit.inputRef}
              className={`text-sm ${isMasterSection ? 'font-semibold' : 'font-medium'} text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1`}
              value={inlineEdit.editedName}
              onChange={inlineEdit.handleChange}
              onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSaveEdit)}
              onBlur={() => inlineEdit.saveEdit(handleSaveEdit)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`text-sm ${isMasterSection ? 'font-semibold' : 'font-medium'} text-[var(--color-text-primary)] truncate`}>
              {section.name || (isMasterSection ? 'Industrial Design' : 'Untitled Team')}
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
          {isMasterSection && <MasterBadge size="sm" />}
        </div>

        {/* Phase labels (when expanded) */}
        {!section.isCollapsed && (
          <div role="list" aria-label={`${section.name} phases`} data-drag-container className="relative">
            {sortedPhases.length === 0 ? (
              <div
                className="border-b"
                style={{ height: ROW_HEIGHT, borderColor: 'var(--color-row-border)' }}
              />
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
      className={`${!isMasterSection ? 'border-t-2 border-[var(--color-border)]' : ''} ${isDragging ? 'opacity-50' : ''}`}
      style={!isMasterSection && coloredRows ? { backgroundColor: section.color + '0D' } : undefined}
      role="group"
      aria-label={`${section.name} ${isMasterSection ? 'timeline bars' : 'team timeline'}`}
    >
      {/* Section header row with collapsed phase bars when collapsed */}
      <div
        ref={headerRowRef}
        className={`relative border-b ${ghostX !== null ? 'cursor-copy' : ''}`}
        style={{ height: ROW_HEIGHT, borderColor: isMasterSection ? 'var(--color-row-border-strong)' : 'var(--color-row-border)' }}
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
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-[var(--color-text-primary)] opacity-25" />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)] whitespace-nowrap opacity-70">
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
                  className={`absolute top-1 bottom-1 rounded-[10px] cursor-pointer timeline-bar ${
                    isPhaseSelected ? 'ring-2 ring-[var(--color-focus)] ring-offset-1' : ''
                  }`}
                  style={{
                    left,
                    width,
                    backgroundColor: effectiveColor,
                  }}
                  onClick={handleCollapsedPhaseClick}
                  onDoubleClick={handleCollapsedPhaseDoubleClick}
                  onKeyDown={handleCollapsedPhaseKeyDown}
                  role="button"
                  tabIndex={0}
                  aria-label={`${phase.name} phase bar (collapsed view)`}
                  aria-selected={isPhaseSelected}
                >
                  <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
                    <span className="text-xs font-medium text-white truncate drop-shadow-sm">
                      {phase.name}
                    </span>
                  </div>
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
          />
        ))}
      </div>

      {/* Phase bars (when expanded) */}
      {!section.isCollapsed && (
        <div
          ref={phasesContainerRef}
          role="list"
          aria-label={`${section.name} phase bars`}
          className={`relative ${sortedPhases.length === 0 && phaseGhostX !== null ? 'cursor-copy' : ''}`}
          onDoubleClick={handleCreatePhase}
          onMouseMove={sortedPhases.length === 0 ? handlePhasesMouseMove : undefined}
          onMouseLeave={sortedPhases.length === 0 ? handlePhasesMouseLeave : undefined}
        >
          {sortedPhases.length === 0 ? (
            <>
              {phaseGhostX === null && (
                <EmptyStateHint
                  text="Double-click to add phase"
                  height={ROW_HEIGHT}
                  borderClass="border-b"
                />
              )}
              {phaseGhostX !== null && (
                <>
                  <div
                    className="border-b"
                    style={{ height: ROW_HEIGHT, borderColor: 'var(--color-row-border-light)' }}
                  />
                  <div
                    className="absolute top-2 bottom-2 rounded-[10px] pointer-events-none flex items-center justify-center px-2 overflow-hidden"
                    style={{
                      left: phaseGhostX - ghostPhaseWidth / 2,
                      width: ghostPhaseWidth,
                      backgroundColor: ghostPhaseColor,
                      opacity: 0.3,
                    }}
                    aria-hidden="true"
                  >
                    <span className="text-xs font-medium text-white truncate drop-shadow-sm">
                      Double-click
                    </span>
                  </div>
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
                onCreatePhaseAfter={handleCreatePhaseAfter}
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
