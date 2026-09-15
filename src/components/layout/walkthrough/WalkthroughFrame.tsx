import { useEffect, type ReactElement, type ReactNode } from 'react';

interface WalkthroughFrameProps {
  /**
   * The one imperative line. It is the headline — there is no kicker above it
   * and no paragraph under it — and it is rewritten as the step progresses, so
   * the person is never told about a state they are not in yet.
   */
  readonly line: string;
  /** The live control, alone in the middle. */
  readonly children: ReactNode;
  /** The way on. Absent until the step is done. */
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
  /** The quiet way back, under the button. Only where there is something to fix. */
  readonly onBack?: () => void;
}

/**
 * One teaching screen: a line, a live control, a way on.
 *
 * The geometry is the discipline. The head, the foot and the foot's second row
 * all have their room spent from the first frame — the head by a minimum
 * height, the other two by placeholders of their own size — so the control
 * never moves when the line rewrites itself or when the button arrives. A
 * control that shifts because a sentence got longer is what "clunky" means.
 *
 * The line is keyed so a rewrite cross-fades rather than swapping mid-word;
 * that fade is a beat of its own, and it is the only thing that happens when
 * the line changes. The button, when it arrives, arrives after it.
 */
export function WalkthroughFrame({
  line,
  children,
  onContinue,
  continueLabel = 'Continue',
  onBack,
}: WalkthroughFrameProps): ReactElement {
  // Enter takes the way on wherever there is one. Fields and buttons keep
  // their own Enter — a form submits itself, and a pressed button is a click.
  useEffect(() => {
    if (!onContinue) return;
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a')) return;
      onContinue();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onContinue]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-8">
      <div className="min-h-[3.25rem] flex items-start justify-center px-6">
        <h2
          key={line}
          className="walkthrough-line text-display font-medium text-[var(--color-text-primary)] text-center text-balance"
          aria-live="polite"
        >
          {line}
        </h2>
      </div>

      <div className="w-full flex items-center justify-center">{children}</div>

      {/* The foot's height is spent whether or not anything is in it, so the
          button only ever fades in and the sheet above never shifts. */}
      <div className="h-16 flex items-center justify-center">
        {onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="walkthrough-arrive focus-ring btn-press rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] text-[var(--color-background)] px-5 py-2 text-body font-medium hover:opacity-90 active:opacity-80"
          >
            {continueLabel}
          </button>
        )}
      </div>

      <div className="h-7 flex items-start justify-center">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="focus-ring rounded-[var(--radius-sm)] px-2 py-0.5 text-meta text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-fast"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
