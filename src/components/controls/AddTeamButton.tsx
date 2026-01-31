import { useTeamStore } from '../../stores/teamStore';

export default function AddTeamButton(): JSX.Element {
  const addTeam = useTeamStore((state) => state.addTeam);

  const handleAddTeam = (): void => {
    addTeam('');
  };

  return (
    <button
      onClick={handleAddTeam}
      className="flex items-center gap-2 px-3 py-2 text-sm text-[#6b7280] hover:text-[#111827] hover:bg-[#fafafa] rounded-md transition-colors duration-150"
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
