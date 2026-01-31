import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTeamStore } from '../../stores/teamStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

interface MilestoneEditorProps {
  readonly milestoneId: string;
}

export function MilestoneEditor({ milestoneId }: MilestoneEditorProps): JSX.Element {
  const { milestones, updateMilestone: updateIDMilestone, deleteMilestone: deleteIDMilestone } = useTimelineStore();
  const { teams, updateTeamMilestone, deleteTeamMilestone } = useTeamStore();
  const { project } = useProjectStore();
  const { closeModal } = useUIStore();

  // Find milestone - check ID timeline first, then teams
  const { milestone, source, teamId } = useMemo(() => {
    // Check ID timeline milestones first
    const idMilestone = milestones.find((m) => m.id === milestoneId);
    if (idMilestone) {
      return { milestone: idMilestone, source: 'id' as const, teamId: null };
    }

    // Check teams
    for (const team of teams) {
      const teamMilestone = team.milestones.find((m) => m.id === milestoneId);
      if (teamMilestone) {
        return { milestone: teamMilestone, source: 'team' as const, teamId: team.id };
      }
    }

    return { milestone: null, source: null, teamId: null };
  }, [milestones, teams, milestoneId]);

  // Calculate milestone date using project dates (since milestones are now project-relative)
  const date = useMemo(() => {
    if (!milestone) {
      return new Date();
    }

    return getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      milestone.relativePosition
    );
  }, [milestone, project.startDate, project.endDate]);

  const projectStartDate = useMemo(() => new Date(project.startDate), [project.startDate]);
  const projectEndDate = useMemo(() => new Date(project.endDate), [project.endDate]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!milestone || !source) return;
      if (source === 'id') {
        updateIDMilestone(milestoneId, { name: e.target.value });
      } else if (teamId) {
        updateTeamMilestone(teamId, milestoneId, { name: e.target.value });
      }
    },
    [milestone, source, milestoneId, teamId, updateIDMilestone, updateTeamMilestone]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!milestone || !source) return;
      if (source === 'id') {
        updateIDMilestone(milestoneId, { description: e.target.value });
      } else if (teamId) {
        updateTeamMilestone(teamId, milestoneId, { description: e.target.value });
      }
    },
    [milestone, source, milestoneId, teamId, updateIDMilestone, updateTeamMilestone]
  );

  const handleDateChange = useCallback(
    (newDate: Date) => {
      if (!milestone || !source) return;
      const newRelativePosition = getRelativePositionFromDate(
        project.startDate,
        project.endDate,
        newDate
      );
      // Clamp to 0-1
      const clampedPosition = Math.max(0, Math.min(1, newRelativePosition));
      if (source === 'id') {
        updateIDMilestone(milestoneId, { relativePosition: clampedPosition });
      } else if (teamId) {
        updateTeamMilestone(teamId, milestoneId, { relativePosition: clampedPosition });
      }
    },
    [milestone, source, milestoneId, teamId, project.startDate, project.endDate, updateIDMilestone, updateTeamMilestone]
  );

  const handleDelete = useCallback(() => {
    if (!milestone || !source) return;
    if (confirm(`Delete milestone "${milestone.name}"?`)) {
      if (source === 'id') {
        deleteIDMilestone(milestoneId);
      } else if (teamId) {
        deleteTeamMilestone(teamId, milestoneId);
      }
      closeModal();
    }
  }, [milestone, source, milestoneId, teamId, deleteIDMilestone, deleteTeamMilestone, closeModal]);

  if (!milestone) {
    return <div className="text-sm text-[#6b7280]">Milestone not found</div>;
  }

  // Determine context label
  const contextLabel = source === 'id'
    ? 'Industrial Design'
    : teams.find((t) => t.id === teamId)?.name || 'Team';

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[#6b7280]">
        Milestone in <span className="font-medium text-[#111827]">{contextLabel}</span>
      </div>

      <Input
        label="Name"
        value={milestone.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Milestone name"
      />

      <TextArea
        label="Description"
        value={milestone.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      <DateInput
        label="Date"
        value={date}
        onChange={handleDateChange}
        min={projectStartDate}
        max={projectEndDate}
      />

      <div className="pt-4 border-t border-[#e5e7eb]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Milestone
        </Button>
      </div>
    </div>
  );
}
