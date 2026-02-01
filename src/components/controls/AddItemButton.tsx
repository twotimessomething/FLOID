interface AddItemButtonProps {
  readonly onClick: () => void;
  readonly label?: string;
  readonly size?: 'sm' | 'md';
}

export default function AddItemButton({
  onClick,
  label,
  size = 'sm',
}: AddItemButtonProps): JSX.Element {
  const sizeClasses = size === 'sm'
    ? 'w-5 h-5 text-xs'
    : 'w-6 h-6 text-sm';

  const buttonLabel = label ?? 'Add item';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${sizeClasses} flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] add-btn focus-ring`}
      title={buttonLabel}
      aria-label={buttonLabel}
    >
      <svg
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4v16m8-8H4"
        />
      </svg>
    </button>
  );
}
