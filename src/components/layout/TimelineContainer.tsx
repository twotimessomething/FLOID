import { Timeline } from '../timeline/Timeline';

export function TimelineContainer() {
  return (
    <div className="flex-1 min-w-0 p-4 bg-[var(--color-background)]">
      <div className="h-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm">
        <Timeline />
      </div>
    </div>
  );
}
