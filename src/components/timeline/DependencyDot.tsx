import { useCallback } from 'react';
import type { DependencyAnchor } from '../../types/timeline';

interface DependencyDotProps {
  /** Which end of the item this dot stands for. */
  readonly anchor: DependencyAnchor;
  /** Connected dots stay printed — the period at the end of the bar. */
  readonly isConnected: boolean;
  /** Bars hold a dot outside each edge; a milestone keeps one beside its glyph. */
  readonly variant: 'bar' | 'milestone';
  readonly onStartDraw: (e: React.PointerEvent, anchor: DependencyAnchor) => void;
  readonly label: string;
}

/**
 * The terminal a dependency is drawn from.
 *
 * Hidden until its bar is hovered, like every affordance on this sheet — but a
 * dot with a line through it stays printed, so a quiet chart still shows where
 * its connections stand. Press and drag to another bar to draw a link; the
 * ends chosen are the type, so there is nothing else to ask.
 */
export function DependencyDot({
  anchor,
  isConnected,
  variant,
  onStartDraw,
  label,
}: DependencyDotProps): JSX.Element {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (e.button !== 0) return;
      // A press here is a gesture, never the start of a text selection
      e.preventDefault();
      e.stopPropagation();
      onStartDraw(e, anchor);
    },
    [onStartDraw, anchor]
  );

  // Clicks stop here: a press on the dot is about the link, never the bar
  const handleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
  }, []);

  const placement =
    variant === 'milestone'
      ? 'dep-dot--milestone'
      : anchor === 'start'
        ? 'dep-dot--start'
        : 'dep-dot--end';

  return (
    <div
      className={`dep-dot ${placement}`}
      data-connected={isConnected ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      role="button"
      tabIndex={-1}
      aria-label={label}
    />
  );
}
