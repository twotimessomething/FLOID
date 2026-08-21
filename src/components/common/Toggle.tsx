interface ToggleProps {
  readonly id: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function Toggle({ id, checked, onChange }: ToggleProps): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent btn-press focus-ring ${
        checked ? 'bg-[var(--color-toggle-on)]' : 'bg-[var(--color-toggle-off)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[var(--color-toggle-knob)] shadow-[var(--shadow-sm)] transition-transform duration-fast ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
