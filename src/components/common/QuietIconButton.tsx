interface QuietIconButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

/**
 * The corner affordance. Muted until hovered, no chrome of its own — the
 * treatment shared by the shortcut, settings and about buttons that sit at the
 * foot of either sidebar.
 */
export function QuietIconButton({ label, onClick, children }: QuietIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-sm)] transition-colors duration-fast focus-ring"
      aria-label={label}
    >
      {children}
    </button>
  );
}
