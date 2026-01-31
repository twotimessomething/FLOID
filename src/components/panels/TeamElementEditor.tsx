import { useCallback, useMemo } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, TextArea, DateInput, Button } from '../common';
import { getDateFromRelativePosition, getRelativePositionFromDate } from '../../utils/dateUtils';

interface TeamElementEditorProps {
  readonly teamElementId: string;
}

export function TeamElementEditor({ teamElementId }: TeamElementEditorProps): JSX.Element {
  const { teams, updateTeamElement, updateTeamElementPosition, deleteTeamElement } = useTeamStore();
  const { project } = useProjectStore();
  const { closeSidebar } = useUIStore();

  // Find element, its parent phase, and team
  const { element, teamPhase, team } = useMemo(() => {
    for (const t of teams) {
      for (const phase of t.phases) {
        const el = phase.elements.find((e) => e.id === teamElementId);
        if (el) {
          return { element: el, teamPhase: phase, team: t };
        }
      }
    }
    return { element: null, teamPhase: null, team: null };
  }, [teams, teamElementId]);

  // Calculate absolute dates for the element
  const { startDate, endDate, phaseStartDate, phaseEndDate } = useMemo(() => {
    if (!element || !teamPhase) {
      return {
        startDate: new Date(),
        endDate: new Date(),
        phaseStartDate: new Date(),
        phaseEndDate: new Date(),
      };
    }

    // Get phase dates
    const pStart = getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      teamPhase.relativeStart
    );
    const pEnd = getDateFromRelativePosition(
      project.startDate,
      project.endDate,
      teamPhase.relativeEnd
    );

    // Get element dates (relative to phase)
    const eStart = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      element.relativeStart
    );
    const eEnd = getDateFromRelativePosition(
      pStart.toISOString(),
      pEnd.toISOString(),
      element.relativeEnd
    );

    return {
      startDate: eStart,
      endDate: eEnd,
      phaseStartDate: pStart,
      phaseEndDate: pEnd,
    };
  }, [element, teamPhase, project.startDate, project.endDate]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!team || !teamPhase) return;
      updateTeamElement(team.id, teamPhase.id, teamElementId, { name: e.target.value });
    },
    [team, teamPhase, teamElementId, updateTeamElement]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!team || !teamPhase) return;
      updateTeamElement(team.id, teamPhase.id, teamElementId, { description: e.target.value });
    },
    [team, teamPhase, teamElementId, updateTeamElement]
  );

  const handleStartDateChange = useCallback(
    (date: Date) => {
      if (!team || !teamPhase || !element) return;
      const newRelativeStart = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedStart = Math.max(0, Math.min(newRelativeStart, element.relativeEnd - 0.01));
      updateTeamElementPosition(team.id, teamPhase.id, teamElementId, clampedStart, element.relativeEnd);
    },
    [team, teamPhase, element, teamElementId, phaseStartDate, phaseEndDate, updateTeamElementPosition]
  );

  const handleEndDateChange = useCallback(
    (date: Date) => {
      if (!team || !teamPhase || !element) return;
      const newRelativeEnd = getRelativePositionFromDate(
        phaseStartDate.toISOString(),
        phaseEndDate.toISOString(),
        date
      );
      // Clamp to valid range
      const clampedEnd = Math.min(1, Math.max(newRelativeEnd, element.relativeStart + 0.01));
      updateTeamElementPosition(team.id, teamPhase.id, teamElementId, element.relativeStart, clampedEnd);
    },
    [team, teamPhase, element, teamElementId, phaseStartDate, phaseEndDate, updateTeamElementPosition]
  );

  const handleDelete = useCallback(() => {
    if (!team || !teamPhase || !element) return;
    if (confirm(`Delete element "${element.name}"?`)) {
      deleteTeamElement(team.id, teamPhase.id, teamElementId);
      closeSidebar();
    }
  }, [team, teamPhase, element, teamElementId, deleteTeamElement, closeSidebar]);

  if (!element || !teamPhase || !team) {
    return <div className="text-sm text-gray-500">Element not found</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-gray-500">
        Part of{' '}
        <span className="font-medium text-gray-700">{teamPhase.name}</span>
        {' in '}
        <span className="font-medium text-gray-700">{team.name}</span>
      </div>

      <Input
        label="Name"
        value={element.name}
        onChange={handleNameChange}
      />

      <TextArea
        label="Description"
        value={element.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      <div className="grid grid-cols-2 gap-3">
        <DateInput
          label="Start Date"
          value={startDate}
          onChange={handleStartDateChange}
          min={phaseStartDate}
          max={endDate}
        />
        <DateInput
          label="End Date"
          value={endDate}
          onChange={handleEndDateChange}
          min={startDate}
          max={phaseEndDate}
        />
      </div>

      <div className="pt-4 border-t border-gray-200">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Element
        </Button>
      </div>
    </div>
  );
}
