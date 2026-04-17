import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../common/Button';

interface Slide {
  readonly title: string;
  readonly body: string;
  readonly illustration: ReactNode;
}

function LogoMark({ isDark }: { readonly isDark: boolean }): ReactElement {
  const src = isDark ? '/FLOID_logo_dark.svg' : '/FLOID_logo.svg';
  return <img src={src} alt="FLOID" className="h-16" />;
}

function SchedulesIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 280 120" className="w-full h-full" aria-hidden="true">
      <rect x="10" y="18" width="260" height="22" rx="4" fill="var(--color-focus)" opacity="0.85" />
      <text x="18" y="33" fontSize="9" fill="white" fontWeight="700" letterSpacing="0.5">MASTER</text>
      <rect x="30" y="54" width="210" height="18" rx="4" fill="var(--color-text-muted)" opacity="0.35" />
      <text x="38" y="67" fontSize="8" fill="var(--color-text-primary)" opacity="0.7">Design</text>
      <rect x="50" y="82" width="170" height="18" rx="4" fill="var(--color-text-muted)" opacity="0.35" />
      <text x="58" y="95" fontSize="8" fill="var(--color-text-primary)" opacity="0.7">Engineering</text>
    </svg>
  );
}

function ItemsIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 280 120" className="w-full h-full" aria-hidden="true">
      <rect x="20" y="24" width="230" height="26" rx="4" fill="var(--color-focus)" opacity="0.85" />
      <text x="30" y="41" fontSize="10" fill="white" fontWeight="700">PHASE</text>
      <rect x="40" y="62" width="80" height="16" rx="3" fill="var(--color-text-primary)" opacity="0.55" />
      <rect x="140" y="62" width="90" height="16" rx="3" fill="var(--color-text-primary)" opacity="0.55" />
      <text x="48" y="74" fontSize="8" fill="var(--color-background)" fontWeight="600">TASK</text>
      <text x="148" y="74" fontSize="8" fill="var(--color-background)" fontWeight="600">TASK</text>
      <g transform="translate(180,96)">
        <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="var(--color-focus)" />
      </g>
      <text x="194" y="100" fontSize="9" fill="var(--color-text-muted)">Milestone</text>
    </svg>
  );
}

function CreateIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 280 120" className="w-full h-full" aria-hidden="true">
      <rect x="20" y="30" width="240" height="26" rx="4" fill="var(--color-text-muted)" opacity="0.18" strokeDasharray="4 3" stroke="var(--color-text-muted)" strokeOpacity="0.5" />
      <g transform="translate(130, 43)">
        <circle r="10" fill="var(--color-focus)" opacity="0.2" />
        <circle r="5" fill="var(--color-focus)" />
      </g>
      <text x="24" y="76" fontSize="10" fill="var(--color-text-primary)" fontWeight="600">Double-click</text>
      <text x="24" y="90" fontSize="9" fill="var(--color-text-muted)">to add a phase</text>
      <text x="160" y="76" fontSize="10" fill="var(--color-text-primary)" fontWeight="600">Right-click</text>
      <text x="160" y="90" fontSize="9" fill="var(--color-text-muted)">for the full menu</text>
    </svg>
  );
}

function DragIllustration(): ReactElement {
  return (
    <svg viewBox="0 0 280 120" className="w-full h-full" aria-hidden="true">
      <rect x="50" y="32" width="160" height="24" rx="4" fill="var(--color-focus)" opacity="0.85" />
      <rect x="48" y="30" width="4" height="28" rx="1" fill="var(--color-text-primary)" />
      <rect x="208" y="30" width="4" height="28" rx="1" fill="var(--color-text-primary)" />
      <rect x="70" y="66" width="50" height="14" rx="3" fill="var(--color-text-primary)" opacity="0.55" />
      <rect x="140" y="66" width="60" height="14" rx="3" fill="var(--color-text-primary)" opacity="0.55" />
      <path d="M28 44 L44 44 M28 44 L34 39 M28 44 L34 49" stroke="var(--color-text-muted)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M232 44 L216 44 M232 44 L226 39 M232 44 L226 49" stroke="var(--color-text-muted)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <text x="100" y="108" fontSize="9" fill="var(--color-text-muted)">Children move with the phase</text>
    </svg>
  );
}

const LAST_INDEX = 4;

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
      body: 'A lightweight way to plan product timelines. Create schedules for each team, align them to a master, and ship with less friction.',
      illustration: <LogoMark isDark={isDark} />,
    },
    {
      title: 'Schedules & the Master Schedule',
      body: 'Each schedule is a timeline for a team or workstream. Pick one Master Schedule to drive your project dates — other schedules can lock to it to stay in sync, or run independently.',
      illustration: <SchedulesIllustration />,
    },
    {
      title: 'Phases, Tasks & Milestones',
      body: 'Phases are the main building blocks. Tasks live inside phases for finer detail. Milestones mark key dates at a single point in time.',
      illustration: <ItemsIllustration />,
    },
    {
      title: 'Adding items',
      body: 'Double-click an empty row to drop in a phase. Right-click anywhere on a schedule for the full menu — add phases, tasks, milestones, or change colors.',
      illustration: <CreateIllustration />,
    },
    {
      title: 'Drag to move, drag edges to resize',
      body: 'Drag a phase to reposition it; drag its edges to resize. Tasks and milestones inside the phase move along with it. Hold Shift while dragging to keep children in place.',
      illustration: <DragIllustration />,
    },
  ], [isDark]);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, LAST_INDEX));
  }, []);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goBack]);

  const slide = slides[index];
  const isLast = index === LAST_INDEX;
  const isFirst = index === 0;

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-surface)] px-6">
      <div
        className="glass-bordered rounded-xl w-full max-w-xl modal-enter"
        role="region"
        aria-label="Welcome walkthrough"
      >
        <div className="px-10 pt-10 pb-7">
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
            {isLast ? (
              <Button variant="primary" onClick={openProjectSetupModal}>
                Create Project
              </Button>
            ) : (
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
