import {
  lazy,
  Suspense,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useViewport } from '../../hooks/useViewport';
import { usePlayhead } from '../../hooks/usePlayhead';
import { useTimelinePan } from '../../hooks/useTimelinePan';
import { useDragReorder } from '../../hooks/useDragReorder';
import { usePinnedSection } from '../../hooks/usePinnedSection';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { SectionRow } from './SectionRow';
import { StickyScheduleRow } from './StickyScheduleRow';
import { StickyScheduleLabel } from './StickyScheduleLabel';
import { ScrollEdgeFade } from './ScrollEdgeFade';
import { StickyEdgeFade } from './StickyEdgeFade';
import { Playhead } from './Playhead';
import { MilestoneLines } from './MilestoneLines';
import { DependencyLayer } from './DependencyLayer';
import { useShowDependencies } from '../../hooks/useDependencyState';
import { TodayLine } from './TodayLine';
import { AddScheduleButton } from '../controls';
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  STICKY_SLOT_HEIGHT,
  dayToX,
  headerMilestones,
  sectionBoxHeight,
  stickySlotTop,
} from '../../utils/timelineUtils';
import { isTodayInViewport } from '../../utils/dateUtils';
import { dayKeyDiff, todayKey } from '../../utils/dayKeys';
import type { Section } from '../../types';

/**
 * The walkthrough is the first run and only the first run: a returning user
 * never sees it, so its illustrations have no business in the chunk that draws
 * the timeline. It arrives on its own, and only when there is no project.
 */
const WelcomeWalkthrough = lazy(() =>
  import('../layout/WelcomeWalkthrough').then((m) => ({ default: m.WelcomeWalkthrough }))
);

/** Air left of the first item when a project opens — enough to clear a milestone's label. */
const INITIAL_LEAD_IN_PX = 32;

