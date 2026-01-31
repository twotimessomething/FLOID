import { useTeamStore } from '../../stores/teamStore';

export default function AddTeamButton(): JSX.Element {
  const addTeam = useTeamStore((state) => state.addTeam);

  const handleAddTeam = (): void => {
    addTeam('New Team');
  };

  return (
    <button
      onClick={handleAddTeam}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
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
