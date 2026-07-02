import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../common/Button';
import { PHASE_COLORS, SCHEDULE_COLORS } from '../../constants/colors';

interface Slide {
  readonly title: string;
  readonly body: string;
  readonly illustration: ReactNode;
}

// Miniature timeline dimensions (scaled-down versions of ROW_HEIGHT / TASK_ROW_HEIGHT / HEADER_HEIGHT)
const MINI_HEADER_HEIGHT = 20;
const MINI_ROW_HEIGHT = 32;
const MINI_TASK_ROW_HEIGHT = 22;

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
    <svg className="w-2.5 h-2.5 rotate-45 flex-shrink-0 text-[var(--color-warning)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

function MiniChevron(): ReactElement {
  return (
    <svg className="w-2 h-2 rotate-90 flex-shrink-0 text-[var(--color-text-muted)]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
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
  readonly height?: number;
  readonly isPinned?: boolean;
  readonly isTask?: boolean;
  readonly chevron?: boolean;
  readonly dotColor?: string;
}

function MiniLabelRow({
  name,
  height = MINI_ROW_HEIGHT,
  isPinned = false,
  isTask = false,
  chevron = false,
  dotColor,
}: MiniLabelRowProps): ReactElement {
  return (
    <div
      className={`flex items-center gap-1 border-b ${isPinned ? 'border-l-2 border-l-amber-400 bg-[var(--color-background)]' : ''} ${isTask ? 'pl-5 pr-1' : 'pl-1.5 pr-1'}`}
      style={{
        height,
        borderBottomColor: isPinned ? 'var(--color-row-border-strong)' : 'var(--color-row-border)',
      }}
    >
      {chevron && <MiniChevron />}
      {dotColor && (
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
      )}
      <span
        className={`text-[9px] truncate ${isPinned ? 'font-semibold' : ''} ${isTask ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]'}`}
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
    <div className="relative border-b" style={{ height, borderColor: 'var(--color-row-border)' }}>
      {children}
    </div>
  );
}

interface MiniBarProps {
  readonly left: number; // percent
  readonly width: number; // percent
  readonly color: string;
  readonly label?: string;
  readonly inset?: number; // px from row top/bottom
  readonly isGhost?: boolean;
  readonly showHandles?: boolean;
}

function MiniBar({ left, width, color, label, inset = 4, isGhost = false, showHandles = false }: MiniBarProps): ReactElement {
  return (
    <div
      className="absolute rounded-md flex items-center px-1.5 overflow-hidden"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        top: inset,
        bottom: inset,
        backgroundColor: color,
        opacity: isGhost ? 0.3 : undefined,
      }}
    >
      {label && <span className="text-[9px] font-medium text-white truncate drop-shadow-sm">{label}</span>}
      {showHandles && (
        <>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-3 rounded bg-white/80" />
          <span className="absolute right-1 top-1/2 -translate-y-1/2 w-[3px] h-3 rounded bg-white/80" />
        </>
      )}
    </div>
  );
}

interface MiniMilestoneProps {
  readonly left: number; // percent
  readonly label?: string;
  readonly lineHeight?: number; // px extending below the marker
  readonly isGhost?: boolean;
}

