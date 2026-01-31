import { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useSectionStore, selectIDTimeline, selectTeams } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useTimeline } from '../../hooks/useTimeline';
import { usePlayhead } from '../../hooks/usePlayhead';
import { useDragReorder } from '../../hooks/useDragReorder';
import TimelineHeader from './TimelineHeader';
import TimelineGrid from './TimelineGrid';
import SectionRow from './SectionRow';
import Playhead from './Playhead';
import { AddTeamButton, ZoomControls } from '../controls';
import { HEADER_HEIGHT, ROW_HEIGHT, ELEMENT_ROW_HEIGHT, getPositionFromRelative } from '../../utils/timelineUtils';
import { getTodayPosition } from '../../utils/dateUtils';

export default function Timeline() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const labelsScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);

  const idTimeline = useSectionStore(selectIDTimeline);
  const teams = useSectionStore(selectTeams);
  const { reorderSections } = useSectionStore();

  const labelColumnWidth = useUIStore((state) => state.labelColumnWidth);
  const setLabelColumnWidth = useUIStore((state) => state.setLabelColumnWidth);
  const scrollToTodayTrigger = useUIStore((state) => state.scrollToTodayTrigger);
  const { timelineWidth, totalDays, project } = useTimeline();
  const { handleMouseDown: handlePlayheadMouseDown } = usePlayhead({
    timelineWidth,
    containerRef: scrollContainerRef,
  });

  // Label column resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Handle label column resize
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = labelColumnWidth;
  }, [labelColumnWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartX.current;
      setLabelColumnWidth(resizeStartWidth.current + deltaX);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setLabelColumnWidth]);

  // Scroll to today when triggered
  useEffect(() => {
    if (scrollToTodayTrigger === 0) return;
    if (!scrollContainerRef.current) return;

    const todayPosition = getTodayPosition(project.startDate, project.endDate);
    if (todayPosition < 0 || todayPosition > 1) return;

    const todayPixel = getPositionFromRelative(todayPosition, timelineWidth);
    const containerWidth = scrollContainerRef.current.clientWidth;
    const scrollTarget = todayPixel - containerWidth / 2;

    scrollContainerRef.current.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: 'smooth',
    });
  }, [scrollToTodayTrigger, project.startDate, project.endDate, timelineWidth]);

  // Calculate individual team heights for proper drop indicator positioning
  const teamHeights = useMemo(() => {
    return teams.map((team) => {
      let height = ROW_HEIGHT; // Team header row
      if (!team.isCollapsed) {
        team.phases.forEach((phase) => {
          height += ROW_HEIGHT; // Phase row
          if (!phase.isCollapsed) {
            height += phase.elements.length * ELEMENT_ROW_HEIGHT;
          }
        });
      }
      return height;
    });
  }, [teams]);

  // Use drag reorder for teams
  const {
    state: dragState,
    getDragHandleProps,
  } = useDragReorder({
    onReorder: reorderSections,
    itemCount: teams.length,
    rowHeight: ROW_HEIGHT, // Movement threshold
  });

  // Custom drop indicator style using actual cumulative heights
  const getTeamDropIndicatorStyle = useCallback((): React.CSSProperties | null => {
    if (!dragState.isDragging || dragState.dropIndex === null || dragState.dropIndex === dragState.dragIndex) {
      return null;
    }

    // Calculate position based on cumulative team heights
    const targetIndex = dragState.dropIndex > (dragState.dragIndex ?? 0)
      ? dragState.dropIndex + 1
      : dragState.dropIndex;

    let top = 0;
    for (let i = 0; i < targetIndex && i < teamHeights.length; i++) {
      top += teamHeights[i];
    }

    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: `${top}px`,
      height: '2px',
      backgroundColor: '#3b82f6',
      zIndex: 50,
      pointerEvents: 'none',
    };
  }, [dragState.isDragging, dragState.dropIndex, dragState.dragIndex, teamHeights]);

  // Sync vertical scroll between labels column and timeline content
  const handleLabelsScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (!labelsScrollRef.current || !scrollContainerRef.current) return;
    isScrollSyncing.current = true;
    scrollContainerRef.current.scrollTop = labelsScrollRef.current.scrollTop;
    isScrollSyncing.current = false;
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (!labelsScrollRef.current || !scrollContainerRef.current) return;
    isScrollSyncing.current = true;
    labelsScrollRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    isScrollSyncing.current = false;
  }, []);

  // Calculate content height for playhead (includes all sections)
  const contentHeight = useMemo(() => {
    let height = 0;

    // ID Timeline section
    if (idTimeline) {
      height += ROW_HEIGHT; // Section header row
      if (!idTimeline.isCollapsed) {
        idTimeline.phases.forEach((phase) => {
          height += ROW_HEIGHT;
          if (!phase.isCollapsed && phase.elements.length > 0) {
            height += phase.elements.length * ELEMENT_ROW_HEIGHT;
          }
        });
      }
    }

    // Teams
    teams.forEach((team) => {
      height += ROW_HEIGHT; // Team header row
      if (!team.isCollapsed) {
        team.phases.forEach((phase) => {
          height += ROW_HEIGHT;
          if (!phase.isCollapsed && phase.elements.length > 0) {
            height += phase.elements.length * ELEMENT_ROW_HEIGHT;
          }
        });
      }
    });

    // Add button row
    if (teams.length > 0 || idTimeline) {
      height += ROW_HEIGHT;
    }
    return Math.max(height, 200);
  }, [idTimeline, teams]);

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
          className="flex-shrink-0 border-r border-[#e5e7eb] bg-white flex flex-col relative"
          style={{ width: labelColumnWidth }}
          aria-label="Timeline labels"
        >
          {/* Resize handle */}
          <div
            className={`absolute top-0 -right-0.5 w-1 h-full cursor-col-resize z-10 transition-colors ${
              isResizing ? 'bg-blue-500' : 'hover:bg-blue-400'
            }`}
            onMouseDown={handleResizeMouseDown}
            aria-label="Resize labels column"
            role="separator"
          />
          {/* Header spacer */}
          <div
            className="flex-shrink-0 border-b border-[#e5e7eb]"
            style={{ height: HEADER_HEIGHT }}
            aria-hidden="true"
          />

          {/* Section and Phase labels */}
          <div
            ref={labelsScrollRef}
            className="flex-1 min-h-0 overflow-y-auto"
            onScroll={handleLabelsScroll}
            role="list"
            aria-label="Sections and phases"
          >
            {/* ID Timeline section */}
            {idTimeline && (
              <SectionRow
                section={idTimeline}
                isLabel
                timelineWidth={timelineWidth}
                totalDays={totalDays}
              />
            )}

            {/* Teams */}
            <div className="relative" data-drag-container>
              {teams.map((team, index) => (
                <SectionRow
                  key={team.id}
                  section={team}
                  isLabel
                  timelineWidth={timelineWidth}
                  totalDays={totalDays}
                  sectionIndex={index}
                  dragHandleProps={getDragHandleProps(index)}
                  isDragging={dragState.isDragging && dragState.dragIndex === index}
                />
              ))}
              {/* Drop indicator for team reordering */}
              {getTeamDropIndicatorStyle() && (
                <div style={getTeamDropIndicatorStyle()!} />
              )}
            </div>

            {/* Add Team button */}
            <div className="px-2 py-1 border-t border-[#e5e7eb]">
              <AddTeamButton />
            </div>
          </div>
        </nav>

        {/* Scrollable Timeline Column */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
          onScroll={handleTimelineScroll}
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

              {/* ID Timeline section bars */}
              {idTimeline && (
                <SectionRow
                  section={idTimeline}
                  isLabel={false}
                  timelineWidth={timelineWidth}
                  totalDays={totalDays}
                />
              )}

              {/* Team bars */}
              {teams.map((team, index) => (
                <SectionRow
                  key={team.id}
                  section={team}
                  isLabel={false}
                  timelineWidth={timelineWidth}
                  totalDays={totalDays}
                  sectionIndex={index}
                  isDragging={dragState.isDragging && dragState.dragIndex === index}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
