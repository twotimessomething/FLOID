import { ROW_HEIGHT } from '../../utils/timelineUtils';

interface GhostMilestoneProps {
  readonly x: number;
  /** How far the reference line would run down through the schedule. */
  readonly lineHeight: number;
}

/**
 * Faint preview of the milestone a double-click on a schedule's own row would
 * drop, trailing the line it would draw down through the rows beneath it.
 *
 * The schedule row carries no other affordance — there is no bar to grab and no
 * "+" to find — so this ghost is the only thing that says the row is live, and
 * it keeps its hint text for that reason.
 */
export function GhostMilestone({ x, lineHeight }: GhostMilestoneProps): JSX.Element {
  return (
    <div
      className="absolute top-0 pointer-events-none z-20"
      style={{ left: x, height: ROW_HEIGHT }}
      aria-hidden="true"
    >
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[var(--color-text-primary)] opacity-25" />
      {/* Above the diamond, mirroring where the name will print below it, so
          the hint never sits in the space it is describing. Same type scale as
          MilestoneLabel; only the colour is muted. */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[11px] leading-none text-[var(--color-text-muted)] whitespace-nowrap">
        Double-click
      </div>
      {lineHeight > 0 && (
        <div
          className="absolute -translate-x-1/2"
          style={{
            left: 0,
            top: ROW_HEIGHT,
            height: lineHeight,
            borderLeft: '1px dashed var(--color-milestone-line)',
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
}
