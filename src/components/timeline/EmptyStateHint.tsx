interface EmptyStateHintProps {
  readonly text: string;
  readonly height: number;
  readonly borderClass?: string;
}

/**
 * Quiet hint that an empty row can host a create gesture. Invisible until the
 * ancestor `.group` row is hovered — an empty project should look empty, not
 * instructional. `borderClass` is accepted for API compatibility but no
 * longer renders a visible border; row separation is whitespace only.
 */
export function EmptyStateHint({ text, height }: EmptyStateHintProps): JSX.Element {
  // Uses sticky positioning to stay centered in the visible viewport area.
  // The outer div takes full timeline width, while the inner sticky div
  // stays pinned to the visible area as the timeline scrolls.
  return (
    <div className="relative w-full pointer-events-none" style={{ height }}>
      <div
        className="sticky left-0 right-0 h-full flex items-center justify-center pointer-events-none row-affordance"
        style={{
          // Use viewport width minus approximate label column and some padding
          // This keeps the text roughly centered in the visible timeline area
          width: 'min(100%, calc(100vw - 250px))',
        }}
      >
        <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap select-none">
          {text}
        </span>
      </div>
    </div>
  );
}
