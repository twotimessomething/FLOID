interface GhostTaskProps {
  readonly left: number;
}

/**
 * Faint preview of the task a click would drop while ⌥ is held: the same
 * ring the real checkbox prints, at the pointer's day, in the ink the row's
 * type uses. It says nothing — the cursor already says what a click will do.
 */
export function GhostTask({ left }: GhostTaskProps): JSX.Element {
  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-20"
      style={{ left }}
      aria-hidden="true"
    >
      <span className="task-check ghost-enter absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 opacity-40" />
    </div>
  );
}