function MiniMilestone({ left, label, lineHeight = 0, isGhost = false }: MiniMilestoneProps): ReactElement {
  return (
    <div className="absolute top-0 z-10" style={{ left: `${left}%`, height: MINI_ROW_HEIGHT }}>
      {lineHeight > 0 && (
        <div
          className="absolute left-0 -translate-x-1/2 w-px bg-[var(--color-milestone-line)]"
          style={{ top: 22, height: lineHeight }}
        />
      )}
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-[var(--color-text-primary)] ${isGhost ? 'opacity-25' : ''}`}
      />
      {label && (
        <div
          className={`absolute left-0 -translate-x-1/2 z-20 whitespace-nowrap ${
            isGhost
              ? 'top-[20px] text-[8px] font-medium text-[var(--color-text-muted)] opacity-70'
              : 'top-[19px] px-1 py-px bg-[var(--color-surface)]/90 border border-[var(--color-border)] rounded text-[8px] text-[var(--color-text-primary)]'
          }`}
        >
          {label}
        </div>
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
    <div
      className="w-full flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm select-none text-left"
      aria-hidden="true"
    >
      {/* Labels column */}
      <div className="w-32 flex-shrink-0 border-r border-[var(--color-border)]">
        <div
          className="border-b"
          style={{ height: MINI_HEADER_HEIGHT, borderColor: 'var(--color-row-border-strong)' }}
        />
        {labels}
      </div>

      {/* Timeline column */}
      <div className="flex-1 min-w-0">
        {/* Month header */}
        <div
          className="relative border-b"
          style={{ height: MINI_HEADER_HEIGHT, borderColor: 'var(--color-row-border-strong)' }}
        >
          {MONTH_MARKERS.map((marker) => (
            <span
              key={marker.label}
              className="absolute top-1/2 -translate-y-1/2 text-[8px] font-medium text-[var(--color-text-secondary)] pl-1"
              style={{ left: `${marker.left}%` }}
            >
              {marker.label}
            </span>
          ))}
        </div>

        {/* Rows with gridlines */}
        <div className="relative">
          <div className="absolute inset-0 pointer-events-none">
            {GRIDLINE_POSITIONS.map((position) => (
              <div
                key={position}
                className="absolute top-0 bottom-0 border-l"
                style={{
                  left: `${position}%`,
                  borderColor: position % 25 === 0 ? 'var(--color-gridline-major)' : 'var(--color-gridline-minor)',
                }}
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
      className="absolute z-30 w-3.5 h-3.5 text-[var(--color-text-primary)] drop-shadow-md"
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
   ========================================= */

function SchedulesIllustration(): ReactElement {
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Product Timeline" isPinned chevron />
          <MiniLabelRow name="Design" chevron dotColor={SCHEDULE_COLORS[0]} />
          <MiniLabelRow name="Engineering" chevron dotColor={SCHEDULE_COLORS[1]} />
        </>
      }
    >
      {/* Today playhead */}
      <div
        className="absolute inset-y-0 w-px bg-[var(--color-today)] opacity-70 z-20 pointer-events-none"
        style={{ left: '38%' }}
      />
      <MiniRow>
        <MiniMilestone left={64} label="Design lock" lineHeight={74} />
        <MiniBar left={2} width={30} color={PHASE_COLORS.discovery} label="Discover" />
        <MiniBar left={34} width={28} color={PHASE_COLORS.concept} label="Concept" />
        <MiniBar left={66} width={31} color={PHASE_COLORS.design} label="Design" />
      </MiniRow>
      <MiniRow>
        <MiniBar left={6} width={38} color={SCHEDULE_COLORS[0]} label="Research" />
        <MiniBar left={48} width={34} color={SCHEDULE_COLORS[0]} label="Concepts" />
      </MiniRow>
      <MiniRow>
        <MiniBar left={28} width={46} color={SCHEDULE_COLORS[1]} label="Feasibility" />
      </MiniRow>
    </MiniFrame>
  );
}

function ItemsIllustration(): ReactElement {
  const taskColor = `${PHASE_COLORS.concept}CC`;
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Product Timeline" isPinned chevron />
          <MiniLabelRow name="Concept" chevron dotColor={PHASE_COLORS.concept} />
          <MiniLabelRow name="Sketches" isTask height={MINI_TASK_ROW_HEIGHT} />
          <MiniLabelRow name="CAD model" isTask height={MINI_TASK_ROW_HEIGHT} />
        </>
      }
    >
      <MiniRow>
        <MiniMilestone left={76} label="Design review" lineHeight={86} />
      </MiniRow>
      <MiniRow>
        <MiniBar left={8} width={62} color={PHASE_COLORS.concept} label="Concept" />
      </MiniRow>
      <MiniRow height={MINI_TASK_ROW_HEIGHT}>
        <MiniBar left={10} width={28} color={taskColor} label="Sketches" inset={3} />
      </MiniRow>
      <MiniRow height={MINI_TASK_ROW_HEIGHT}>
        <MiniBar left={42} width={26} color={taskColor} label="CAD model" inset={3} />
      </MiniRow>
    </MiniFrame>
  );
}

function CreateIllustration(): ReactElement {
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Product Timeline" isPinned chevron />
          <MiniLabelRow name="Discover" chevron dotColor={PHASE_COLORS.discovery} />
          <MiniLabelRow name="" />
        </>
      }
    >
      <MiniRow>
        <MiniMilestone left={24} label="Double-click" isGhost />
      </MiniRow>
      <MiniRow>
        <MiniBar left={4} width={34} color={PHASE_COLORS.discovery} label="Discover" />
      </MiniRow>
      <MiniRow>
        <MiniBar left={40} width={30} color={PHASE_COLORS.concept} label="Double-click" isGhost />
        <MiniCursor left={58} top={14} />
      </MiniRow>

      {/* Right-click context menu */}
      <div className="absolute right-2 top-8 z-30 w-[88px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-0.5">
        {['Add Phase', 'Add Task', 'Add Milestone'].map((item, i) => (
          <div
            key={item}
            className={`px-2 py-[3px] text-[8px] ${
              i === 0
                ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)] font-medium'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {item}
          </div>
        ))}
      </div>
    </MiniFrame>
  );
}

