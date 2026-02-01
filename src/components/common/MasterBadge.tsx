interface MasterBadgeProps {
  readonly size?: 'sm' | 'md';
}

export function MasterBadge({ size = 'sm' }: MasterBadgeProps): JSX.Element {
  const iconSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <span
      className="inline-flex items-center text-amber-500"
      title="Pinned as master schedule"
    >
      {/* Pin icon */}
      <svg
        className={`${iconSize} rotate-45`}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
      </svg>
    </span>
  );
}
