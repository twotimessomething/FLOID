import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../common/Button';
import { PHASE_COLORS, SCHEDULE_COLORS } from '../../constants/colors';
import { getReadableTextColor } from '../../utils/colorUtils';

interface Slide {
  readonly title: string;
  readonly body: string;
  readonly illustration: ReactNode;
}

// Scaled-down counterparts of ROW_HEIGHT / NESTED_ROW_HEIGHT / HEADER_HEIGHT and
// the 16px-per-level label indent, so the miniatures keep the real proportions.
const MINI_HEADER_HEIGHT = 20;
const MINI_ROW_HEIGHT = 32;
const MINI_NESTED_ROW_HEIGHT = 22;
const MINI_INDENT_PX = 9;

/** Mirrors barInsetForDepth: nested rows are shorter, so their bars sit tighter. */
function miniInsetForDepth(depth: number): number {
  return depth === 0 ? 5 : 4;
}

const GRIDLINE_POSITIONS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5];

const MONTH_MARKERS = [
  { label: 'Mar', left: 0.5 },
  { label: 'Apr', left: 25 },
  { label: 'May', left: 50 },
  { label: 'Jun', left: 75 },
];

function LogoMark({ isDark }: { readonly isDark: boolean }): ReactElement {
  const src = isDark ? '/FLOID_logo_dark.svg' : '/FLOID_logo.svg';
  return <img src={src} alt="FLOID" className="h-16" />;
}

/* =========================================
   Miniature timeline primitives
   Faithful, scaled-down replicas of the real
   timeline UI, built from the same CSS vars.
   ========================================= */

function MiniPin(): ReactElement {
  return (
    <svg
      className="w-2.5 h-2.5 rotate-45 flex-shrink-0 text-[var(--color-text-muted)]"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

function MiniChevron(): ReactElement {
  return (
    <svg
      className="w-2 h-2 rotate-90 flex-shrink-0 text-[var(--color-text-muted)]"
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
  );
}

interface MiniLabelRowProps {
  readonly name: string;
  /** A schedule is the root of its tree; 0 is a root item under one. */
  readonly depth?: number;
  readonly height?: number;
  readonly isSchedule?: boolean;
  readonly isPinned?: boolean;
  readonly isMilestone?: boolean;
  readonly chevron?: boolean;
}

function MiniLabelRow({
  name,
  depth = 0,
  height = MINI_ROW_HEIGHT,
  isSchedule = false,
  isPinned = false,
  isMilestone = false,
  chevron = false,
}: MiniLabelRowProps): ReactElement {
  return (
    <div
      className="flex items-center gap-1 pr-1"
      style={{
        height,
        paddingLeft: 6 + (isSchedule ? 0 : depth + 1) * MINI_INDENT_PX,
      }}
    >
      {chevron ? (
        <MiniChevron />
      ) : (
        <span className="w-2 flex-shrink-0" aria-hidden="true">
          {isMilestone && (
            <span className="block w-1 h-1 mx-auto rotate-45 bg-[var(--color-text-muted)]" />
          )}
        </span>
      )}
      <span
        className={`text-[0.5625rem] truncate ${isSchedule ? 'font-semibold' : ''} ${
          depth === 0 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
        }`}
      >
        {name}
      </span>
      {isPinned && <MiniPin />}
    </div>
  );
}

interface MiniRowProps {
  readonly height?: number;
  readonly children?: ReactNode;
}

function MiniRow({ height = MINI_ROW_HEIGHT, children }: MiniRowProps): ReactElement {
  return (
    <div className="relative" style={{ height }}>
      {children}
    </div>
  );
}

interface MiniBarProps {
  readonly left: number; // percent
  readonly width: number; // percent
  readonly color: string;
  readonly label?: string;
  readonly depth?: number;
  /** The outline a bar leaves behind while its clone is in flight. */
  readonly isLifted?: boolean;
  /** The bar under the cursor, which will take the dragged item. */
  readonly isReceiving?: boolean;
  readonly showHandles?: boolean;
}

function MiniBar({
  left,
  width,
  color,
  label,
  depth = 0,
  isLifted = false,
  isReceiving = false,
  showHandles = false,
}: MiniBarProps): ReactElement {
  const textColor = getReadableTextColor(color);
  const inset = miniInsetForDepth(depth);
  return (
    <div
      className={`absolute timeline-bar ${isLifted ? 'timeline-bar--lifted' : ''} ${
        isReceiving ? 'timeline-bar--receiving' : ''
      }`}
      style={{ left: `${left}%`, width: `${width}%`, top: inset, bottom: inset }}
    >
      <div className="timeline-bar__fill" style={{ backgroundColor: color }} />
      {label && (
        <span
          className={`absolute inset-0 flex items-center px-1.5 overflow-hidden text-[0.5625rem] ${
            isLifted ? 'opacity-40' : ''
          }`}
        >
          <span className="truncate" style={{ color: textColor }}>
            {label}
          </span>
        </span>
      )}
      {showHandles && (
        <>
          <span
            className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[3px] h-2.5"
            style={{ backgroundColor: textColor }}
          />
          <span
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-[3px] h-2.5"
            style={{ backgroundColor: textColor }}
          />
        </>
      )}
    </div>
  );
}

interface MiniGhostBarProps {
  readonly left: number; // percent
  readonly width: number; // percent
  readonly color: string;
}

/** The dashed sketch a create gesture leaves under the cursor. */
function MiniGhostBar({ left, width, color }: MiniGhostBarProps): ReactElement {
  return (
    <div
      className="absolute overflow-hidden border border-dashed"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        top: miniInsetForDepth(0),
        bottom: miniInsetForDepth(0),
        borderColor: color,
      }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.16 }} />
    </div>
  );
}

