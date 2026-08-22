import type { TimelineItem, ViewportBounds } from '../../types';
import { EDGE_FADE_HEIGHT } from '../../utils/timelineUtils';
import { MilestoneLines } from './MilestoneLines';
import { TimelineGrid } from './TimelineGrid';
import { TodayLine } from './TodayLine';

interface StickyEdgeFadeProps {
  /** Distance from the top of the scroll container to the foot of the held stack. */
  readonly top: number;
  /** Only once there is something above to fade — an unscrolled sheet has none. */
  readonly isVisible: boolean;
  /** The pinned schedule's markers — their lines rule through this strip too. */
  readonly pinnedMarkers: readonly TimelineItem[];
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
}

/**
 * Where the bars meet the date axis: the same wash `ScrollEdgeFade` lays over
 * the labels column, with the sheet's verticals ruled back over it.
 *
 * A wash is paper, and paper laid over a rule cuts it. The verticals are the
 * one thing on this sheet that has to run unbroken — gridlines, today, the
 * pinned schedule's reference lines — so they are drawn again here, at full
 * strength, above the wash. The bars underneath still dissolve; only the rules
 * carry through, exactly as they do through a held schedule's band.
 *
 * It is held in the scroll flow rather than laid over it — a strip outside the
 * scroll container could not travel sideways with the sheet, and every vertical
 * on it would sit a scroll's worth off true.
 */
export function StickyEdgeFade({
  top,
  isVisible,
  pinnedMarkers,
  viewport,
  pixelsPerDay,
}: StickyEdgeFadeProps): JSX.Element {
  return (
    <div
      className="sticky z-30 pointer-events-none transition-opacity duration-base ease-out"
      style={{
        top,
        height: EDGE_FADE_HEIGHT,
        marginBottom: -EDGE_FADE_HEIGHT,
        opacity: isVisible ? 1 : 0,
      }}
      aria-hidden="true"
    >
      <div className="edge-fade absolute inset-0 bg-[var(--color-background)]" />
      <TimelineGrid height={EDGE_FADE_HEIGHT} />
      <MilestoneLines
        milestones={pinnedMarkers}
        viewport={viewport}
        pixelsPerDay={pixelsPerDay}
        top={0}
        height={EDGE_FADE_HEIGHT}
      />
      <TodayLine viewport={viewport} pixelsPerDay={pixelsPerDay} height={EDGE_FADE_HEIGHT} />
    </div>
  );
}
