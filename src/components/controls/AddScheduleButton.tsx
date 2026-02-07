import { useUIStore } from '../../stores/uiStore';

export function AddScheduleButton(): JSX.Element {
  const openAddScheduleModal = useUIStore((state) => state.openAddScheduleModal);

  const handleAddSchedule = (): void => {
    openAddScheduleModal();
  };

  return (
    <button
      onClick={handleAddSchedule}
      title="Add Schedule"
      className="w-5 h-5 flex items-center justify-center rounded-full border border-current text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
    >
      <svg
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
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
