import { useMemo, useRef, type ReactElement } from 'react';
import { CollapsedBars } from '../../timeline/CollapsedBars';
import { SCHEDULE_TEMPLATES, createSectionFromTemplate } from '../../../data/scheduleTemplates';
import { ROW_HEIGHT } from '../../../utils/timelineUtils';
import { dayKeyDiff, fromDayKey, toDayKey } from '../../../utils/dayKeys';
import type { ViewportBounds } from '../../../types';
import { useMeasuredWidth } from './useMeasuredWidth';
import { WalkthroughFrame } from './WalkthroughFrame';

/**
 * Blank leads, because it is what most people want and because it is the one
 * option whose preview is the absence of a preview — seeing an empty sheet is
 * how you learn what "blank" buys you. The rest keep the order they are
 * declared in.
 */
const CHOICES = [
  ...SCHEDULE_TEMPLATES.filter((t) => t.id === 'blank'),
  ...SCHEDULE_TEMPLATES.filter((t) => t.id !== 'blank'),
];

interface TemplateAskProps {
  readonly templateId: string;
  readonly onTemplateChange: (templateId: string) => void;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly onStart: () => void;
  readonly isStarting: boolean;
  readonly onBack: () => void;
}

/**
 * The second and last thing the product has to be told, and the only one that
 * changes what lands on the paper.
 *
 * The old version of this screen was six rows of prose — "Hardware engineering
 * with EVT/DVT/PVT validation phases" — asking someone to picture a schedule
 * from a sentence. So it shows the schedule instead: picking a template builds
 * the real Section the real factory would build, on the real dates chosen one
 * screen ago, and folds it onto the sheet with the app's own `CollapsedBars`.
 * The names and the colours are not written here; they are read off the thing
 * that is about to be created.
 *
 * A folded schedule is the shape of the work rather than the work itself,
 * which is exactly the question being asked. Blank draws an empty row, which
 * is the truest preview on the screen.
 */
export function TemplateAsk({
  templateId,
  onTemplateChange,
  startDate,
  endDate,
  onStart,
  isStarting,
  onBack,
}: TemplateAskProps): ReactElement {
  const plotRef = useRef<HTMLDivElement>(null);
  const plotWidth = useMeasuredWidth(plotRef);

  const viewport = useMemo<ViewportBounds>(() => {
    const startKey = toDayKey(startDate);
    const endKey = toDayKey(endDate);
    return {
      startDate: fromDayKey(startKey),
      endDate: fromDayKey(endKey),
      startKey,
      endKey,
      totalDays: Math.max(dayKeyDiff(startKey, endKey), 1),
    };
  }, [startDate, endDate]);

  const preview = useMemo(() => {
    const template = CHOICES.find((t) => t.id === templateId);
    if (!template) return null;
    const section = createSectionFromTemplate(template, 0, {
      dateRange: { startDate: viewport.startKey, endDate: viewport.endKey },
    });
    return { ...section, isCollapsed: true };
  }, [templateId, viewport]);

  return (
    <WalkthroughFrame
      line="What are you planning?"
      onContinue={isStarting ? undefined : onStart}
      continueLabel="Start"
      onBack={onBack}
    >
      <div className="w-full flex flex-col items-center gap-8">
        <div className="flex flex-wrap items-center justify-center gap-2 px-6" role="radiogroup" aria-label="Starting schedule">
          {CHOICES.map((template) => {
            const isSelected = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onTemplateChange(template.id)}
                className={`focus-ring btn-press rounded-[var(--radius-sm)] px-3 py-1.5 text-body transition-colors duration-fast ${
                  isSelected
                    ? 'text-[var(--color-text-primary)] shadow-[inset_0_0_0_1.5px_var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                }`}
              >
                {template.name}
              </button>
            );
          })}
        </div>

        {/* The consequence of the choice, on the sheet it will land on.

            The label column is left empty on purpose. A schedule takes its name
            from the template, so printing it here only says back what the
            pressed pill already says — and it said it loudest under Blank,
            where the name was the sole thing on an otherwise empty preview. The
            column and its hairline stay, because they are the sheet's left
            edge: without them an empty preview reads as nothing rendered
            rather than as an empty schedule, which is the honest answer to
            choosing Blank. No month header either — the window was settled one
            screen ago, and twelve month labels over a preview is furniture. */}
        <div className="w-full flex select-none" aria-hidden="true">
          <div
            className="flex-shrink-0 border-r border-[var(--color-hairline)]"
            style={{ width: 168, height: ROW_HEIGHT }}
          />
          <div ref={plotRef} className="relative timeline-plot flex-1 min-w-0" style={{ height: ROW_HEIGHT }}>
            {preview && plotWidth > 0 && (
              <div key={templateId} className="walkthrough-appear absolute inset-0">
                <CollapsedBars
                  section={preview}
                  viewport={viewport}
                  pixelsPerDay={plotWidth / viewport.totalDays}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </WalkthroughFrame>
  );
}
