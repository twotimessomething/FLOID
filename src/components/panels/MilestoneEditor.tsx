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
  const { phases, updateMilestone: updatePhaseMilestone, deleteMilestone: deletePhaseMilestone } = useTimelineStore();
  const { teams } = useTeamStore();
  const { project } = useProjectStore();
  const { closeModal } = useUIStore();

  // Find milestone and its parent (could be phase or teamPhase)
  const { milestone, parent, parentType } = useMemo(() => {
    // Check ID phases first
    for (const phase of phases) {
      const m = phase.milestones.find((ms) => ms.id === milestoneId);
      if (m) {
        return { milestone: m, parent: phase, parentType: 'phase' as const };
      }
    }
    // Check teams
    for (const team of teams) {
      for (const teamPhase of team.phases) {
        const m = teamPhase.milestones.find((ms) => ms.id === milestoneId);
        if (m) {
          return { milestone: m, parent: teamPhase, parentType: 'teamPhase' as const };
        }
      }
    }
    return { milestone: null, parent: null, parentType: null };
  }, [phases, teams, milestoneId]);

  // Calculate milestone date
  const { date, parentStartDate, parentEndDate } = useMemo(() => {
    if (!milestone || !parent) {
      return {
        date: new Date(),
        parentStartDate: new Date(),
        parentEndDate: new Date(),
      };
    }

    // Get parent phase dates
    const pStart = getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      parent.relativeStart
    );
    const pEnd = getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      parent.relativeEnd
    );

    // Get milestone date (relative to parent)
    const mDate = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      milestone.relativePosition
    );

    return {
      date: mDate,
      parentStartDate: pStart,
      parentEndDate: pEnd,
    };
  }, [milestone, parent, project.startDate, project.endDate]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!parent || !parentType) return;
      if (parentType === 'phase') {
        updatePhaseMilestone(parent.id, milestoneId, { name: e.target.value });
      }
      // TODO: Add team milestone update when teamStore supports it
    },
    [parent, parentType, milestoneId, updatePhaseMilestone]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!parent || !parentType) return;
      if (parentType === 'phase') {
        updatePhaseMilestone(parent.id, milestoneId, { description: e.target.value });
      }
    },
    [parent, parentType, milestoneId, updatePhaseMilestone]
  );

  const handleDateChange = useCallback(
    (newDate: Date) => {
      if (!parent || !parentType) return;
      const newRelativePosition = getRelativePositionFromDate(
        parentStartDate.toISOString(),
        parentEndDate.toISOString(),
        newDate
      );
      // Clamp to 0-1
      const clampedPosition = Math.max(0, Math.min(1, newRelativePosition));
      if (parentType === 'phase') {
        updatePhaseMilestone(parent.id, milestoneId, { relativePosition: clampedPosition });
      }
    },
    [parent, parentType, milestoneId, parentStartDate, parentEndDate, updatePhaseMilestone]
  );

  const handleDelete = useCallback(() => {
    if (!parent || !parentType || !milestone) return;
    if (confirm(`Delete milestone "${milestone.name}"?`)) {
      if (parentType === 'phase') {
        deletePhaseMilestone(parent.id, milestoneId);
      }
      closeModal();
    }
  }, [parent, parentType, milestone, milestoneId, deletePhaseMilestone, closeModal]);

  if (!milestone || !parent) {
    return <div className="text-sm text-[#6b7280]">Milestone not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[#6b7280]">
        Milestone in <span className="font-medium text-[#111827]">{parent.name}</span>
      </div>

      <Input
        label="Name"
        value={milestone.name}
        onChange={handleNameChange}
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
        min={parentStartDate}
        max={parentEndDate}
      />

      <div className="pt-4 border-t border-[#e5e7eb]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Milestone
        </Button>
      </div>
    </div>
  );
}