function DragIllustration(): ReactElement {
  const taskColor = `${PHASE_COLORS.engineering}CC`;
  return (
    <MiniFrame
      labels={
        <>
          <MiniLabelRow name="Product Timeline" isPinned chevron />
          <MiniLabelRow name="Engineering" chevron dotColor={PHASE_COLORS.engineering} />
          <MiniLabelRow name="Tooling" isTask height={MINI_TASK_ROW_HEIGHT} />
          <MiniLabelRow name="Samples" isTask height={MINI_TASK_ROW_HEIGHT} />
        </>
      }
    >
      <MiniRow />
      <MiniRow>
        <div className="walkthrough-drift absolute inset-0">
          <MiniBar left={18} width={54} color={PHASE_COLORS.engineering} label="Engineering" showHandles />
          {/* Drag date bubble above the end handle */}
          <div
            className="absolute z-30 -top-3 -translate-x-1/2 px-1 py-px rounded bg-[var(--color-tooltip)] text-[var(--color-tooltip-text)] text-[8px] font-medium shadow-lg whitespace-nowrap pointer-events-none"
            style={{ left: '72%' }}
          >
            May 28
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-l-transparent border-r-transparent border-t-[var(--color-tooltip)]" />
          </div>
        </div>
      </MiniRow>
      <MiniRow height={MINI_TASK_ROW_HEIGHT}>
        <div className="walkthrough-drift absolute inset-0">
          <MiniBar left={20} width={24} color={taskColor} label="Tooling" inset={3} />
        </div>
      </MiniRow>
      <MiniRow height={MINI_TASK_ROW_HEIGHT}>
        <div className="walkthrough-drift absolute inset-0">
          <MiniBar left={46} width={24} color={taskColor} label="Samples" inset={3} />
        </div>
      </MiniRow>
    </MiniFrame>
  );
}

/* =========================================
   Walkthrough
   ========================================= */

export function WelcomeWalkthrough(): ReactElement {
  const openProjectSetupModal = useUIStore((state) => state.openProjectSetupModal);
  const theme = useUIStore((state) => state.theme);
  const [systemIsDark, setSystemIsDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => setSystemIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemIsDark);

  const slides = useMemo<readonly Slide[]>(() => [
    {
      title: '',
      body: 'A lightweight way to plan product timelines. Create a schedule for each team, see them all on one shared calendar, and ship with less friction.',
      illustration: <LogoMark isDark={isDark} />,
    },
    {
      title: 'Every team on one timeline',
      body: 'Add a schedule per team — everything lines up on the same dates. Pin the schedule that matters to keep it on top and extend its milestone lines through every schedule below.',
      illustration: <SchedulesIllustration />,
    },
    {
      title: 'Phases, tasks & milestones',
      body: 'Phases are the big blocks of work. Tasks break them down into finer detail. Milestones pin a single date — a review, a handoff, a deadline.',
      illustration: <ItemsIllustration />,
    },
    {
      title: 'Build your timeline in clicks',
      body: 'Double-click an empty row to drop in a phase, or a schedule header to add a milestone — right where you click. Right-click anywhere for the full menu.',
      illustration: <CreateIllustration />,
    },
    {
      title: 'Drag to move, pull edges to resize',
      body: 'Grab a bar to move it; pull its handles to resize. Tasks and milestones travel with their phase — hold Shift while resizing to keep them pinned in place.',
      illustration: <DragIllustration />,
    },
    {
      title: "You're ready to plan",
      body: 'Create a project to set your dates and first schedule. Everything else is a double-click away.',
      illustration: <LogoMark isDark={isDark} />,
    },
  ], [isDark]);

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
  }, [goNext, goBack, isLast, openProjectSetupModal]);

  const slide = slides[index];

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-surface)] px-6">
      <div
        className="glass-bordered rounded-xl w-full max-w-xl modal-enter relative"
        role="region"
        aria-label="Welcome walkthrough"
      >
        {!isLast && (
          <button
            type="button"
            onClick={openProjectSetupModal}
            className="absolute top-3 right-4 z-10 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors focus-ring rounded px-1.5 py-0.5"
          >
            Skip
          </button>
        )}

        <div className="px-10 pt-10 pb-7">
          <div key={index} className="walkthrough-slide-enter">
            <div className="h-40 mb-6 flex items-center justify-center">
              {slide.illustration}
            </div>
            {slide.title && (
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-3 text-center">
                {slide.title}
              </h2>
            )}
            <p className="text-sm text-[var(--color-text-muted)] text-center leading-relaxed max-w-md mx-auto min-h-[3.5rem]">
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

        <div className="px-8 py-4 border-t border-[var(--color-row-border-strong)] flex items-center justify-between">
          <div className="min-w-[72px]">
            {!isFirst && (
              <Button variant="ghost" onClick={goBack} aria-label="Previous slide">
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5" role="tablist" aria-label="Walkthrough progress">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-colors ${
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
    </div>
  );
}
