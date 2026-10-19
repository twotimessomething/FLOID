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
import { DEFAULT_LABEL_WIDTH, useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { isGestureInFlight } from '../../commands/gesture';
import { pixelsPerDayOf, useViewport } from '../../hooks/useViewport';
import { usePlayhead } from '../../hooks/usePlayhead';
import { useTimelinePan } from '../../hooks/useTimelinePan';
import { pinchedPixelsPerDay, usePinchZoom } from '../../hooks/usePinchZoom';
import { useScheduleDrag } from '../../hooks/useScheduleDrag';
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
import { prefersReducedMotion } from '../../utils/easing';
import { DEFAULT_PROJECT_SETTINGS, type Section } from '../../types';

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

/**
 * Where a project's sheet was left. Kept in days, not pixels — the day at the
 * left edge, counted from the first day the sheet had then — so it survives the
 * sheet growing, shrinking or being zoomed while the project was away.
 */
interface SheetPosition {
  readonly startKey: string;
  readonly days: number;
  readonly top: number;
}

/** Every project visited this session, so switching back finds it as it was left. */
const sheetPositions = new Map<string, SheetPosition>();

export function Timeline(): JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const labelsColumnRef = useRef<HTMLDivElement>(null);
  const labelsContentRef = useRef<HTMLDivElement>(null);
  // The pinch listens on the whole timeline, labels column included. Held as
  // state, not a ref: it only exists once a project has loaded, and an effect
  // that read a ref on the first render would bind to nothing.
  const [timelineElement, setTimelineElement] = useState<HTMLDivElement | null>(null);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const sections = useSectionStore((state) => state.sections);
  const showDependencies = useShowDependencies();
  const { pinnedSection, unpinnedSections } = usePinnedSection();

  /* Off unless the project asks for it — see `.timeline-traveling-labels`. The
     class goes on the scrollport because that is what the effect is measured
     against, and it keeps the drag clone (reparented to `<body>`) out of it. */
  const travelingLabels = useProjectStore(
    (state) => state.project?.settings?.travelingLabels ?? DEFAULT_PROJECT_SETTINGS.travelingLabels
  );

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
      // A right-click here is a context menu, not a resize
      if (e.button !== 0) return;
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
    // The column's edge keeps its cursor however far the pointer outruns it
    document.body.classList.add('resizing-column');
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('resizing-column');
    };
  }, [isResizing, setLabelColumnWidth]);

  // Double-clicking the edge puts the column back to its default width
  const handleResizeDoubleClick = useCallback((): void => {
    setLabelColumnWidth(DEFAULT_LABEL_WIDTH);
  }, [setLabelColumnWidth]);

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
   * A pinch names its own point to hold: the day under the fingers.
   */
  const previousPixelsPerDay = useRef(pixelsPerDay);
  /** Left by a pinch just before it rescales: px from the plot's left edge. */
  const zoomAnchorRef = useRef<{ pixelsPerDay: number; x: number } | null>(null);
  /** The exact scrollLeft the last rescale asked for. */
  const zoomScrollRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const previous = previousPixelsPerDay.current;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (previous === pixelsPerDay) return;
    previousPixelsPerDay.current = pixelsPerDay;
    if (!el || previous <= 0) return;
    const x = anchor?.pixelsPerDay === pixelsPerDay ? anchor.x : el.clientWidth / 2;
    // `scrollLeft` rounds to device pixels, and a pinch rescales in dozens of
    // small steps: carried from one step to the next, the rounding would walk
    // the day out from under the fingers. While the browser still agrees with
    // the exact value the last step asked for, start from that instead.
    const asked = zoomScrollRef.current;
    const from = asked !== null && Math.abs(asked - el.scrollLeft) < 1 ? asked : el.scrollLeft;
    const next = Math.max(0, ((from + x) / previous) * pixelsPerDay - x);
    el.scrollLeft = next;
    zoomScrollRef.current = next;
  }, [pixelsPerDay]);

  /**
   * A pinch over the labels column holds the plot's left edge still — the
   * nearest the sheet comes to where the fingers are.
   */
  const setPixelsPerDay = useUIStore((state) => state.setPixelsPerDay);
  const handlePinch = useCallback(
    (factor: number, clientX: number): void => {
      const el = scrollContainerRef.current;
      // A zoom would move the plot out from under a drag's preview, as ⌘+ would
      if (!el || isGestureInFlight()) return;
      const current = pixelsPerDayOf(useUIStore.getState());
      const next = pinchedPixelsPerDay(current, factor);
      if (next === current) return;
      const x = clientX - el.getBoundingClientRect().left;
      zoomAnchorRef.current = { pixelsPerDay: next, x: Math.min(el.clientWidth, Math.max(0, x)) };
      setPixelsPerDay(next);
    },
    [setPixelsPerDay]
  );
  usePinchZoom({ element: timelineElement, onZoom: handlePinch });

  /**
   * Whose rows the sheet is showing. A switch names the new project a beat
   * before its schedules arrive, and until they do, the rows on screen — and
   * the scroll position over them — are still the last project's: nothing is
   * restored onto them, and nothing recorded from them.
   */
  const sheetProjectRef = useRef<string | null>(null);
  const lastProjectRef = useRef<string | null>(null);
  const lastSectionsRef = useRef(sections);
  useLayoutEffect(() => {
    const projectChanged = activeProjectId !== lastProjectRef.current;
    const sectionsArrived = sections !== lastSectionsRef.current;
    lastProjectRef.current = activeProjectId;
    lastSectionsRef.current = sections;
    if (projectChanged) sheetProjectRef.current = sectionsArrived ? activeProjectId : null;
    else if (sectionsArrived && sheetProjectRef.current === null) {
      sheetProjectRef.current = activeProjectId;
    }
  }, [activeProjectId, sections]);

  /**
   * The sheet carries a month of air before the first item so there is always
   * somewhere to drag to, but opening on an empty month reads as a mistake.
   * Open with the work against the left edge and only a gutter of lead-in
   * showing; the rest of that month is still there, one scroll back. Once per
   * project — after that the scroll position is the user's, and a project
   * visited earlier this session reopens wherever it was left.
   *
   * `sections` is a dependency for the ref above: the rows can arrive without
   * moving the span or the first day, and the arrival is what this waits on.
   */
  const anchoredRef = useRef<{ projectId: string; onContent: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !activeProjectId || sheetProjectRef.current !== activeProjectId) return;
    const anchored = anchoredRef.current?.projectId === activeProjectId ? anchoredRef.current : null;
    if (!anchored) {
      const saved = sheetPositions.get(activeProjectId);
      if (saved) {
        anchoredRef.current = { projectId: activeProjectId, onContent: true };
        const days = dayKeyDiff(viewportBounds.startKey, saved.startKey) + saved.days;
        el.scrollTop = saved.top;
        el.scrollLeft = Math.max(0, days * pixelsPerDay);
        return;
      }
    } else if (anchored.onContent || !contentStartKey) {
      // An empty project is parked on today until it has content to anchor to,
      // so a project still loading its schedules does not settle on the wrong day.
      return;
    }
    const anchorKey = contentStartKey ?? (isTodayInViewport(viewportBounds) ? todayKey() : null);
    if (!anchorKey) return;
    anchoredRef.current = { projectId: activeProjectId, onContent: contentStartKey !== null };
    // Opened for the first time, a project starts at its first schedule
    if (!anchored) el.scrollTop = 0;
    const x = dayToX(anchorKey, viewportBounds, pixelsPerDay);
    el.scrollLeft = Math.max(0, x - INITIAL_LEAD_IN_PX);
  }, [activeProjectId, sections, contentStartKey, viewportBounds, pixelsPerDay]);

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

  /**
   * Today's button and ⌘T bump a counter, and only a new bump scrolls. The
   * effect also re-runs on every zoom and every change of span, and a press
   * from minutes ago must not pull the sheet back to today each time — least
   * of all on every frame of a pinch.
   */
  const handledTodayTriggerRef = useRef(scrollToTodayTrigger);
  useEffect(() => {
    if (scrollToTodayTrigger === handledTodayTriggerRef.current) return;
    handledTodayTriggerRef.current = scrollToTodayTrigger;
    const el = scrollContainerRef.current;
    if (!el || !isTodayInViewport(viewportBounds)) return;
    const todayPixel = dayToX(todayKey(), viewportBounds, pixelsPerDay);
    const target = todayPixel - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [scrollToTodayTrigger, viewportBounds, pixelsPerDay]);

  /**
   * The pinned schedule's markers rule a line through every other schedule, so
   * they are drawn once here rather than by the schedule's own row.
   */
  const pinnedMarkers = useMemo(
    () => (pinnedSection ? headerMilestones(pinnedSection) : []),
    [pinnedSection]
  );

  const {
    draggingId: draggingSectionId,
    startScheduleDrag,
    labelsLineRef,
    plotLineRef,
  } = useScheduleDrag(unpinnedSections);

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
      // A pinch is a zoom, and passes on up to the timeline's own listener
      if (e.ctrlKey) return;
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
    const el = scrollContainerRef.current;
    if (!el) return;
    const newScrollTop = el.scrollTop;
    scrollTopRef.current = newScrollTop;

    // Remembered as the user goes, so leaving needs no hook of its own — but
    // only over this project's rows, once they have been anchored or restored
    if (
      activeProjectId &&
      sheetProjectRef.current === activeProjectId &&
      anchoredRef.current?.projectId === activeProjectId
    ) {
      sheetPositions.set(activeProjectId, {
        startKey: viewportBounds.startKey,
        days: el.scrollLeft / pixelsPerDay,
        top: newScrollTop,
      });
    }

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
  }, [computeStickyCount, activeProjectId, viewportBounds.startKey, pixelsPerDay]);

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
    <div
      ref={setTimelineElement}
      className="h-full flex flex-col relative"
      role="application"
      aria-label="Timeline editor"
    >
      <div className="flex-1 flex overflow-hidden relative">
        {/* Labels column */}
        <nav
          className="flex-shrink-0 border-r border-[var(--color-hairline)] bg-[var(--color-background)] flex flex-col relative"
          style={{ width: labelColumnWidth }}
          aria-label="Timeline labels"
        >
          {/* Twice as wide to catch as the band it shows: the padding is hit
              area, and the background is clipped to the content between. */}
          <div
            className={`absolute top-0 -right-1 w-2 px-0.5 bg-clip-content h-full cursor-col-resize z-20 touch-none transition-colors duration-fast ${
              isResizing ? 'bg-[var(--color-hairline)]' : 'hover:bg-[var(--color-hairline)]'
            }`}
            onPointerDown={handleResizePointerDown}
            onDoubleClick={handleResizeDoubleClick}
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
            <div
              ref={labelsContentRef}
              style={{ willChange: 'transform' }}
              data-flip-column="labels"
            >
              {pinnedSection && (
                <SectionRow
                  // Keyed, so pinning another schedule mounts its own row
                  // rather than handing it the last one's element — and that
                  // element's layout — mid-slide
                  key={pinnedSection.id}
                  section={pinnedSection}
                  isLabel
                  viewport={viewportBounds}
                  pixelsPerDay={pixelsPerDay}
                />
              )}

              <div className="relative" data-drag-container>
                {unpinnedSections.map((section) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    isLabel
                    viewport={viewportBounds}
                    pixelsPerDay={pixelsPerDay}
                    onGripPointerDown={startScheduleDrag}
                    isDragging={draggingSectionId === section.id}
                  />
                ))}
                <div ref={labelsLineRef} className="schedule-drop-line" aria-hidden="true" />
              </div>

              {/* The label column's share of the sheet's bottom edge */}
              <div className="border-t border-[var(--color-hairline)]" aria-hidden="true" />

              <div style={{ height: ROW_HEIGHT }} aria-hidden="true" />
            </div>
          </div>

          {stickySections.map((section, index) => (
            <StickyScheduleLabel
              key={section.id}
              section={section}
              slot={index}
              isLifted={draggingSectionId === section.id}
            />
          ))}

          <ScrollEdgeFade top={stickySlotTop(stickyCount)} isVisible={isScrolled} />
        </nav>

        {/* Timeline column */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-auto timeline-scroll-container${
            isPanning ? ' panning' : ''
          }${travelingLabels ? ' timeline-traveling-labels' : ''}`}
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
                isLifted={draggingSectionId === section.id}
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
              data-flip-column="plot"
              data-flip-origin={viewportBounds.startKey}
              data-flip-ppd={pixelsPerDay}
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
                  // Keyed, so pinning another schedule mounts its own row
                  // rather than handing it the last one's element — and that
                  // element's layout — mid-slide
                  key={pinnedSection.id}
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
                  isDragging={draggingSectionId === section.id}
                  isSticky={index + unpinnedStackOffset < stickyCount}
                />
              ))}

              <div ref={plotLineRef} className="schedule-drop-line" aria-hidden="true" />

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
