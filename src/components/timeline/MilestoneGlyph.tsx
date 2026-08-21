interface MilestoneGlyphProps {
  readonly isSelected: boolean;
}

/**
 * Small diamond marker — a printed tick, not a UI badge. Shared by
 * MilestoneMarker and StickyMilestones so the two renderings never drift
 * apart. Parent must be positioned and carry the `group` class for hover.
 */
export function MilestoneGlyph({ isSelected }: MilestoneGlyphProps): JSX.Element {
  return (
    <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
      <div
        className={`w-2 h-2 rotate-45 transition-opacity duration-150 group-hover:opacity-80 ${
          isSelected ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-primary)]'
        }`}
      />
    </div>
  );
}
