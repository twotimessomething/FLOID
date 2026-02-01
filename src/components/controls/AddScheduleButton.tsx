import { useUIStore } from '../../stores/uiStore';

export default function AddScheduleButton(): JSX.Element {
  const openAddScheduleModal = useUIStore((state) => state.openAddScheduleModal);

  const handleAddSchedule = (): void => {
    openAddScheduleModal();
  };

  return (
    <button
      onClick={handleAddSchedule}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] glass-bordered rounded-md transition-colors duration-150"
    >
      <svg
        className="w-4 h-4"
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
      <span>Add Schedule</span>
    </button>
  );
}
