import { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useViewport } from '../../hooks/useViewport';
import { usePlayhead } from '../../hooks/usePlayhead';
import { useTimelinePan } from '../../hooks/useTimelinePan';
import { useDragReorder } from '../../hooks/useDragReorder';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { SectionRow } from './SectionRow';
import { StickyMilestones } from './StickyMilestones';
import { Playhead } from './Playhead';
import { PinnedMilestoneLines } from './PinnedMilestoneLines';
import { AddScheduleButton, ZoomControls } from '../controls';
import { WelcomeWalkthrough } from '../layout/WelcomeWalkthrough';
import { HEADER_HEIGHT, ROW_HEIGHT, getPositionFromRelative, calculateSectionHeight } from '../../utils/timelineUtils';
import { getTodayViewportPosition, isTodayInViewport } from '../../utils/dateUtils';
import { usePinnedSection } from '../../hooks/usePinnedSection';
import type { Section } from '../../types';

export function Timeline() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const labelsColumnRef = useRef<HTMLDivElement>(null);
  const labelsContentRef = useRef<HTMLDivElement>(null);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  const { pinnedSection, unpinnedSections } = usePinnedSection();
  const reorderSections = useSectionStore((s) => s.reorderSections);

  const labelColumnWidth = useUIStore((state) => state.labelColumnWidth);
  const setLabelColumnWidth = useUIStore((state) => state.setLabelColumnWidth);
  const scrollToTodayTrigger = useUIStore((state) => state.scrollToTodayTrigger);
  const { viewportBounds, timelineWidth } = useViewport();
  const { handleMouseDown: handlePlayheadMouseDown } = usePlayhead({
    timelineWidth,
    containerRef: scrollContainerRef,
  });
  const { isPanning } = useTimelinePan({
    containerRef: scrollContainerRef,
  });

  // Label column resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Scroll position ref for sticky milestone computation (avoids re-renders on every scroll)
  const scrollTopRef = useRef(0);
  const stickyIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [stickyMilestoneIds, setStickyMilestoneIds] = useState<ReadonlySet<string>>(() => new Set());

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

  // Calculate individual unpinned section heights for proper drop indicator positioning
  const sectionHeights = useMemo(() => {
    return unpinnedSections.map((section) => calculateSectionHeight(section));
  }, [unpinnedSections]);

  // Use drag reorder for unpinned sections
  const {
    state: dragState,
    getDragHandleProps,
  } = useDragReorder({
    onReorder: (from, to) => {
      // Map visible (unpinned) indices back to indices in the sections array
      const allSections = useSectionStore.getState().sections;
      const pinnedId = useProjectStore.getState().project?.pinnedSectionId;
      const visible = allSections.filter((s) => s.id !== pinnedId);
      const fromSection = visible[from];
      const toSection = visible[to];
      if (!fromSection || !toSection) return;
      reorderSections(
        allSections.findIndex((s) => s.id === fromSection.id),
        allSections.findIndex((s) => s.id === toSection.id)
      );
    },
    itemCount: unpinnedSections.length,
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

  const dropIndicatorStyle = getDropIndicatorStyle();

  // Combine all sections in order for sticky milestones
  const allSections = useMemo(() => {
    const sections: Section[] = [];
    if (pinnedSection) sections.push(pinnedSection);
    sections.push(...unpinnedSections);
    return sections;
  }, [pinnedSection, unpinnedSections]);

  // Precompute scroll thresholds so the scroll handler only does cheap comparisons
  const sectionThresholds = useMemo(() => {
    let cumulativeY = 0;
    return allSections.map((section) => {
      const enterY = cumulativeY;
      const height = calculateSectionHeight(section);
      const exitY = cumulativeY + height - ROW_HEIGHT;
      const milestoneIds = section.milestones.map((m) => m.id);
      cumulativeY += height;
      return { enterY, exitY, milestoneIds };
    });
  }, [allSections]);

  const computeStickyIds = useCallback((scrollTop: number): ReadonlySet<string> => {
    const ids = new Set<string>();
    for (const { enterY, exitY, milestoneIds } of sectionThresholds) {
      if (scrollTop > enterY && scrollTop <= exitY) {
        for (const id of milestoneIds) ids.add(id);
      }
    }
    return ids;
  }, [sectionThresholds]);

  // Recompute when sections change
  useEffect(() => {
    const newIds = computeStickyIds(scrollTopRef.current);
    stickyIdsRef.current = newIds;
    setStickyMilestoneIds(newIds);
  }, [computeStickyIds]);

  useEffect(() => {
    const labelsEl = labelsColumnRef.current;
    if (!labelsEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += e.deltaY;
        scrollContainerRef.current.scrollLeft += e.deltaX;
      }
    };

    labelsEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => labelsEl.removeEventListener('wheel', handleWheel);
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const newScrollTop = scrollContainerRef.current.scrollTop;
    scrollTopRef.current = newScrollTop;

    if (labelsContentRef.current) {
      labelsContentRef.current.style.transform = `translateY(-${newScrollTop}px)`;
    }

    const newIds = computeStickyIds(newScrollTop);
    const prev = stickyIdsRef.current;
    let changed = newIds.size !== prev.size;
    if (!changed) {
      for (const id of newIds) {
        if (!prev.has(id)) { changed = true; break; }
      }
    }
    if (changed) {
      stickyIdsRef.current = newIds;
      setStickyMilestoneIds(newIds);
    }
  }, [computeStickyIds]);

  const contentHeight = useMemo(() => {
    let height = 0;
    if (pinnedSection) height += calculateSectionHeight(pinnedSection);
    unpinnedSections.forEach((section) => {
      height += calculateSectionHeight(section);
    });
    height += ROW_HEIGHT;
    return Math.max(height, 200);
  }, [pinnedSection, unpinnedSections]);

  // Welcome walkthrough when no active project exists
  if (!activeProjectId) {
    return <WelcomeWalkthrough />;
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
            ref={labelsColumnRef}
            className="flex-1 min-h-0 overflow-hidden"
            role="list"
            aria-label="Sections and phases"
          >
            <div ref={labelsContentRef} style={{ willChange: 'transform' }}>
              {pinnedSection && (
                <SectionRow
                  section={pinnedSection}
                  isLabel
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                />
              )}

              <div className="relative" data-drag-container>
                {unpinnedSections.map((section, index) => (
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
                {dropIndicatorStyle && <div style={dropIndicatorStyle} />}
              </div>

              <div style={{ height: ROW_HEIGHT }} aria-hidden="true" />
            </div>
          </div>

        </nav>

        {/* Scrollable Timeline Column */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto timeline-scroll-container${isPanning ? ' panning' : ''}`}
          onScroll={handleTimelineScroll}
          role="region"
          aria-label="Timeline content"
        >
          <div style={{ minWidth: timelineWidth }}>
            {/* Timeline Header with date markers */}
            <TimelineHeader />

            {/* Sticky milestones that stay visible when scrolling */}
            <StickyMilestones
              sections={allSections}
              stickyMilestoneIds={stickyMilestoneIds}
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

              {/* Pinned schedule milestone lines through all schedules */}
              {pinnedSection && (
                <PinnedMilestoneLines
                  section={pinnedSection}
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                  height={contentHeight - ROW_HEIGHT}
                />
              )}

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

              {/* Pinned section bars */}
              {pinnedSection && (
                <SectionRow
                  section={pinnedSection}
                  isLabel={false}
                  timelineWidth={timelineWidth}
                  viewportBounds={viewportBounds}
                  stickyMilestoneIds={stickyMilestoneIds}
                />
              )}

              {/* Unpinned section bars */}
              {unpinnedSections.map((section, index) => (
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
