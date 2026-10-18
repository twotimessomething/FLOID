import { forwardRef, type ReactElement, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  ROW_HEIGHT,
  NESTED_ROW_HEIGHT,
  HEADER_HEIGHT,
  barInsetForDepth,
} from '../../../utils/timelineUtils';
import { addDaysToKey, fromDayKey } from '../../../utils/dayKeys';
import { SHEET_DAYS, type SheetWindow } from './sheetWindow';
import { getReadableTextColor } from '../../../utils/colorUtils';

/**
 * The walkthrough's paper.
 *
 * Not a diagram of the timeline and not a scaled-down replica of it: the real
 * row heights, the real bar markup, the real white gridlines and the same
 * label column, so the lesson cannot drift from the sheet the person lands on.
 * Only the store is missing — nothing here is written to it, because the
 * project does not exist yet.
 */

/** Every month boundary the sheet crosses, as fractions across it. */
function monthMarkers(sheet: SheetWindow): readonly { key: string; label: string; at: number }[] {
  const markers: { key: string; label: string; at: number }[] = [];
  for (let day = 0; day <= SHEET_DAYS; day += 1) {
    const key = addDaysToKey(sheet.start, day);
    if (day === 0 || key.endsWith('-01')) {
      markers.push({ key, label: format(fromDayKey(key), 'MMM'), at: day / SHEET_DAYS });
    }
  }
  return markers;
}

/** A week's worth of paper between rules, the way the real sheet draws it. */
const GRIDLINE_COUNT = SHEET_DAYS / 7;

interface WalkthroughSheetProps {
  readonly sheet: SheetWindow;
  /** The label column: one row per row in the plot, in the same order. */
  readonly labels: ReactNode;
  readonly children: ReactNode;
  /** Width of the label column. Matches the real sheet's default. */
  readonly labelWidth?: number;
}

/**
 * The plot is the ref'd element: every gesture in the walkthrough measures it
 * to turn a pointer into a day, exactly as the real timeline does.
 */
export const WalkthroughSheet = forwardRef<HTMLDivElement, WalkthroughSheetProps>(
  function WalkthroughSheet({ sheet, labels, children, labelWidth = 168 }, ref): ReactElement {
    return (
      <div className="w-full flex select-none text-left">
        <div
          className="flex-shrink-0 border-r border-[var(--color-hairline)]"
          style={{ width: labelWidth }}
        >
          <div style={{ height: HEADER_HEIGHT }} />
          {labels}
        </div>

        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: HEADER_HEIGHT }}>
            {monthMarkers(sheet).map((marker) => (
              <span
                key={marker.key}
                className="absolute bottom-2 pl-1.5 text-micro uppercase text-[var(--color-text-muted)]"
                style={{ left: `${marker.at * 100}%` }}
              >
                {marker.label}
              </span>
            ))}
          </div>

          {/* `timeline-plot` keeps the gridline stack to itself, as on the
              real sheet. Gridlines are white: gaps in the paper, not rules
              drawn on it. */}
          <div ref={ref} className="relative timeline-plot">
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {Array.from({ length: GRIDLINE_COUNT - 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-[var(--color-gridline)]"
                  style={{ left: `${((i + 1) / GRIDLINE_COUNT) * 100}%` }}
                />
              ))}
            </div>
            {children}
          </div>
        </div>
      </div>
    );
  }
);

interface SheetLabelProps {
  readonly name: string;
  readonly depth?: number;
  readonly isSchedule?: boolean;
  readonly hasChildren?: boolean;
  /** The row's item is in the hand: its name stays, drained, as on the sheet. */
  readonly isLifted?: boolean;
}

/**
 * A label row carries two motions on two clocks, as its bar does: it slides to
 * a new depth on the sheet's slow settle, and drains on the fast linear fade
 * the app's own label rows use (`.row-selectable`). One Tailwind duration
 * would put both on the same clock, so both are written out.
 */
const LABEL_TRANSITION =
  'height var(--duration-slow) var(--ease-out), padding var(--duration-slow) var(--ease-out), opacity var(--duration-fast) linear';
/** `.row-selectable.is-dragged-row`: the row a lifted item leaves behind. */
const LIFTED_LABEL_OPACITY = 0.32;

