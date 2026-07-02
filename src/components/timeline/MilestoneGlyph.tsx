interface MilestoneGlyphProps {
  readonly isSelected: boolean;
}

/**
 * Diamond marker with its short vertical tick. Shared by MilestoneMarker
 * and StickyMilestones so the two renderings never drift apart.
 * Parent must be positioned and carry the `group` class for hover scaling.
 */
export function MilestoneGlyph({ isSelected }: MilestoneGlyphProps): JSX.Element {
  return (
    <>
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ${
          isSelected ? 'scale-125' : 'group-hover:scale-110'
        }`}
        aria-hidden="true"
      >
        <div
          className={`w-3 h-3 rotate-45 ${
            isSelected
              ? 'bg-[var(--color-focus)] ring-2 ring-[var(--color-focus)]/40'
              : 'bg-[var(--color-text-primary)]'
          }`}
        />
      </div>
      <div
        className={`absolute top-1/2 left-0 -translate-x-1/2 w-0.5 h-3 ${
          isSelected ? 'bg-[var(--color-focus)]' : 'bg-[var(--color-text-primary)]'
        }`}
        aria-hidden="true"
      />
    </>
  );
}
