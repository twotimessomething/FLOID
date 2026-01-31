import { useCallback, useRef, useMemo } from 'react';
import type { Phase, Milestone } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { ROW_HEIGHT, ELEMENT_ROW_HEIGHT, getBarDimensions, getRelativeFromPosition } from '../../utils/timelineUtils';
import { PHASE_COLORS } from '../../constants/colors';
import PhaseRow from './PhaseRow';
import MilestoneMarker from './MilestoneMarker';

interface IDTimelineSectionProps {
  readonly phases: readonly Phase[];
  readonly milestones: readonly Milestone[];
  readonly isLabel: boolean;
  readonly timelineWidth: number;
  readonly totalDays: number;
}

export default function IDTimelineSection({
  phases,
  milestones,
  isLabel,
  timelineWidth,
  totalDays,
}: IDTimelineSectionProps): JSX.Element {
  const { isIDTimelineCollapsed, toggleIDTimelineCollapse, selection, setSelection } = useUIStore();
  const { addMilestone, addPhase } = useTimelineStore();
  const headerRowRef = useRef<HTMLDivElement>(null);

  // Calculate the height of content below header for milestone line
  const milestoneLineHeight = useMemo(() => {
    if (isIDTimelineCollapsed) return 0;
    let height = 0;
    phases.forEach((phase) => {
      height += ROW_HEIGHT; // Phase row
      if (!phase.isCollapsed) {
        height += phase.elements.length * ELEMENT_ROW_HEIGHT;
      }
    });
    return height;
  }, [phases, isIDTimelineCollapsed]);

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      toggleIDTimelineCollapse();
    },
    [toggleIDTimelineCollapse]
  );

  const handlePhaseClick = useCallback(
    (phaseId: string) => (e: React.MouseEvent): void => {
      e.stopPropagation();
      setSelection({ type: 'phase', id: phaseId }, { x: e.clientX, y: e.clientY });
    },
    [setSelection]
  );

  const handlePhaseKeyDown = useCallback(
    (phaseId: string) => (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSelection({ type: 'phase', id: phaseId }, { x: rect.right, y: rect.top });
      }
    },
    [setSelection]
  );

  // Prevent double-click from propagating on collapsed phase bars
  const handlePhaseDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  // Double-click on header row creates a milestone at project-relative position
  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      const rect = headerRowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clickX = e.clientX - rect.left;
      const relativePosition = getRelativeFromPosition(clickX, timelineWidth);

      addMilestone({
        name: '',
        description: '',
        relativePosition: Math.max(0, Math.min(1, relativePosition)),
        order: milestones.length,
      });

      // Get the new milestone (it was just added)
      const updatedMilestones = useTimelineStore.getState().milestones;
      const newMilestone = updatedMilestones[updatedMilestones.length - 1];

      if (newMilestone) {
        setSelection({ type: 'milestone', id: newMilestone.id }, { x: e.clientX, y: e.clientY });
      }
    },
    [milestones.length, timelineWidth, addMilestone, setSelection]
  );

  // Double-click on phases container or phase row creates a new phase
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

      // Pick a color from the palette
      const colorKeys = Object.keys(PHASE_COLORS) as (keyof typeof PHASE_COLORS)[];
      const colorIndex = phases.length % colorKeys.length;
      const color = PHASE_COLORS[colorKeys[colorIndex]];

      addPhase({
        name: '',
        description: '',
        color,
        order: phases.length,
        isCollapsed: false,
        elements: [],
        relativeStart,
        relativeEnd,
      });

      // Get the new phase and select it
      const updatedPhases = useTimelineStore.getState().phases;
      const newPhase = updatedPhases[updatedPhases.length - 1];

      if (newPhase) {
        setSelection({ type: 'phase', id: newPhase.id }, { x: e.clientX, y: e.clientY });
      }
    },
    [phases, timelineWidth, totalDays, addPhase, setSelection]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label="Industrial Design timeline">
        {/* Section header */}
        <div
          className="flex items-center gap-2 px-3 border-b border-[#e5e7eb] bg-[#fafafa]"
          style={{ height: ROW_HEIGHT }}
        >
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] focus-ring rounded-md transition-colors duration-150"
            aria-expanded={!isIDTimelineCollapsed}
            aria-label={`${isIDTimelineCollapsed ? 'Expand' : 'Collapse'} Industrial Design`}
          >
            <svg
              className={`w-3 h-3 collapse-chevron ${
                isIDTimelineCollapsed ? '' : 'expanded'
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
          <span className="text-sm font-semibold text-[#111827]">
            Industrial Design
          </span>
        </div>

        {/* Phase labels (when expanded) */}
        {!isIDTimelineCollapsed && (
          <div role="list" aria-label="Industrial Design phases">
            {phases.map((phase) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
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
    <div role="group" aria-label="Industrial Design timeline bars">
      {/* Section header row (with collapsed phase bars when collapsed) */}
      <div
        ref={headerRowRef}
        className="relative border-b border-[#e5e7eb]"
        style={{ height: ROW_HEIGHT }}
        onDoubleClick={handleHeaderDoubleClick}
      >
        {isIDTimelineCollapsed && (
          <>
            {phases.map((phase) => {
              const { left, width } = getBarDimensions(
                phase.relativeStart,
                phase.relativeEnd,
                timelineWidth
              );
              const isSelected = selection.type === 'phase' && selection.id === phase.id;

              return (
                <div
                  key={phase.id}
                  className={`absolute top-1 bottom-1 rounded-[10px] cursor-pointer timeline-bar ${
                    isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                  style={{
                    left,
                    width,
                    backgroundColor: phase.color,
                  }}
                  onClick={handlePhaseClick(phase.id)}
                  onDoubleClick={handlePhaseDoubleClick}
                  onKeyDown={handlePhaseKeyDown(phase.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${phase.name} phase bar (collapsed view)`}
                  aria-selected={isSelected}
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
        {milestones.map((milestone) => (
          <MilestoneMarker
            key={milestone.id}
            milestone={milestone}
            timelineWidth={timelineWidth}
            lineHeight={milestoneLineHeight}
          />
        ))}
      </div>

      {/* Phase bars (when expanded) */}
      {!isIDTimelineCollapsed && (
        <div
          role="list"
          aria-label="Industrial Design phase bars"
          onDoubleClick={handleCreatePhase}
        >
          {phases.map((phase) => (
            <PhaseRow
              key={phase.id}
              phase={phase}
              isLabel={false}
              timelineWidth={timelineWidth}
                          />
          ))}
        </div>
      )}
    </div>
  );
}
