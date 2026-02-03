import { useCallback, useRef, useMemo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, ELEMENT_ROW_HEIGHT, getBarDimensions, getRelativeFromPosition } from '../../utils/timelineUtils';
import { sectionToViewportRelative, viewportToSectionRelative, getDaysBetween } from '../../utils/dateUtils';
import { PHASE_COLORS } from '../../constants/colors';
import { getPhaseColor } from '../../types';
import PhaseRow from './PhaseRow';
import MilestoneMarker from './MilestoneMarker';
import { EmptyStateHint } from './EmptyStateHint';
import { MasterBadge } from '../common';

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
  readonly stickyMilestoneIds?: Set<string>;
}

export default function SectionRow({
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
  sectionIndex,
  dragHandleProps,
  isDragging,
  stickyMilestoneIds,
}: SectionRowProps): JSX.Element {
  const { toggleSectionCollapse, addPhase, addMilestone } = useSectionStore();
  const project = useProjectStore((state) => state.project);
  const { selection, selectItem, openContextMenu } = useUIStore();
  const headerRowRef = useRef<HTMLDivElement>(null);

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
        height += phase.elements.length * ELEMENT_ROW_HEIGHT;
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

  const handleClick = (e: React.MouseEvent): void => {
    // Only teams are clickable as sections
    if (!isMasterSection) {
      selectItem('section', section.id, section.id, null, { x: e.clientX, y: e.clientY });
    }
  };

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
        elements: [],
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
        role="group"
        aria-label={`${section.name} ${isMasterSection ? 'timeline' : 'team'}`}
      >
        {/* Section header label */}
        <div
          className={`flex items-center gap-2 px-3 border-b ${isMasterSection ? 'bg-[var(--color-background)]' : ''} ${
            !isMasterSection ? 'cursor-pointer row-selectable focus-ring' : ''
          } ${isSelected ? 'selected' : ''}`}
          style={{ height: ROW_HEIGHT, borderColor: isMasterSection ? 'var(--color-row-border-strong)' : 'var(--color-row-border)' }}
          onClick={!isMasterSection ? handleClick : undefined}
          onContextMenu={handleLabelContextMenu}
          onKeyDown={!isMasterSection ? handleKeyDown : undefined}
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
            className="w-4 h-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded-md transition-colors duration-150"
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
          <span className={`text-sm ${isMasterSection ? 'font-semibold' : 'font-medium'} text-[var(--color-text-primary)] truncate`}>
            {section.name || (isMasterSection ? 'Industrial Design' : 'Untitled Team')}
          </span>
          <span className="flex-1" />
          {isMasterSection && <MasterBadge size="sm" />}
        </div>

        {/* Phase labels (when expanded) */}
        {!section.isCollapsed && (
          <div role="list" aria-label={`${section.name} phases`}>
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
                />
              ))
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
      role="group"
      aria-label={`${section.name} ${isMasterSection ? 'timeline bars' : 'team timeline'}`}
    >
      {/* Section header row with collapsed phase bars when collapsed */}
      <div
        ref={headerRowRef}
        className="relative border-b"
        style={{ height: ROW_HEIGHT, borderColor: isMasterSection ? 'var(--color-row-border-strong)' : 'var(--color-row-border)' }}
        onDoubleClick={handleHeaderDoubleClick}
        onContextMenu={handleHeaderContextMenu}
      >
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
          role="list"
          aria-label={`${section.name} phase bars`}
          onDoubleClick={handleCreatePhase}
        >
          {sortedPhases.length === 0 ? (
            <EmptyStateHint
              text="Double-click to add phase"
              height={ROW_HEIGHT}
              borderClass="border-b"
            />
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
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Helper to get next phase color for ID timeline
function getNextPhaseColor(existingCount: number): string {
  const colorKeys = Object.keys(PHASE_COLORS) as (keyof typeof PHASE_COLORS)[];
  const colorIndex = existingCount % colorKeys.length;
  return PHASE_COLORS[colorKeys[colorIndex]];
}