/** One row of the label column. Indent is 16px a level, as on the real sheet. */
export function SheetLabel({
  name,
  depth = 0,
  isSchedule = false,
  hasChildren = false,
  isLifted = false,
}: SheetLabelProps): ReactElement {
  const height = depth > 0 ? NESTED_ROW_HEIGHT : ROW_HEIGHT;
  return (
    <div
      className="flex items-center gap-1.5 pr-2"
      style={{
        height,
        paddingLeft: 10 + (isSchedule ? 0 : depth + 1) * 16,
        opacity: isLifted ? LIFTED_LABEL_OPACITY : undefined,
        transition: LABEL_TRANSITION,
      }}
    >
      <svg
        className={`w-3 h-3 flex-shrink-0 rotate-90 text-[var(--color-text-muted)] transition-opacity duration-base ${
          isSchedule || hasChildren ? 'opacity-100' : 'opacity-0'
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
      <span
        className={`truncate text-body ${
          isSchedule
            ? 'font-medium text-[var(--color-text-primary)]'
            : depth === 0
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)]'
        }`}
      >
        {name}
      </span>
    </div>
  );
}

interface SheetRowProps {
  readonly depth?: number;
  readonly children?: ReactNode;
}

export function SheetRow({ depth = 0, children }: SheetRowProps): ReactElement {
  return (
    <div
      className="relative transition-[height] duration-slow ease-out"
      style={{ height: depth > 0 ? NESTED_ROW_HEIGHT : ROW_HEIGHT }}
    >
      {children}
    </div>
  );
}

export interface SheetBarProps {
  /** Fractions across the sheet. */
  readonly from: number;
  readonly to: number;
  readonly color: string;
  readonly name: string;
  readonly depth?: number;
  /** The one invitation a lesson makes. Stops on first contact. */
  readonly isInviting?: boolean;
  /** The outline the source leaves while its clone is in flight. */
  readonly isLifted?: boolean;
  /** The bar under the pointer, which would take the drop. */
  readonly isReceiving?: boolean;
  readonly onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Marks this bar as a drop target for `elementsFromPoint` hit-testing. */
  readonly dropId?: string;
}

/**
 * The fill carries two motions on two clocks: the drain when its bar is lifted
 * is the app's own (`.timeline-bar__fill`, fast and linear), and the ink
 * changing hands when a bar joins a group is the slower settle. Tailwind's
 * `transition-colors` would replace the first with the second, so both are
 * written out.
 */
const FILL_TRANSITION =
  'background-color var(--duration-slow) var(--ease-out), opacity var(--duration-fast) linear';
/**
 * The name changes ink on the fill's clock. `getReadableTextColor` answers for
 * the colour the fill is going to, so a name that switched at once would sit
 * in paper on the old ink — the one pairing it was chosen to avoid — for the
 * whole of the fill's change.
 */
const NAME_TRANSITION = 'color var(--duration-slow) var(--ease-out)';

/**
 * A bar, layered the way every bar in the app is: a plain wrapper carrying the
 * geometry, a fill under a label. Every state rides a layer inside it, so a bar
 * can lose its colour without losing its name.
 *
 * The element is forwarded because a drag needs it twice: once to clone when
 * the bar is picked up, and again as the place the clone lands.
 */
export const SheetBar = forwardRef<HTMLDivElement, SheetBarProps>(function SheetBar(
  {
    from,
    to,
    color,
    name,
    depth = 0,
    isInviting = false,
    isLifted = false,
    isReceiving = false,
    onPointerDown,
    dropId,
  },
  ref
): ReactElement {
  const inset = barInsetForDepth(depth);
  return (
    <div
      ref={ref}
      data-drop-bar={dropId}
      onPointerDown={onPointerDown}
      // A lifted bar is the one its drag clones, and the clone takes every
      // class with it. Its size is written on every frame of the landing, so
      // a geometry transition riding along would trail each write by 200ms.
      // The transition comes back in the same render as the drop that moves
      // the bar, which is all a transition needs to run.
      className={`absolute timeline-bar ${
        isLifted ? '' : 'transition-[left,width,top,bottom] duration-slow ease-out'
      } ${onPointerDown ? 'cursor-grab active:cursor-grabbing touch-none' : ''} ${
        isLifted ? 'timeline-bar--lifted' : ''
      } ${isReceiving ? 'timeline-bar--receiving' : ''} ${isInviting ? 'walkthrough-invite' : ''}`}
      style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%`, top: inset, bottom: inset }}
    >
      <div
        className="timeline-bar__fill"
        style={{ backgroundColor: color, transition: FILL_TRANSITION }}
      />
      <span className="timeline-bar__label">
        <span
          className="truncate"
          style={{ color: getReadableTextColor(color), transition: NAME_TRANSITION }}
        >
          {name}
        </span>
      </span>
    </div>
  );
});