interface MiniMilestoneProps {
  readonly left: number; // percent
  /** Omitted where bars already fill the band the name would print in. */
  readonly label?: string;
  /** How far the reference line runs down through the schedule below. */
  readonly lineHeight?: number;
}

function MiniMilestone({ left, label, lineHeight = 0 }: MiniMilestoneProps): ReactElement {
  return (
    <div className="absolute top-0 z-10" style={{ left: `${left}%`, height: MINI_ROW_HEIGHT }}>
      {lineHeight > 0 && (
        <div
          className="absolute left-0 top-full w-px bg-[var(--color-milestone-line)]"
          style={{ height: lineHeight }}
        />
      )}
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[var(--color-text-primary)]" />
      {label && (
        <span className="absolute bottom-0 left-0 -translate-x-1/2 text-[0.5rem] leading-none text-[var(--color-text-primary)] whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}

/** Where a released item lands among its siblings. */
function MiniDropLine(): ReactElement {
  return <div className="absolute left-0 right-0 top-0 h-px z-20 bg-[var(--color-accent)]" />;
}

interface MiniDragCloneProps {
  readonly left: number; // percent
  readonly top: number; // px, relative to the row
  readonly width: number; // percent
  readonly color: string;
  readonly label: string;
  /** Omitted where the drop, not the date, is the point of the illustration. */
  readonly date?: string;
}

/**
 * The bar in flight. It floats above the sheet, so unlike a placed bar it is
 * allowed a shadow and composites normally instead of overprinting.
 */
function MiniDragClone({ left, top, width, color, label, date }: MiniDragCloneProps): ReactElement {
  const textColor = getReadableTextColor(color);
  return (
    <div className="absolute z-30" style={{ left: `${left}%`, top, width: `${width}%` }}>
      <div
        className="flex items-center h-[22px] px-1.5 overflow-hidden shadow-md"
        style={{ backgroundColor: color }}
      >
        <span className="text-[0.5625rem] truncate" style={{ color: textColor }}>
          {label}
        </span>
      </div>
      {date && (
        <span className="absolute top-full left-0 mt-1 px-1 py-px rounded-[var(--radius-sm)] bg-[var(--color-tooltip)] text-[var(--color-tooltip-text)] text-[0.5rem] leading-normal whitespace-nowrap">
          {date}
        </span>
      )}
    </div>
  );
}

interface MiniFrameProps {
  readonly labels: ReactNode;
  readonly children: ReactNode;
}

function MiniFrame({ labels, children }: MiniFrameProps): ReactElement {
  return (
    <div className="w-full flex overflow-hidden select-none text-left" aria-hidden="true">
      {/* Labels column */}
      <div className="w-32 flex-shrink-0 border-r border-[var(--color-hairline)]">
        <div style={{ height: MINI_HEADER_HEIGHT }} />
        {labels}
      </div>

      {/* Timeline column */}
      <div className="flex-1 min-w-0">
        {/* Month header */}
        <div className="relative" style={{ height: MINI_HEADER_HEIGHT }}>
          {MONTH_MARKERS.map((marker) => (
            <span
              key={marker.label}
              className="absolute top-1/2 -translate-y-1/2 pl-1 text-[0.5rem] uppercase tracking-wide text-[var(--color-text-muted)]"
              style={{ left: `${marker.left}%` }}
            >
              {marker.label}
            </span>
          ))}
        </div>

        {/* Rows with gridlines. `timeline-plot` isolates the bars' blending. */}
        <div className="relative timeline-plot">
          <div className="absolute inset-0 pointer-events-none">
            {GRIDLINE_POSITIONS.map((position) => (
              <div
                key={position}
                className="absolute top-0 bottom-0 border-l border-[var(--color-gridline)]"
                style={{ left: `${position}%` }}
              />
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniCursor({ left, top }: { readonly left: number; readonly top: number }): ReactElement {
  return (
    <svg
      className="absolute z-30 w-3.5 h-3.5 text-[var(--color-text-primary)]"
      style={{ left: `${left}%`, top }}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 3l0 15 4-4 2.5 6 2.5-1-2.5-6 5.5 0z" />
    </svg>
  );
}

/* =========================================
   Slide illustrations

   Color sequencing is deliberate: siblings in the same row alternate value —
   a mid-tone next to a light tint next to a dark saturated — the same
   alternation the real palette (`src/constants/colors.ts`) is built around.
   Nested bars repeat their parent's exact color, because that is what the
   real tree does: a group reads as one block however deep it goes.
   ========================================= */

function SchedulesIllustration(): ReactElement {
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Product Timeline" isSchedule isPinned chevron />
          <MiniLabelRow name="Design" isSchedule chevron />
          <MiniLabelRow name="Engineering" isSchedule chevron />
        </>
      }
    >
      {/* Today playhead */}
      <div
        className="absolute inset-y-0 w-px z-20 pointer-events-none bg-[var(--color-today)]"
        style={{ left: '38%' }}
      />
      <MiniRow>
        <MiniMilestone left={64} lineHeight={64} />
        <MiniBar left={2} width={30} color={PHASE_COLORS.teal} label="Discover" />
        <MiniBar left={34} width={28} color={PHASE_COLORS.sky} label="Concept" />
        <MiniBar left={66} width={31} color={PHASE_COLORS.blue} label="Design" />
      </MiniRow>
      <MiniRow>
        <MiniBar left={6} width={38} color={SCHEDULE_COLORS[2]} label="Research" />
        <MiniBar left={48} width={34} color={SCHEDULE_COLORS[2]} label="Concepts" />
      </MiniRow>
      <MiniRow>
        <MiniBar left={28} width={46} color={SCHEDULE_COLORS[3]} label="Feasibility" />
      </MiniRow>
    </MiniFrame>
  );
}

function CreateIllustration(): ReactElement {
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Discover" isSchedule chevron />
          <MiniLabelRow name="Research" />
          <MiniLabelRow name="" />
        </>
      }
    >
      <MiniRow>
        <MiniMilestone left={26} label="Kickoff" lineHeight={64} />
      </MiniRow>
      <MiniRow>
        <MiniBar left={6} width={34} color={PHASE_COLORS.teal} label="Research" />
      </MiniRow>
      <MiniRow>
        <MiniGhostBar left={46} width={30} color={PHASE_COLORS.teal} />
        <MiniCursor left={75} top={15} />
      </MiniRow>
    </MiniFrame>
  );
}

function DragIllustration(): ReactElement {
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Engineering" isSchedule chevron />
          <MiniLabelRow name="Tooling" />
          <MiniLabelRow name="Samples" />
        </>
      }
    >
      <MiniRow />
      <MiniRow>
        <MiniBar left={16} width={30} color={PHASE_COLORS.orange} label="Tooling" isLifted />
      </MiniRow>
      <MiniRow>
        <MiniDropLine />
        <MiniBar left={58} width={26} color={PHASE_COLORS.orange} label="Samples" />
        <div className="walkthrough-drift absolute inset-0">
          <MiniDragClone
            left={26}
            top={-6}
            width={30}
            color={PHASE_COLORS.orange}
            label="Tooling"
            date="Apr 12"
          />
          <MiniCursor left={30} top={-2} />
        </div>
      </MiniRow>
    </MiniFrame>
  );
}

function GroupIllustration(): ReactElement {
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Engineering" isSchedule chevron />
          <MiniLabelRow name="Tooling" chevron />
          <MiniLabelRow name="Molds" depth={1} height={MINI_NESTED_ROW_HEIGHT} chevron />
          <MiniLabelRow name="First shots" depth={2} height={MINI_NESTED_ROW_HEIGHT} />
        </>
      }
    >
      <MiniRow />
      <MiniRow>
        <MiniBar left={14} width={62} color={PHASE_COLORS.orange} label="Tooling" isReceiving />
        <MiniDragClone left={44} top={-4} width={26} color={PHASE_COLORS.ochre} label="Samples" />
        <MiniCursor left={48} top={0} />
      </MiniRow>
      <MiniRow height={MINI_NESTED_ROW_HEIGHT}>
        <MiniBar left={18} width={30} color={PHASE_COLORS.orange} label="Molds" depth={1} />
      </MiniRow>
      <MiniRow height={MINI_NESTED_ROW_HEIGHT}>
        <MiniBar left={22} width={18} color={PHASE_COLORS.orange} label="First shots" depth={2} />
      </MiniRow>
    </MiniFrame>
  );
}

/* =========================================
   Walkthrough
   ========================================= */

export function WelcomeWalkthrough(): ReactElement {
  const openProjectSetupModal = useUIStore((state) => state.openProjectSetupModal);
  const isProjectSetupModalOpen = useUIStore((state) => state.isProjectSetupModalOpen);
  const theme = useUIStore((state) => state.theme);
  const [systemIsDark, setSystemIsDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => setSystemIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemIsDark);

  const slides = useMemo<readonly Slide[]>(
    () => [
      {
        title: '',
        body: 'Fluid timelines for product development.',
        illustration: <LogoMark isDark={isDark} />,
      },
      {
        title: 'One timeline, every team',
        body: 'Give each team a schedule. They all run on the same set of dates.',
        illustration: <SchedulesIllustration />,
      },
      {
        title: 'Draw the work',
        body: 'Double-click empty space for a bar, or drag out the span you want.',
        illustration: <CreateIllustration />,
      },
      {
        title: 'Drag it into shape',
        body: 'Move dates, reorder rows, or carry a bar into another schedule.',
        illustration: <DragIllustration />,
      },
      {
        title: 'Drop a bar on a bar to group it',
        body: 'Groups nest to any depth and travel as one.',
        illustration: <GroupIllustration />,
      },
      {
        title: "You're ready to plan",
        body: 'Right-click anything for the rest.',
        illustration: <LogoMark isDark={isDark} />,
      },
    ],
    [isDark]
  );

  const lastIndex = slides.length - 1;
  const isLast = index === lastIndex;
  const isFirst = index === 0;

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, lastIndex));
  }, [lastIndex]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    if (isProjectSetupModalOpen) return;
    const handleKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, a')) return;
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'Enter') {
        if (isLast) openProjectSetupModal();
        else goNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goBack, isLast, openProjectSetupModal, isProjectSetupModalOpen]);

  const slide = slides[index];

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-background)] px-6">
      {/* Ink on the sheet, not a card resting on it: the walkthrough sits
          straight on the app ground, held together by whitespace. */}
      {!isProjectSetupModalOpen && (
        <div
          className="w-full max-w-xl modal-enter relative"
          role="region"
          aria-label="Welcome walkthrough"
        >
          {!isLast && (
            <button
              type="button"
              onClick={openProjectSetupModal}
              className="absolute top-2 right-6 z-10 text-meta text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-fast focus-ring rounded-[var(--radius-sm)] px-1.5 py-0.5"
            >
              Skip
            </button>
          )}

          <div className="px-8 pt-10 pb-6">
            <div key={index} className="walkthrough-slide-enter">
              <div className="h-40 mb-6 flex items-center justify-center">{slide.illustration}</div>
              {slide.title && (
                <h2 className="text-sm font-medium text-[var(--color-text-primary)] mb-3 text-center">
                  {slide.title}
                </h2>
              )}
              <p className="text-body text-[var(--color-text-secondary)] text-center leading-relaxed max-w-md mx-auto min-h-[2.5rem]">
                {slide.body}
              </p>
              {isLast && (
                <div className="flex justify-center mt-2">
                  <Button variant="primary" onClick={openProjectSetupModal}>
                    Create Project
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="px-8 pt-4 pb-6 flex items-center justify-between">
            <div className="min-w-[72px]">
              {!isFirst && (
                <Button variant="ghost" onClick={goBack} aria-label="Previous slide">
                  Back
                </Button>
              )}
            </div>

            <div
              className="flex items-center gap-1.5"
              role="tablist"
              aria-label="Walkthrough progress"
            >
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`w-2 h-2 rounded-[var(--radius-sm)] transition-colors duration-fast ${
                    i === index
                      ? 'bg-[var(--color-text-primary)]'
                      : 'bg-[var(--color-border)] hover:bg-[var(--color-text-muted)]'
                  }`}
                />
              ))}
            </div>

            <div className="min-w-[72px] flex justify-end">
              {!isLast && (
                <Button variant="primary" onClick={goNext} aria-label="Next slide">
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
