import { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useSectionStore, selectMasterSection, selectNonMasterSections } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useViewport } from '../../hooks/useViewport';
import { usePlayhead } from '../../hooks/usePlayhead';
import { useDragReorder } from '../../hooks/useDragReorder';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { SectionRow } from './SectionRow';
import { StickyMilestones } from './StickyMilestones';
import { Playhead } from './Playhead';
import { AddScheduleButton, ZoomControls } from '../controls';
import { HEADER_HEIGHT, ROW_HEIGHT, TASK_ROW_HEIGHT, getPositionFromRelative } from '../../utils/timelineUtils';
import { getTodayViewportPosition, isTodayInViewport } from '../../utils/dateUtils';
import type { Section } from '../../types';

export function Timeline() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const labelsScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const openProjectSetupModal = useUIStore((state) => state.openProjectSetupModal);

  const masterSection = useSectionStore(selectMasterSection);
  const nonMasterSections = useSectionStore(selectNonMasterSections);
  const { reorderSections } = useSectionStore();

  const labelColumnWidth = useUIStore((state) => state.labelColumnWidth);
  const setLabelColumnWidth = useUIStore((state) => state.setLabelColumnWidth);
  const scrollToTodayTrigger = useUIStore((state) => state.scrollToTodayTrigger);
  const { viewportBounds, timelineWidth } = useViewport();
  const { handleMouseDown: handlePlayheadMouseDown } = usePlayhead({
    timelineWidth,
    containerRef: scrollContainerRef,
  });

  // Label column resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Scroll position for sticky milestones
  const [scrollTop, setScrollTop] = useState(0);

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

    if (!isTodayInViewport(viewportBounds)) return;

    const todayPosition = getTodayViewportPosition(viewportBounds);
    const todayPixel = getPositionFromRelative(todayPosition, timelineWidth);
    const containerWidth = scrollContainerRef.current.clientWidth;
    const scrollTarget = todayPixel - containerWidth / 2;

    scrollContainerRef.current.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: 'smooth',
    });
  }, [scrollToTodayTrigger, viewportBounds, timelineWidth]);

  // Calculate section height for a given section
  const calculateSectionHeight = (section: Section): number => {
    let height = ROW_HEIGHT; // Section header row
    if (!section.isCollapsed) {
      section.phases.forEach((phase) => {
        height += ROW_HEIGHT; // Phase row
        if (!phase.isCollapsed) {
          height += phase.tasks.length * TASK_ROW_HEIGHT;
        }
      });
    }
    return height;
  };

  // Calculate individual non-master section heights for proper drop indicator positioning
  const sectionHeights = useMemo(() => {
    return nonMasterSections.map((section) => calculateSectionHeight(section));
  }, [nonMasterSections]);

  // Use drag reorder for non-master sections
  const {
    state: dragState,
    getDragHandleProps,
  } = useDragReorder({
    onReorder: (from, to) => {
      // Adjust indices to account for master section at index 0
      reorderSections(from + 1, to + 1);
    },
    itemCount: nonMasterSections.length,
    rowHeight: ROW_HEIGHT, // Movement threshold
  });

  // Custom drop indicator style using actual cumulative heights
  const getDropIndicatorStyle = useCallback((): React.CSSProperties | null => {
    if (!dragState.isDragging || dragState.dropIndex === null || dragState.dropIndex === dragState.dragIndex) {
      return null;
    }

    // Calculate position based on cumulative section heights
    const targetIndex = dragState.dropIndex > (dragState.dragIndex ?? 0)
      ? dragState.dropIndex + 1
      : dragState.dropIndex;

    let top = 0;
    for (let i = 0; i < targetIndex && i < sectionHeights.length; i++) {
      top += sectionHeights[i];
    }

    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: `${top}px`,
      height: '2px',
      backgroundColor: 'var(--color-focus)',
      zIndex: 50,
      pointerEvents: 'none',
    };
  }, [dragState.isDragging, dragState.dropIndex, dragState.dragIndex, sectionHeights]);

  // Sync vertical scroll between labels column and timeline content
  const handleLabelsScroll = useCallback(() => {
    if (isScrollSyncing.current) return;
    if (!labelsScrollRef.current || !scrollContainerRef.current) return;
    isScrollSyncing.current = true;
    scrollContainerRef.current.scrollTop = labelsScrollRef.current.scrollTop;
    isScrollSyncing.current = false;
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    // Track scroll position for sticky milestones
    setScrollTop(scrollContainerRef.current.scrollTop);

    if (isScrollSyncing.current) return;
    if (!labelsScrollRef.current) return;
    isScrollSyncing.current = true;
    labelsScrollRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    isScrollSyncing.current = false;
  }, []);

  // Combine all sections in order for sticky milestones
  const allSections = useMemo(() => {
    const sections: Section[] = [];
    if (masterSection) sections.push(masterSection);
    sections.push(...nonMasterSections);
    return sections;
  }, [masterSection, nonMasterSections]);

  // Calculate which milestone IDs are currently sticky (to hide originals)
  const stickyMilestoneIds = useMemo(() => {
    const ids = new Set<string>();
    let cumulativeY = 0;

    for (const section of allSections) {
      const sectionY = cumulativeY;
      const sectionHeight = calculateSectionHeight(section);

      // Section's milestones are sticky when header scrolled past but section not fully gone
      const headerScrolledPast = scrollTop > sectionY;
      const sectionFullyScrolledPast = scrollTop > sectionY + sectionHeight - ROW_HEIGHT;

      if (headerScrolledPast && !sectionFullyScrolledPast) {
        for (const milestone of section.milestones) {
          ids.add(milestone.id);
        }
      }

      cumulativeY += sectionHeight;
    }

    return ids;
  }, [allSections, scrollTop]);

  // Calculate content height for playhead (includes all sections)
  const contentHeight = useMemo(() => {
    let height = 0;

    // Master section
    if (masterSection) {
      height += calculateSectionHeight(masterSection);
    }

    // Non-master sections
    nonMasterSections.forEach((section) => {
      height += calculateSectionHeight(section);
    });

    // Bottom spacer row
    height += ROW_HEIGHT;

    return Math.max(height, 200);
  }, [masterSection, nonMasterSections]);

  // Empty state when no projects exist
  if (!activeProjectId) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface)]">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[var(--color-hover)] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--color-text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
              />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            No projects yet
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Create a project to start planning your timeline.
          </p>
          <button
            onClick={openProjectSetupModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-focus)] rounded-lg hover:opacity-90 transition-opacity duration-150"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative" role="application" aria-label="Timeline editor">
      {/* Zoom controls - fixed position in top right */}
      <div className="absolute top-2 right-3 z-[60]">
        <ZoomControls />
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Labels Column */}
        <nav
          className="flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col relative"
          style={{ width: labelColumnWidth }}
          aria-label="Timeline labels"
        >
          {/* Resize handle */}
          <div
            className={`absolute top-0 -right-0.5 w-1 h-full cursor-col-resize z-10 transition-colors ${
              isResizing ? 'bg-[var(--color-focus)]' : 'hover:bg-[var(--color-focus)]/70'
            }`}
            onMouseDown={handleResizeMouseDown}
            aria-label="Resize labels column"
            role="separator"
          />
          {/* Header spacer with add schedule button */}
          <div
            className="flex-shrink-0 border-b border-[var(--color-border)] flex items-center px-3"
            style={{ height: HEADER_HEIGHT }}
          >
            <AddScheduleButton />
          </div>

          {/* Section and Phase labels */}
          <div
            ref={labelsScrollRef}
            className="flex-1 min-h-0 overflow-y-auto"
            onScroll={handleLabelsScroll}
            role="list"
            aria-label="Sections and phases"
          >
            {/* Master section */}
            {masterSection && (
              <SectionRow
                section={masterSection}
                isLabel
                timelineWidth={timelineWidth}
                viewportBounds={viewportBounds}
              />
            )}

            {/* Non-master sections */}
            <div className="relative" data-drag-container>
              {nonMasterSections.map((section, index) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  isLabel
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                  sectionIndex={index}
                  dragHandleProps={getDragHandleProps(index)}
                  isDragging={dragState.isDragging && dragState.dragIndex === index}
                />
              ))}
              {/* Drop indicator for section reordering */}
              {getDropIndicatorStyle() && (
                <div style={getDropIndicatorStyle()!} />
              )}
            </div>

            {/* Spacer row to keep last item accessible above floating button */}
            <div style={{ height: ROW_HEIGHT }} aria-hidden="true" />
          </div>

        </nav>

        {/* Scrollable Timeline Column */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto timeline-scroll-container"
          onScroll={handleTimelineScroll}
          role="region"
          aria-label="Timeline content"
        >
          <div style={{ minWidth: timelineWidth }}>
            {/* Timeline Header with date markers */}
            <TimelineHeader onPlayheadMouseDown={handlePlayheadMouseDown} />

            {/* Sticky milestones that stay visible when scrolling */}
            <StickyMilestones
              sections={allSections}
              scrollTop={scrollTop}
              timelineWidth={timelineWidth}
              viewportBounds={viewportBounds}
            />

            {/* Timeline content */}
            <div
              className="relative cursor-crosshair"
              role="list"
              aria-label="Timeline bars"
              onMouseDown={handlePlayheadMouseDown}
            >
              {/* Background grid */}
              <TimelineGrid />

              {/* Today line - extends full content height */}
              {isTodayInViewport(viewportBounds) && (
                <div
                  className="absolute top-0 w-0.5 bg-[var(--color-today)] z-20 pointer-events-none"
                  style={{
                    left: getPositionFromRelative(getTodayViewportPosition(viewportBounds), timelineWidth),
                    height: contentHeight,
                  }}
                >
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--color-today)] rounded-full" />
                </div>
              )}

              {/* Playhead (scrubber) */}
              <Playhead height={contentHeight} />

              {/* Master section bars */}
              {masterSection && (
                <SectionRow
                  section={masterSection}
                  isLabel={false}
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                  stickyMilestoneIds={stickyMilestoneIds}
                />
              )}

              {/* Non-master section bars */}
              {nonMasterSections.map((section, index) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  isLabel={false}
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                  sectionIndex={index}
                  isDragging={dragState.isDragging && dragState.dragIndex === index}
                  stickyMilestoneIds={stickyMilestoneIds}
                />
              ))}

              {/* Spacer row to match labels column */}
              <div style={{ height: ROW_HEIGHT }} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
