import { useCallback } from 'react';

interface AddItemButtonProps {
  readonly onClick: (e: React.MouseEvent) => void;
  readonly label: string;
}

export function AddItemButton({ onClick, label }: AddItemButtonProps): JSX.Element {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClick(e);
    },
    [onClick]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Prevent drag from starting when clicking the button
    e.stopPropagation();
  }, []);

  return (
    <button
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-70 pointer-events-auto z-30 focus-ring"
      style={{ right: -35, backgroundColor: 'var(--color-text-primary)', color: 'var(--color-background)' }}
      aria-label={label}
      title={label}
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
