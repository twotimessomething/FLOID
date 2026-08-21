import { Timeline } from '../timeline/Timeline';

export function TimelineContainer(): JSX.Element {
  return (
    <div className="flex-1 min-w-0 h-full bg-[var(--color-background)]">
      <Timeline />
    </div>
  );
}
