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
import { AddItemButton } from '../controls';
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
}

export default function SectionRow({
  section,
  isLabel,
  timelineWidth,
  viewportBounds,
  sectionIndex,
  dragHandleProps,
  isDragging,
}: SectionRowProps): JSX.Element {
  const { toggleSectionCollapse, addPhase, addMilestone } = useSectionStore();
  const project = useProjectStore((state) => state.project);
  const { selection, selectItem, openContextMenu } = useUIStore();
  const headerRowRef = useRef<HTMLDivElement>(null);

  const isMasterSection = section.id === project?.masterSectionId;

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

  // Handle click on collapsed phase bar
  const handleCollapsedPhaseClick = useCallback(
    (phaseId: string) => (e: React.MouseEvent): void => {
      e.stopPropagation();
      selectItem('phase', phaseId, section.id, null, { x: e.clientX, y: e.clientY });
    },
    [selectItem, section.id]
  );

  // Handle keyboard on collapsed phase bar
  const handleCollapsedPhaseKeyDown = useCallback(
    (phaseId: string) => (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('phase', phaseId, section.id, null, { x: rect.right, y: rect.top });
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

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'section', section.id, section.id);
  }, [openContextMenu, section.id]);

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleSectionCollapse(section.id);
  };

  const handleAddPhase = (): void => {
    addPhase(section.id, {
      name: '',
      description: '',
      color: isMasterSection ? getNextPhaseColor(section.phases.length) : null,
      relativeStart: 0.1,
      relativeEnd: 0.4,
      order: section.phases.length,
      isCollapsed: false,
      elements: [],
    });
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
    [section.id, section, section.milestones.length, timelineWidth, viewportBounds, addMilestone, selectItem]
  );

  // Double-click on phases container creates a new phase
  const handleCreatePhase = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      // Convert viewport-relative position to section-relative
      const viewportRelative = getRelativeFromPosition(clickX, timelineWidth);
      const sectionRelative = viewportToSectionRelative(viewportRelative, section, viewportBounds);

      // Create a phase centered at the click position with 30-day width (relative to section)
      const sectionDays = getDaysBetween(section.startDate, section.endDate);
      const thirtyDaysRelative = sectionDays > 0 ? 30 / sectionDays : 0.15;
      const halfWidth = thirtyDaysRelative / 2;
      const relativeStart = Math.max(0, sectionRelative - halfWidth);
      const relativeEnd = Math.min(1, sectionRelative + halfWidth);

      addPhase(section.id, {
        name: '',
        description: '',
        color: isMasterSection ? getNextPhaseColor(section.phases.length) : null,
        order: section.phases.length,
        isCollapsed: false,
        elements: [],
        relativeStart,
        relativeEnd,
      });

      // Get the new phase and select it
      const updatedSections = useSectionStore.getState().sections;
      const updatedSection = updatedSections.find((s) => s.id === section.id);
      const newPhase = updatedSection?.phases[updatedSection.phases.length - 1];

      if (newPhase) {
        selectItem('phase', newPhase.id, section.id, null, { x: e.clientX, y: e.clientY });
      }
    },
    [section, isMasterSection, timelineWidth, viewportBounds, addPhase, selectItem]
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
          className={`flex items-center gap-2 px-3 border-b ${isMasterSection ? 'border-[var(--color-border)]/50 bg-[var(--color-background)]' : 'border-[var(--color-border)]/25'} ${
            !isMasterSection ? 'cursor-pointer row-selectable focus-ring' : ''
          } ${isSelected ? 'selected' : ''}`}
          style={{ height: ROW_HEIGHT }}
          onClick={!isMasterSection ? handleClick : undefined}
          onContextMenu={handleContextMenu}
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
          {!isMasterSection && <AddItemButton onClick={handleAddPhase} label="Add phase" />}
        </div>

        {/* Phase labels (when expanded) */}
        {!section.isCollapsed && (
          <div role="list" aria-label={`${section.name} phases`}>
            {section.phases.map((phase) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                section={section}
                isLabel
                timelineWidth={timelineWidth}
                viewportBounds={viewportBounds}
              />
            ))}
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
        className={`relative border-b ${isMasterSection ? 'border-[var(--color-border)]/50' : 'border-[var(--color-border)]/25'}`}
        style={{ height: ROW_HEIGHT }}
        onDoubleClick={handleHeaderDoubleClick}
      >
        {section.isCollapsed && (
          <>
            {section.phases.map((phase) => {
              // Convert section-relative positions to viewport-relative
              const viewportStart = sectionToViewportRelative(phase.relativeStart, section, viewportBounds);
              const viewportEnd = sectionToViewportRelative(phase.relativeEnd, section, viewportBounds);
              const { left, width } = getBarDimensions(
                viewportStart,
                viewportEnd,
                timelineWidth
              );
              const isPhaseSelected = selection.type === 'phase' && selection.id === phase.id;
              const effectiveColor = getPhaseColor(phase, section);

              return (
                <div
                  key={phase.id}
                  className={`absolute top-1 bottom-1 rounded-[10px] cursor-pointer timeline-bar ${
                    isPhaseSelected ? 'ring-2 ring-[var(--color-focus)] ring-offset-1' : ''
                  }`}
                  style={{
                    left,
                    width,
                    backgroundColor: effectiveColor,
                  }}
                  onClick={handleCollapsedPhaseClick(phase.id)}
                  onDoubleClick={handleCollapsedPhaseDoubleClick}
                  onKeyDown={handleCollapsedPhaseKeyDown(phase.id)}
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
          {section.phases.map((phase) => (
            <PhaseRow
              key={phase.id}
              phase={phase}
              section={section}
              isLabel={false}
              timelineWidth={timelineWidth}
              viewportBounds={viewportBounds}
            />
          ))}
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
