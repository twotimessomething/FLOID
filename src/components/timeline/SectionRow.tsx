import { useCallback, useRef, useMemo } from 'react';
import type { Section } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, ELEMENT_ROW_HEIGHT, getBarDimensions, getRelativeFromPosition } from '../../utils/timelineUtils';
import { PHASE_COLORS } from '../../constants/colors';
import { getPhaseColor } from '../../types';
import PhaseRow from './PhaseRow';
import MilestoneMarker from './MilestoneMarker';
import { AddItemButton } from '../controls';

interface DragHandleProps {
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly style: React.CSSProperties;
}

interface SectionRowProps {
  readonly section: Section;
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly totalDays: number;
  readonly sectionIndex?: number;
  readonly dragHandleProps?: DragHandleProps;
  readonly isDragging?: boolean;
}

export default function SectionRow({
  section,
  isLabel,
  timelineWidth,
  totalDays,
  sectionIndex,
  dragHandleProps,
  isDragging,
}: SectionRowProps): JSX.Element {
  const { toggleSectionCollapse, addPhase, addMilestone } = useSectionStore();
  const { selection, selectItem, openContextMenu } = useUIStore();
  const headerRowRef = useRef<HTMLDivElement>(null);

  const isIDTimeline = section.type === 'id-timeline';

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
    if (!isIDTimeline) {
      selectItem('section', section.id, section.id, null, { x: e.clientX, y: e.clientY });
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    // Only teams have context menus at section level
    if (isIDTimeline) return;
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, 'section', section.id, section.id);
  }, [isIDTimeline, openContextMenu, section.id]);

  const handleToggleCollapse = (e: React.MouseEvent): void => {
    e.stopPropagation();
    toggleSectionCollapse(section.id);
  };

  const handleAddPhase = (): void => {
    addPhase(section.id, {
      name: '',
      description: '',
      color: isIDTimeline ? getNextPhaseColor(section.phases.length) : null,
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
      const relativePosition = getRelativeFromPosition(clickX, timelineWidth);

      addMilestone(section.id, {
        name: '',
        description: '',
        relativePosition: Math.max(0, Math.min(1, relativePosition)),
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
    [section.id, section.milestones.length, timelineWidth, addMilestone, selectItem]
  );

  // Double-click on phases container creates a new phase
  const handleCreatePhase = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const relativePosition = getRelativeFromPosition(clickX, timelineWidth);

      // Create a phase centered at the click position with 30-day width
      const thirtyDaysRelative = totalDays > 0 ? 30 / totalDays : 0.15;
      const halfWidth = thirtyDaysRelative / 2;
      const relativeStart = Math.max(0, relativePosition - halfWidth);
      const relativeEnd = Math.min(1, relativePosition + halfWidth);

      addPhase(section.id, {
        name: '',
        description: '',
        color: isIDTimeline ? getNextPhaseColor(section.phases.length) : null,
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
    [section.id, section.phases.length, isIDTimeline, timelineWidth, totalDays, addPhase, selectItem]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div
        className={`${!isIDTimeline ? 'border-t-2 border-[var(--color-border)]' : ''} ${isDragging ? 'opacity-50' : ''}`}
        role="group"
        aria-label={`${section.name} ${isIDTimeline ? 'timeline' : 'team'}`}
      >
        {/* Section header label */}
        <div
          className={`flex items-center gap-2 px-3 border-b ${isIDTimeline ? 'border-[var(--color-border)]/50 bg-[var(--color-background)]' : 'border-[var(--color-border)]/25'} ${
            !isIDTimeline ? 'cursor-pointer row-selectable focus-ring' : ''
          } ${isSelected ? 'selected' : ''}`}
          style={{ height: ROW_HEIGHT }}
          onClick={!isIDTimeline ? handleClick : undefined}
          onContextMenu={!isIDTimeline ? handleContextMenu : undefined}
          onKeyDown={!isIDTimeline ? handleKeyDown : undefined}
          role={!isIDTimeline ? 'button' : undefined}
          tabIndex={!isIDTimeline ? 0 : undefined}
          aria-selected={!isIDTimeline ? isSelected : undefined}
          aria-label={!isIDTimeline ? `${section.name} team${isSelected ? ', selected' : ''}` : undefined}
        >
          {/* Drag handle for reordering (teams only) */}
          {!isIDTimeline && dragHandleProps && sectionIndex !== undefined && (
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
          {!isIDTimeline && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: section.color }}
              aria-hidden="true"
            />
          )}
          <span className={`text-sm ${isIDTimeline ? 'font-semibold' : 'font-medium'} text-[var(--color-text-primary)] truncate flex-1`}>
            {section.name || (isIDTimeline ? 'Industrial Design' : 'Untitled Team')}
          </span>
          {!isIDTimeline && <AddItemButton onClick={handleAddPhase} label="Add phase" />}
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
      className={`${!isIDTimeline ? 'border-t-2 border-[var(--color-border)]' : ''} ${isDragging ? 'opacity-50' : ''}`}
      role="group"
      aria-label={`${section.name} ${isIDTimeline ? 'timeline bars' : 'team timeline'}`}
    >
      {/* Section header row with collapsed phase bars when collapsed */}
      <div
        ref={headerRowRef}
        className={`relative border-b ${isIDTimeline ? 'border-[var(--color-border)]/50' : 'border-[var(--color-border)]/25'}`}
        style={{ height: ROW_HEIGHT }}
        onDoubleClick={handleHeaderDoubleClick}
      >
        {section.isCollapsed && (
          <>
            {section.phases.map((phase) => {
              const { left, width } = getBarDimensions(
                phase.relativeStart,
                phase.relativeEnd,
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
