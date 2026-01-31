import { useRef, useMemo } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { useTimeline } from '../../hooks/useTimeline';
import { usePlayhead } from '../../hooks/usePlayhead';
import TimelineHeader from './TimelineHeader';
import TimelineGrid from './TimelineGrid';
import IDTimelineSection from './IDTimelineSection';
import TeamSection from './TeamSection';
import Playhead from './Playhead';
import { AddTeamButton, ZoomControls } from '../controls';
import { LABEL_COLUMN_WIDTH, HEADER_HEIGHT, ROW_HEIGHT, ELEMENT_ROW_HEIGHT } from '../../utils/timelineUtils';

export default function Timeline() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { phases } = useTimelineStore();
  const { teams } = useTeamStore();
  const isIDTimelineCollapsed = useUIStore((state) => state.isIDTimelineCollapsed);
  const { timelineWidth } = useTimeline();
  const { handleMouseDown: handlePlayheadMouseDown } = usePlayhead({
    timelineWidth,
    containerRef: scrollContainerRef,
  });

  // Calculate content height for playhead (includes phases and teams)
  const contentHeight = useMemo(() => {
    let height = 0;
    // Industrial Design section
    height += ROW_HEIGHT; // Section header row
    if (!isIDTimelineCollapsed) {
      phases.forEach((phase) => {
        height += ROW_HEIGHT;
        if (!phase.isCollapsed) {
          height += phase.elements.length * ELEMENT_ROW_HEIGHT;
        }
      });
    }
    // Teams
    teams.forEach((team) => {
      height += ROW_HEIGHT; // Team header row
      if (!team.isCollapsed) {
        team.phases.forEach((teamPhase) => {
          height += ROW_HEIGHT;
          if (!teamPhase.isCollapsed) {
            height += teamPhase.elements.length * ELEMENT_ROW_HEIGHT;
          }
        });
      }
    });
    // Add button row
    if (teams.length > 0 || phases.length > 0) {
      height += ROW_HEIGHT;
    }
    return Math.max(height, 200);
  }, [phases, teams, isIDTimelineCollapsed]);

  return (
    <div className="h-full flex flex-col relative" role="application" aria-label="Timeline editor">
      {/* Zoom controls - fixed position in top right */}
      <div className="absolute top-2 right-3 z-20">
        <ZoomControls />
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Labels Column */}
        <nav
          className="flex-shrink-0 border-r border-gray-200 bg-white"
          style={{ width: LABEL_COLUMN_WIDTH }}
          aria-label="Timeline labels"
        >
          {/* Header spacer */}
          <div
            className="border-b border-gray-200"
            style={{ height: HEADER_HEIGHT }}
            aria-hidden="true"
          />

          {/* Phase and Team labels */}
          <div className="overflow-y-auto" role="list" aria-label="Phases and teams">
            {/* Industrial Design section */}
            <IDTimelineSection
              phases={phases}
              isLabel
              timelineWidth={timelineWidth}
            />

            {/* Teams */}
            {teams.map((team) => (
              <TeamSection
                key={team.id}
                team={team}
                isLabel
                timelineWidth={timelineWidth}
              />
            ))}

            {/* Add Team button */}
            <div className="px-2 py-1 border-t border-gray-200">
              <AddTeamButton />
            </div>
          </div>
        </nav>

        {/* Scrollable Timeline Column */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
          role="region"
          aria-label="Timeline content"
        >
          <div style={{ minWidth: timelineWidth }}>
            {/* Timeline Header with date markers */}
            <TimelineHeader onPlayheadMouseDown={handlePlayheadMouseDown} />

            {/* Timeline content */}
            <div className="relative" role="list" aria-label="Timeline bars">
              {/* Background grid */}
              <TimelineGrid />

              {/* Playhead (scrubber) */}
              <Playhead height={contentHeight} />

              {/* Industrial Design section bars */}
              <IDTimelineSection
                phases={phases}
                isLabel={false}
                timelineWidth={timelineWidth}
              />

              {/* Team bars */}
              {teams.map((team) => (
                <TeamSection
                  key={team.id}
                  team={team}
                  isLabel={false}
                  timelineWidth={timelineWidth}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
