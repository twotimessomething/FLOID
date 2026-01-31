import { create } from 'zustand';
import type { Team, TeamPhase, TeamElement, Milestone } from '../types';
import { getTeamColor } from '../constants/colors';
import { useProjectStore } from './projectStore';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

interface TeamState {
  teams: Team[];

  // Team operations
  setTeams: (teams: Team[]) => void;
  loadTeamsForProject: (projectId: string) => void;
  addTeam: (name: string) => void;
  updateTeam: (teamId: string, updates: Partial<Team>) => void;
  deleteTeam: (teamId: string) => void;
  toggleTeamCollapse: (teamId: string) => void;
  reorderTeams: (fromIndex: number, toIndex: number) => void;

  // Team Phase operations
  addTeamPhase: (teamId: string, phase: Omit<TeamPhase, 'id' | 'teamId'>) => void;
  updateTeamPhase: (teamId: string, phaseId: string, updates: Partial<TeamPhase>) => void;
  deleteTeamPhase: (teamId: string, phaseId: string) => void;
  toggleTeamPhaseCollapse: (teamId: string, phaseId: string) => void;

  // Team Element operations
  addTeamElement: (teamId: string, phaseId: string, element: Omit<TeamElement, 'id' | 'teamPhaseId'>) => void;
  updateTeamElement: (teamId: string, phaseId: string, elementId: string, updates: Partial<TeamElement>) => void;
  deleteTeamElement: (teamId: string, phaseId: string, elementId: string) => void;

  // Team Milestone operations
  addTeamMilestone: (teamId: string, phaseId: string, milestone: Omit<Milestone, 'id' | 'parentId' | 'parentType'>) => void;
  updateTeamMilestone: (teamId: string, phaseId: string, milestoneId: string, updates: Partial<Milestone>) => void;
  deleteTeamMilestone: (teamId: string, phaseId: string, milestoneId: string) => void;

  // Position updates
  updateTeamPhasePosition: (teamId: string, phaseId: string, relativeStart: number, relativeEnd: number) => void;
  updateTeamElementPosition: (teamId: string, phaseId: string, elementId: string, relativeStart: number, relativeEnd: number) => void;
}

export const useTeamStore = create<TeamState>((set) => ({
  teams: [],

  setTeams: (teams) => set({ teams }),

  loadTeamsForProject: (projectId: string) => {
    const projectStore = useProjectStore.getState();
    const data = projectStore.loadProjectData(projectId);

    if (data) {
      set({ teams: data.teams });
    } else {
      set({ teams: [] });
    }
  },

  addTeam: (name) =>
    set((state) => ({
      teams: [
        ...state.teams,
        {
          id: generateId(),
          name,
          color: getTeamColor(state.teams.length),
          order: state.teams.length,
          isCollapsed: false,
          phases: [],
        },
      ],
    })),

  updateTeam: (teamId, updates) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId ? { ...team, ...updates } : team
      ),
    })),

  deleteTeam: (teamId) =>
    set((state) => ({
      teams: state.teams.filter((team) => team.id !== teamId),
    })),

  toggleTeamCollapse: (teamId) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId ? { ...team, isCollapsed: !team.isCollapsed } : team
      ),
    })),

  reorderTeams: (fromIndex, toIndex) =>
    set((state) => {
      const teams = [...state.teams];
      const [removed] = teams.splice(fromIndex, 1);
      teams.splice(toIndex, 0, removed);
      return {
        teams: teams.map((team, index) => ({ ...team, order: index })),
      };
    }),

  addTeamPhase: (teamId, phase) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: [
                ...team.phases,
                { ...phase, id: generateId(), teamId },
              ],
            }
          : team
      ),
    })),

  updateTeamPhase: (teamId, phaseId, updates) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId ? { ...phase, ...updates } : phase
              ),
            }
          : team
      ),
    })),

  deleteTeamPhase: (teamId, phaseId) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.filter((phase) => phase.id !== phaseId),
            }
          : team
      ),
    })),

  toggleTeamPhaseCollapse: (teamId, phaseId) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? { ...phase, isCollapsed: !phase.isCollapsed }
                  : phase
              ),
            }
          : team
      ),
    })),

  addTeamElement: (teamId, phaseId, element) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      elements: [
                        ...phase.elements,
                        { ...element, id: generateId(), teamPhaseId: phaseId },
                      ],
                    }
                  : phase
              ),
            }
          : team
      ),
    })),

  updateTeamElement: (teamId, phaseId, elementId, updates) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      elements: phase.elements.map((el) =>
                        el.id === elementId ? { ...el, ...updates } : el
                      ),
                    }
                  : phase
              ),
            }
          : team
      ),
    })),

  deleteTeamElement: (teamId, phaseId, elementId) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      elements: phase.elements.filter((el) => el.id !== elementId),
                    }
                  : phase
              ),
            }
          : team
      ),
    })),

  addTeamMilestone: (teamId, phaseId, milestone) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      milestones: [
                        ...phase.milestones,
                        { ...milestone, id: generateId(), parentId: phaseId, parentType: 'teamPhase' as const },
                      ],
                    }
                  : phase
              ),
            }
          : team
      ),
    })),

  updateTeamMilestone: (teamId, phaseId, milestoneId, updates) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      milestones: phase.milestones.map((m) =>
                        m.id === milestoneId ? { ...m, ...updates } : m
                      ),
                    }
                  : phase
              ),
            }
          : team
      ),
    })),

  deleteTeamMilestone: (teamId, phaseId, milestoneId) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      milestones: phase.milestones.filter((m) => m.id !== milestoneId),
                    }
                  : phase
              ),
            }
          : team
      ),
    })),

  updateTeamPhasePosition: (teamId, phaseId, relativeStart, relativeEnd) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? { ...phase, relativeStart, relativeEnd }
                  : phase
              ),
            }
          : team
      ),
    })),

  updateTeamElementPosition: (teamId, phaseId, elementId, relativeStart, relativeEnd) =>
    set((state) => ({
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              phases: team.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      elements: phase.elements.map((el) =>
                        el.id === elementId
                          ? { ...el, relativeStart, relativeEnd }
                          : el
                      ),
                    }
                  : phase
              ),
            }
          : team
      ),
    })),
}));