export function Timeline(): JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const labelsColumnRef = useRef<HTMLDivElement>(null);
  const labelsContentRef = useRef<HTMLDivElement>(null);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const showDependencies = useShowDependencies();
  const { pinnedSection, unpinnedSections } = usePinnedSection();
  const reorderSections = useSectionStore((s) => s.reorderSections);

  const labelColumnWidth = useUIStore((state) => state.labelColumnWidth);
  const setLabelColumnWidth = useUIStore((state) => state.setLabelColumnWidth);
  const scrollToTodayTrigger = useUIStore((state) => state.scrollToTodayTrigger);

  const { viewportBounds, timelineWidth, pixelsPerDay, contentStartKey } = useViewport();
  const { hoverProps: playheadHover, handle: playheadHandle } = usePlayhead({
    timelineWidth,
    viewportBounds,
    containerRef: scrollContainerRef,
  });
  const scrollTopRef = useRef(0);
  const stickyCountRef = useRef(0);
  const [stickyCount, setStickyCount] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const isScrolledRef = useRef(false);

  /**
   * Past the end of the timeline the sheet keeps moving, on the scroll
   * container itself rather than on anything inside it.
   *
   * A transform on the content would be paid for twice: transformed boxes count
   * toward a scroller's scrollable overflow, so sliding the sheet left at the
   * far end shrinks `scrollWidth`, the browser clamps `scrollLeft` to match, and
   * the two cancel out — no bounce, and a scroll position quietly lost on the
   * way. Moving the column moves the same pixels and touches no geometry at all.
   */
  const applyOverscroll = useCallback((offset: number): void => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.style.transform = offset === 0 ? '' : `translateX(${offset}px)`;
  }, []);

  const { isPanning } = useTimelinePan({
    containerRef: scrollContainerRef,
    applyOverscroll,
  });

  // Label column resize
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = labelColumnWidth;
    },
    [labelColumnWidth]
  );

  useEffect(() => {
    if (!isResizing) return;
    const handlePointerMove = (e: PointerEvent): void => {
      setLabelColumnWidth(resizeStartWidth.current + (e.clientX - resizeStartX.current));
    };
    const handlePointerUp = (): void => setIsResizing(false);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isResizing, setLabelColumnWidth]);

  /**
   * Dragging an item past the left edge of the sheet grows the viewport
   * leftward, which would otherwise shove everything sideways under the
   * cursor. Absorbing the shift into scrollLeft keeps the paper still while
   * its edge moves — the same fix covers zooming and deletions.
   */
  const previousStartKey = useRef(viewportBounds.startKey);
  useLayoutEffect(() => {
    const previous = previousStartKey.current;
    if (previous === viewportBounds.startKey) return;
    const shiftedDays = dayKeyDiff(viewportBounds.startKey, previous);
    previousStartKey.current = viewportBounds.startKey;
    if (shiftedDays !== 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += shiftedDays * pixelsPerDay;
    }
  }, [viewportBounds.startKey, pixelsPerDay]);

  /**
   * Zoom keeps the day you were reading, not the pixel you were on.
   *
   * `scrollLeft` is in pixels and the sheet rescales under it, so a step from
   * Month to Day multiplies every distance by nearly seven while the scroll
   * position stays put — the same number now points at a day six months
   * earlier. Converting through days on either side of the change holds the
   * middle of the sheet still, which is the part the user is actually reading.
   */
  const previousPixelsPerDay = useRef(pixelsPerDay);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const previous = previousPixelsPerDay.current;
    if (previous === pixelsPerDay) return;
    previousPixelsPerDay.current = pixelsPerDay;
    if (!el || previous <= 0) return;
    const centreDays = (el.scrollLeft + el.clientWidth / 2) / previous;
    el.scrollLeft = Math.max(0, centreDays * pixelsPerDay - el.clientWidth / 2);
  }, [pixelsPerDay]);

  /**
   * The sheet carries a month of air before the first item so there is always
   * somewhere to drag to, but opening on an empty month reads as a mistake.
   * Open with the work against the left edge and only a gutter of lead-in
   * showing; the rest of that month is still there, one scroll back. Once per
   * project — after that the scroll position is the user's.
   */
  const anchoredRef = useRef<{ projectId: string; onContent: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !activeProjectId) return;
    const anchored = anchoredRef.current;
    // An empty project is parked on today until it has content to anchor to,
    // so a project still loading its schedules does not settle on the wrong day.
    if (anchored?.projectId === activeProjectId && (anchored.onContent || !contentStartKey)) return;
    const anchorKey = contentStartKey ?? (isTodayInViewport(viewportBounds) ? todayKey() : null);
    if (!anchorKey) return;
    anchoredRef.current = { projectId: activeProjectId, onContent: contentStartKey !== null };
    const x = dayToX(anchorKey, viewportBounds, pixelsPerDay);
    el.scrollLeft = Math.max(0, x - INITIAL_LEAD_IN_PX);
  }, [activeProjectId, contentStartKey, viewportBounds, pixelsPerDay]);

  /**
   * Fit is measured, not guessed: the scroll container reports the width the
   * sheet actually has, so the button in the header can solve for it.
   */
  const setTimelineViewportWidth = useUIStore((state) => state.setTimelineViewportWidth);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setTimelineViewportWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      setTimelineViewportWidth(entry.target.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [setTimelineViewportWidth, activeProjectId]);

  useEffect(() => {
    if (scrollToTodayTrigger === 0 || !scrollContainerRef.current) return;
    if (!isTodayInViewport(viewportBounds)) return;
    const todayPixel = dayToX(todayKey(), viewportBounds, pixelsPerDay);
    const target = todayPixel - scrollContainerRef.current.clientWidth / 2;
    scrollContainerRef.current.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [scrollToTodayTrigger, viewportBounds, pixelsPerDay]);

  /**
   * The pinned schedule's markers rule a line through every other schedule, so
   * they are drawn once here rather than by the schedule's own row.
   */
  const pinnedMarkers = useMemo(
    () => (pinnedSection ? headerMilestones(pinnedSection) : []),
    [pinnedSection]
  );

  const sectionHeights = useMemo(
    () => unpinnedSections.map((section) => sectionBoxHeight(section)),
    [unpinnedSections]
  );

  const { state: dragState, getDragHandleProps } = useDragReorder({
    onReorder: (from, to) => {
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
    rowHeight: ROW_HEIGHT,
  });

  const dropIndicatorStyle = useMemo((): React.CSSProperties | null => {
    if (
      !dragState.isDragging ||
      dragState.dropIndex === null ||
      dragState.dropIndex === dragState.dragIndex
    ) {
      return null;
    }
    const targetIndex =
      dragState.dropIndex > (dragState.dragIndex ?? 0)
        ? dragState.dropIndex + 1
        : dragState.dropIndex;
    let top = 0;
    for (let i = 0; i < targetIndex && i < sectionHeights.length; i += 1) top += sectionHeights[i];
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: `${top}px`,
      height: '1px',
      backgroundColor: 'var(--color-text-primary)',
      zIndex: 50,
      pointerEvents: 'none',
    };
  }, [dragState.isDragging, dragState.dropIndex, dragState.dragIndex, sectionHeights]);

  const allSections = useMemo(() => {
    const list: Section[] = [];
    if (pinnedSection) list.push(pinnedSection);
    list.push(...unpinnedSections);
    return list;
  }, [pinnedSection, unpinnedSections]);

  // The pinned schedule draws first, so it holds slot 0 and shifts the rest.
  const unpinnedStackOffset = pinnedSection ? 1 : 0;

  /**
   * The schedules held under the axis, in sheet order. A schedule joins the
   * stack when its own row would slide beneath the ones already held, and keeps
   * its slot from then on, so what stands under the axis is every schedule
   * above the rows being read — which is what makes a marker legible at all: a
   * date without the schedule it belongs to says nothing.
   */
  const stickySections = useMemo(
    () => allSections.slice(0, stickyCount),
    [allSections, stickyCount]
  );

  // Precompute scroll thresholds so the scroll handler only compares numbers.
  // Schedule `i` lands in slot `i`, a row lower than the one before it, so it is
  // held that much sooner. Every schedule is at least a row tall, which means
  // these only ever climb: the held set is a prefix of the sheet, and a count
  // says everything there is to say about it.
  const sectionThresholds = useMemo(() => {
    let cumulativeY = 0;
    return allSections.map((section, index) => {
      const enterY = cumulativeY - index * STICKY_SLOT_HEIGHT;
      cumulativeY += sectionBoxHeight(section);
      return enterY;
    });
  }, [allSections]);

  const computeStickyCount = useCallback(
    (scrollTop: number): number => {
      let held = 0;
      while (held < sectionThresholds.length && scrollTop > sectionThresholds[held]) held += 1;
      return held;
    },
    [sectionThresholds]
  );

  useEffect(() => {
    const next = computeStickyCount(scrollTopRef.current);
    stickyCountRef.current = next;
    setStickyCount(next);
  }, [computeStickyCount]);

  useEffect(() => {
    const labelsEl = labelsColumnRef.current;
    if (!labelsEl) return;
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += e.deltaY;
        scrollContainerRef.current.scrollLeft += e.deltaX;
      }
    };
    labelsEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => labelsEl.removeEventListener('wheel', handleWheel);
    // The labels column only exists once a project has loaded, so this has to
    // run again when one does — the same reason the size observer above does.
  }, [activeProjectId]);

  const handleTimelineScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const newScrollTop = scrollContainerRef.current.scrollTop;
    scrollTopRef.current = newScrollTop;
    if (labelsContentRef.current) {
      labelsContentRef.current.style.transform = `translateY(-${newScrollTop}px)`;
    }

    const scrolled = newScrollTop > 0;
    if (scrolled !== isScrolledRef.current) {
      isScrolledRef.current = scrolled;
      setIsScrolled(scrolled);
    }

    const next = computeStickyCount(newScrollTop);
    if (next !== stickyCountRef.current) {
      stickyCountRef.current = next;
      setStickyCount(next);
    }
  }, [computeStickyCount]);

  /**
   * The rows as printed: every schedule's box, hairlines included. The
   * reference rules — today, milestone lines, the playhead — all end here, on
   * the sheet's bottom edge, so none of them trails into open paper.
   */
  const rowsHeight = useMemo(() => {
    let height = 0;
    if (pinnedSection) height += sectionBoxHeight(pinnedSection);
    unpinnedSections.forEach((section) => {
      height += sectionBoxHeight(section);
    });
    return height;
  }, [pinnedSection, unpinnedSections]);


  if (!activeProjectId) {
    // An empty sheet, not a spinner: the walkthrough opens on the same ground it
    // will occupy, so the wait reads as paper waiting for ink rather than as a
    // loading state that appears and vanishes in a frame.
    return (
      <Suspense fallback={<div className="h-full" aria-hidden="true" />}>
        <WelcomeWalkthrough />
      </Suspense>
    );
  }

  return (
    <div className="h-full flex flex-col relative" role="application" aria-label="Timeline editor">
      <div className="flex-1 flex overflow-hidden relative">
        {/* Labels column */}
        <nav
          className="flex-shrink-0 border-r border-[var(--color-hairline)] bg-[var(--color-background)] flex flex-col relative"
          style={{ width: labelColumnWidth }}
          aria-label="Timeline labels"
        >
          <div
            className={`absolute top-0 -right-0.5 w-1 h-full cursor-col-resize z-20 touch-none transition-colors duration-fast ${
              isResizing ? 'bg-[var(--color-hairline)]' : 'hover:bg-[var(--color-hairline)]'
            }`}
            onPointerDown={handleResizePointerDown}
            aria-label="Resize labels column"
            role="separator"
          />
          <div className="flex-shrink-0 flex items-center px-3" style={{ height: HEADER_HEIGHT }}>
            <AddScheduleButton />
          </div>

          <div
            ref={labelsColumnRef}
            className="flex-1 min-h-0 overflow-hidden"
            role="list"
            aria-label="Schedules and items"
          >
            <div ref={labelsContentRef} style={{ willChange: 'transform' }}>
              {pinnedSection && (
                <SectionRow
                  section={pinnedSection}
                  isLabel
                  viewport={viewportBounds}
                  pixelsPerDay={pixelsPerDay}
                />
              )}

              <div className="relative" data-drag-container>
                {unpinnedSections.map((section, index) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    isLabel
                    viewport={viewportBounds}
                    pixelsPerDay={pixelsPerDay}
                    sectionIndex={index}
                    dragHandleProps={getDragHandleProps(index)}
                    isDragging={dragState.isDragging && dragState.dragIndex === index}
                  />
                ))}
                {dropIndicatorStyle && <div style={dropIndicatorStyle} />}
              </div>

              {/* The label column's share of the sheet's bottom edge */}
              <div className="border-t border-[var(--color-hairline)]" aria-hidden="true" />

              <div style={{ height: ROW_HEIGHT }} aria-hidden="true" />
            </div>
          </div>

          {stickySections.map((section, index) => (
            <StickyScheduleLabel key={section.id} section={section} slot={index} />
          ))}

          <ScrollEdgeFade top={stickySlotTop(stickyCount)} isVisible={isScrolled} />
        </nav>

        {/* Timeline column */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto timeline-scroll-container${isPanning ? ' panning' : ''}`}
          onScroll={handleTimelineScroll}
          role="region"
          aria-label="Timeline content"
        >
          <div style={{ minWidth: timelineWidth }}>
            <TimelineHeader playheadHover={playheadHover} playheadHandle={playheadHandle} />

            {stickySections.map((section, index) => (
              <StickyScheduleRow
                key={section.id}
                section={section}
                slot={index}
                pinnedMarkers={pinnedMarkers}
                viewport={viewportBounds}
                pixelsPerDay={pixelsPerDay}
              />
            ))}

            {/* The wash the axis dissolves rows into, with the sheet's
                verticals ruled back over it */}
            <StickyEdgeFade
              top={stickySlotTop(stickyCount)}
              isVisible={isScrolled}
              pinnedMarkers={pinnedMarkers}
              viewport={viewportBounds}
              pixelsPerDay={pixelsPerDay}
            />

            <div
              className="relative cursor-crosshair timeline-plot"
              role="list"
              aria-label="Timeline bars"
            >
              <TimelineGrid />

              {/* Lifted over the schedules' tinted grounds (z-10): the tint is
                  a background painted by later siblings, and a reference line
                  that sank under it would read as broken. */}
              {pinnedSection && (
                <MilestoneLines
                  milestones={pinnedMarkers}
                  viewport={viewportBounds}
                  pixelsPerDay={pixelsPerDay}
                  top={0}
                  height={rowsHeight}
                  className="z-10"
                />
              )}

              <TodayLine
                viewport={viewportBounds}
                pixelsPerDay={pixelsPerDay}
                height={rowsHeight}
              />

              <Playhead height={rowsHeight} handle={playheadHandle} />

              {pinnedSection && (
                <SectionRow
                  section={pinnedSection}
                  isLabel={false}
                  viewport={viewportBounds}
                  pixelsPerDay={pixelsPerDay}
                  isSticky={stickyCount > 0}
                />
              )}

              {unpinnedSections.map((section, index) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  isLabel={false}
                  viewport={viewportBounds}
                  pixelsPerDay={pixelsPerDay}
                  sectionIndex={index}
                  isDragging={dragState.isDragging && dragState.dragIndex === index}
                  isSticky={index + unpinnedStackOffset < stickyCount}
                />
              ))}

              {/* The sheet's bottom edge. Every other schedule end is drawn by
                  the border-t of the schedule after it; the last one ends here. */}
              <div className="border-t border-[var(--color-hairline)]" aria-hidden="true" />

              {/* Dependency ink prints over the bars it connects, in one layer
                  that walks the same layout the rows do */}
              {showDependencies && (
                <DependencyLayer
                  sections={allSections}
                  viewport={viewportBounds}
                  pixelsPerDay={pixelsPerDay}
                  width={timelineWidth}
                  height={rowsHeight}
                />
              )}

              <div style={{ height: ROW_HEIGHT }} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
