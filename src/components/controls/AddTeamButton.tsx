import { useUIStore } from '../../stores/uiStore';

export default function AddTeamButton(): JSX.Element {
  const openAddTeamModal = useUIStore((state) => state.openAddTeamModal);

  const handleAddTeam = (): void => {
    openAddTeamModal();
  };

  return (
    <button
      onClick={handleAddTeam}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#6b7280] hover:text-[#111827] glass-bordered rounded-md transition-colors duration-150"
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
      <span>Add Team</span>
    </button>
  );
}
