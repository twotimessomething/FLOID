import { useCallback } from 'react';
import type { Phase } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { ROW_HEIGHT, getBarDimensions } from '../../utils/timelineUtils';
import PhaseRow from './PhaseRow';

interface IDTimelineSectionProps {
  readonly phases: readonly Phase[];
  readonly isLabel: boolean;
  readonly timelineWidth: number;
}

export default function IDTimelineSection({
  phases,
  isLabel,
  timelineWidth,
}: IDTimelineSectionProps): JSX.Element {
  const { isIDTimelineCollapsed, toggleIDTimelineCollapse, selection, setSelection } = useUIStore();

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
      setSelection({ type: 'phase', id: phaseId });
    },
    [setSelection]
  );

  const handlePhaseKeyDown = useCallback(
    (phaseId: string) => (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelection({ type: 'phase', id: phaseId });
      }
    },
    [setSelection]
  );

  if (isLabel) {
    // Render label column content
    return (
      <div role="group" aria-label="Industrial Design timeline">
        {/* Section header */}
        <div
          className="flex items-center gap-2 px-3 border-b border-gray-200 bg-gray-50"
          style={{ height: ROW_HEIGHT }}
        >
          <button
            onClick={handleToggleCollapse}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 focus-ring rounded"
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
          <span className="text-sm font-semibold text-gray-700">
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
        className="relative border-b border-gray-200"
        style={{ height: ROW_HEIGHT }}
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
                  className={`absolute top-1 bottom-1 rounded cursor-pointer timeline-bar ${
                    isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                  style={{
                    left,
                    width,
                    backgroundColor: phase.color,
                  }}
                  onClick={handlePhaseClick(phase.id)}
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
      </div>

      {/* Phase bars (when expanded) */}
      {!isIDTimelineCollapsed && (
        <div role="list" aria-label="Industrial Design phase bars">
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
