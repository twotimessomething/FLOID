import { useCallback, useMemo } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, ColorPicker, Button } from '../common';

interface TeamEditorProps {
  readonly teamId: string;
}

export function TeamEditor({ teamId }: TeamEditorProps): JSX.Element {
  const { teams, updateTeam, deleteTeam } = useTeamStore();
  const { closeModal } = useUIStore();

  const team = useMemo(
    () => teams.find((t) => t.id === teamId),
    [teams, teamId]
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateTeam(teamId, { name: e.target.value });
    },
    [teamId, updateTeam]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      updateTeam(teamId, { color });
    },
    [teamId, updateTeam]
  );

  const handleDelete = useCallback(() => {
    if (confirm(`Delete team "${team?.name}"? This will also delete all phases and elements within it.`)) {
      deleteTeam(teamId);
      closeModal();
    }
  }, [team?.name, teamId, deleteTeam, closeModal]);

  if (!team) {
    return <div className="text-sm text-[#6b7280]">Team not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Team Name"
        value={team.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Team name"
      />

      <ColorPicker
        label="Color"
        value={team.color}
        onChange={handleColorChange}
      />

      <div className="pt-4 border-t border-[#e5e7eb]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Team
        </Button>
      </div>
    </div>
  );
}
