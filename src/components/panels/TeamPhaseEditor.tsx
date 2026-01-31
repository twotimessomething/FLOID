import { useCallback, useMemo } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

interface TeamPhaseEditorProps {
  readonly teamPhaseId: string;
}

export function TeamPhaseEditor({ teamPhaseId }: TeamPhaseEditorProps): JSX.Element {
  const { teams, updateTeamPhase, updateTeamPhasePosition, deleteTeamPhase } = useTeamStore();
  const { project } = useProjectStore();
  const { closeModal } = useUIStore();

  // Find team phase and its parent team
  const { teamPhase, team } = useMemo(() => {
    for (const t of teams) {
      const phase = t.phases.find((p) => p.id === teamPhaseId);
      if (phase) {
        return { teamPhase: phase, team: t };
      }
    }
    return { teamPhase: null, team: null };
  }, [teams, teamPhaseId]);

  const startDate = useMemo(() => {
    if (!teamPhase) return new Date();
    return getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      teamPhase.relativeStart
    );
  }, [teamPhase, project.startDate, project.endDate]);

  const endDate = useMemo(() => {
    if (!teamPhase) return new Date();
    return getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      teamPhase.relativeEnd
    );
  }, [teamPhase, project.startDate, project.endDate]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!team) return;
      updateTeamPhase(team.id, teamPhaseId, { name: e.target.value });
    },
    [team, teamPhaseId, updateTeamPhase]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!team) return;
      updateTeamPhase(team.id, teamPhaseId, { description: e.target.value });
    },
    [team, teamPhaseId, updateTeamPhase]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!team || !teamPhase) return;
      const newRelativeStart = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        date
      );
      // Ensure start doesn't go past end
      if (newRelativeStart < teamPhase.relativeEnd) {
        updateTeamPhasePosition(team.id, teamPhaseId, newRelativeStart, teamPhase.relativeEnd);
      }
    },
    [team, teamPhase, teamPhaseId, project.startDate, project.endDate, updateTeamPhasePosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!team || !teamPhase) return;
      const newRelativeEnd = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        date
      );
      // Ensure end doesn't go before start
      if (newRelativeEnd > teamPhase.relativeStart) {
        updateTeamPhasePosition(team.id, teamPhaseId, teamPhase.relativeStart, newRelativeEnd);
      }
    },
    [team, teamPhase, teamPhaseId, project.startDate, project.endDate, updateTeamPhasePosition]
  );

  const handleDelete = useCallback(() => {
    if (!team || !teamPhase) return;
    if (confirm(`Delete phase "${teamPhase.name}"? This will also delete all elements within it.`)) {
      deleteTeamPhase(team.id, teamPhaseId);
      closeModal();
    }
  }, [team, teamPhase, teamPhaseId, deleteTeamPhase, closeModal]);

  if (!teamPhase || !team) {
    return <div className="text-sm text-[#6b7280]">Team phase not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[#6b7280]">
        Part of <span className="font-medium text-[#111827]">{team.name}</span>
      </div>

      <Input
        label="Name"
        value={teamPhase.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Phase name"
      />

      <TextArea
        label="Description"
        value={teamPhase.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      <div className="grid grid-cols-2 gap-3">
        <DateInput
          label="Start Date"
          value={startDate}
          onChange={handleStartDateChange}
          min={project.startDate}
          max={endDate}
        />
        <DateInput
          label="End Date"
          value={endDate}
          onChange={handleEndDateChange}
          min={startDate}
          max={project.endDate}
        />
      </div>

      <div className="pt-4 border-t border-[#e5e7eb]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Phase
        </Button>
      </div>
    </div>
  );
}
