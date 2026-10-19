interface StatusErrorProps {
  readonly label: string;
  readonly title: string;
  readonly detail?: string;
}

/** A save that failed, said in red words in the header, with the detail beside it. */
export function StatusError({ label, title, detail }: StatusErrorProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-1.5 min-w-0 max-w-xs text-meta"
      role="alert"
      title={title}
    >
      <span
        className="block w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--color-error)]"
        aria-hidden="true"
      />
      <span className="flex-shrink-0 text-[var(--color-error)]">{label}</span>
      {detail && <span className="min-w-0 truncate text-[var(--color-text-muted)]">{detail}</span>}
    </div>
  );
}
