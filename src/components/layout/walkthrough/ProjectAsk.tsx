import { useCallback, useState, type ReactElement } from 'react';
import { format } from 'date-fns';
import { DateInput } from '../../common/DateInput';
import { isImeComposing } from '../../../utils/keyboard';
import { WalkthroughFrame } from './WalkthroughFrame';

interface ProjectAskProps {
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly onStartDateChange: (date: Date) => void;
  readonly onEndDateChange: (date: Date) => void;
  readonly onDone: () => void;
}

/**
 * The first of the two things the product has to be told.
 *
 * It takes the same shape as the lessons — one line, one control, one way on —
 * and it borrows the paywall's trick for the second fact: the big thing on the
 * screen is the name, and the window is the small thing, one quiet sentence
 * that is itself the control. Anyone who does not care about dates reads a
 * sentence and moves on; anyone who does taps it and gets the two real inputs.
 *
 * The way on is here from the first frame rather than arriving when the step
 * is done, and that is deliberate: both answers already have real defaults —
 * the project is happy to be called "New Project" — so holding the button back
 * until something is typed would be a form pretending to be a lesson. The
 * lessons keep the rule, because there a bar really does have to be drawn.
 *
 * The stage's height is spent for the open state, so revealing the dates pushes
 * nothing: the name never moves.
 */
export function ProjectAsk({
  name,
  onNameChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onDone,
}: ProjectAskProps): ReactElement {
  const [isWindowOpen, setIsWindowOpen] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault();
      onDone();
    },
    [onDone]
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => onNameChange(e.target.value),
    [onNameChange]
  );

  const openWindow = useCallback((): void => setIsWindowOpen(true), []);

  // A form with one text input submits on Enter; one with three does not, and
  // opening the dates adds two. So the name takes Enter itself — unless it is
  // the Return that confirms an input method's candidate mid-name.
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter' && !isImeComposing(e)) {
        e.preventDefault();
        onDone();
      }
    },
    [onDone]
  );

  return (
    <WalkthroughFrame line="Name it." onContinue={onDone}>
      <form onSubmit={handleSubmit} className="w-full max-w-md h-40 flex flex-col items-center">
        <input
          value={name}
          onChange={handleNameChange}
          onKeyDown={handleNameKeyDown}
          placeholder="New Project"
          aria-label="Project name"
          autoFocus
          className="w-full bg-transparent text-display font-medium text-center text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] placeholder:font-normal border-0 border-b border-[var(--color-border)] pb-2 focus:outline-none focus:border-[var(--color-text-primary)] transition-colors duration-fast"
        />

        <div className="mt-6 w-full flex justify-center">
          {isWindowOpen ? (
            <div className="grid grid-cols-2 gap-4 w-full walkthrough-appear">
              <DateInput label="Starts" value={startDate} onChange={onStartDateChange} />
              <DateInput
                label="Ends"
                value={endDate}
                onChange={onEndDateChange}
                min={startDate}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={openWindow}
              className="text-body text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-fast focus-ring rounded-[var(--radius-sm)] px-2 py-1"
            >
              Runs {format(startDate, 'MMM yyyy')} – {format(endDate, 'MMM yyyy')}
            </button>
          )}
        </div>
      </form>
    </WalkthroughFrame>
  );
}
