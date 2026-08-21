import { useLayoutEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { paintPlayhead, type PlayheadHandle } from '../../hooks/usePlayhead';

interface PlayheadProps {
  readonly height: number;
  readonly handle: PlayheadHandle;
}

/**
 * The rule the date axis drops through every schedule.
 *
 * Only its presence is state — a hairline is either up or it is not. Where it
 * stands is written straight to the element by `usePlayhead`, including on the
 * frame it appears, which is what the layout effect below is for. Its date is
 * printed on the axis itself, in `TimelineHeader`, so it stays legible however
 * far the schedules have been scrolled.
 */
export function Playhead({ height, handle }: PlayheadProps): JSX.Element | null {
  const isActive = useUIStore((state) => state.playheadPosition !== null);

  useLayoutEffect(() => {
    if (isActive) paintPlayhead(handle);
  }, [isActive, handle]);

  if (!isActive) return null;

  return (
    <div
      ref={handle.lineRef}
      className="absolute top-0 left-0 z-40 w-px bg-[var(--color-accent)] pointer-events-none"
      style={{ height, willChange: 'transform' }}
      aria-hidden="true"
    />
  );
}
