interface EmptyStateHintProps {
  readonly text: string;
  readonly height: number;
  readonly borderClass?: string;
}

export function EmptyStateHint({
  text,
  height,
  borderClass = 'border-b',
}: EmptyStateHintProps): JSX.Element {
  // Uses sticky positioning to stay centered in the visible viewport area.
  // The outer div takes full timeline width, while the inner sticky div
  // stays pinned to the visible area as the timeline scrolls.
  // Border at bottom shows this is a row.
  return (
    <div
      className={`relative w-full pointer-events-none ${borderClass}`}
      style={{ height, borderColor: 'var(--color-row-border-light)' }}
    >
      <div
        className="sticky left-0 right-0 h-full flex items-center justify-center pointer-events-none"
        style={{
          // Use viewport width minus approximate label column and some padding
          // This keeps the text roughly centered in the visible timeline area
          width: 'min(100%, calc(100vw - 250px))',
        }}
      >
        <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap select-none opacity-60">
          {text}
        </span>
      </div>
    </div>
  );
}
