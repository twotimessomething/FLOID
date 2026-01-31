import { create } from 'zustand';
import type { Project, Phase, Milestone } from '../types';
import type { Team } from '../types';
import { createDefaultProject, createDefaultPhases, createDefaultMilestones } from '../data/defaultTemplate';
import {
  loadProjectsIndex,
  saveProjectsIndex,
  loadProjectFromStorage,
  saveProjectToStorage,
  deleteProjectFromStorage,
  loadFromStorage,
  type ProjectIndexEntry,
} from '../utils/storageUtils';

interface ProjectState {
  // Current project
  project: Project;

  // All projects (index only - metadata)
  projects: ProjectIndexEntry[];
  activeProjectId: string | null;

  // Single project actions (legacy)
  setProject: (project: Project) => void;
  updateProject: (updates: Partial<Project>) => void;
  resetProject: () => void;

  // Multi-project actions
  initializeProjects: () => void;
  addProject: (config?: { name?: string; startDate?: string; endDate?: string }) => string;
  deleteProject: (projectId: string) => void;
  selectProject: (projectId: string) => void;
  updateProjectIndex: (projectId: string, updates: Partial<ProjectIndexEntry>) => void;

  // Save current project's data
  saveCurrentProject: (phases: Phase[], milestones: Milestone[], teams: Team[]) => void;

  // Load project data
  loadProjectData: (projectId: string) => { phases: Phase[]; milestones: Milestone[]; teams: Team[] } | null;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: createDefaultProject(),
  projects: [],
  activeProjectId: null,

  setProject: (project) => set({ project }),

  updateProject: (updates) =>
    set((state) => {
      const updatedProject = {
        ...state.project,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Update the projects index as well
      const updatedProjects = state.projects.map((p) =>
        p.id === state.activeProjectId
          ? { ...p, name: updatedProject.name, updatedAt: updatedProject.updatedAt }
          : p
      );
      saveProjectsIndex(updatedProjects);

      return {
        project: updatedProject,
        projects: updatedProjects,
      };
    }),

  resetProject: () => set({ project: createDefaultProject() }),

  initializeProjects: () => {
    let projects = loadProjectsIndex();

    // If no projects exist, check for legacy data or create default
    if (projects.length === 0) {
      const legacyData = loadFromStorage();
      if (legacyData && legacyData.project) {
        // Migrate legacy project
        const legacyProject = legacyData.project as Project;
        const projectEntry: ProjectIndexEntry = {
          id: legacyProject.id,
          name: legacyProject.name,
          updatedAt: legacyProject.updatedAt,
        };
        projects = [projectEntry];
        saveProjectsIndex(projects);
        saveProjectToStorage(legacyProject.id, legacyData);

        set({
          projects,
          project: legacyProject,
          activeProjectId: legacyProject.id,
        });
        return;
      }

      // Create default project
      const defaultProject = createDefaultProject();
      const defaultPhases = createDefaultPhases();
      const defaultMilestones = createDefaultMilestones();
      const projectEntry: ProjectIndexEntry = {
        id: defaultProject.id,
        name: defaultProject.name,
        updatedAt: defaultProject.updatedAt,
      };
      projects = [projectEntry];
      saveProjectsIndex(projects);
      saveProjectToStorage(defaultProject.id, {
        project: defaultProject,
        phases: defaultPhases,
        milestones: defaultMilestones,
        teams: [],
        version: 1,
      });

      set({
        projects,
        project: defaultProject,
        activeProjectId: defaultProject.id,
      });
      return;
    }

    // Load the most recently updated project
    const sortedProjects = [...projects].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const mostRecent = sortedProjects[0];
    const projectData = loadProjectFromStorage(mostRecent.id);

    if (projectData && projectData.project) {
      set({
        projects,
        project: projectData.project as Project,
        activeProjectId: mostRecent.id,
      });
    } else {
      // Project data missing, create fresh
      const defaultProject = createDefaultProject();
      set({
        projects,
        project: { ...defaultProject, id: mostRecent.id, name: mostRecent.name },
        activeProjectId: mostRecent.id,
      });
    }
  },

  addProject: (config?: { name?: string; startDate?: string; endDate?: string }) => {
    const newProject = createDefaultProject();
    if (config?.name) {
      newProject.name = config.name;
    }
    if (config?.startDate) {
      newProject.startDate = config.startDate;
    }
    if (config?.endDate) {
      newProject.endDate = config.endDate;
    }

    const newPhases = createDefaultPhases();
    const newMilestones = createDefaultMilestones();
    const projectEntry: ProjectIndexEntry = {
      id: newProject.id,
      name: newProject.name,
      updatedAt: newProject.updatedAt,
    };

    // Save the new project's data
    saveProjectToStorage(newProject.id, {
      project: newProject,
      phases: newPhases,
      milestones: newMilestones,
      teams: [],
      version: 1,
    });

    set((state) => {
      const updatedProjects = [...state.projects, projectEntry];
      saveProjectsIndex(updatedProjects);
      return { projects: updatedProjects };
    });

    return newProject.id;
  },

  deleteProject: (projectId: string) => {
    const { projects, activeProjectId } = get();

    // Don't delete if it's the only project
    if (projects.length <= 1) {
      return;
    }

    // Remove from index
    const updatedProjects = projects.filter((p) => p.id !== projectId);
    saveProjectsIndex(updatedProjects);

    // Delete project data
    deleteProjectFromStorage(projectId);

    // If deleting active project, switch to another
    if (activeProjectId === projectId) {
      const nextProject = updatedProjects[0];
      const projectData = loadProjectFromStorage(nextProject.id);

      set({
        projects: updatedProjects,
        project: projectData?.project as Project || createDefaultProject(),
        activeProjectId: nextProject.id,
      });
    } else {
      set({ projects: updatedProjects });
    }
  },

  selectProject: (projectId: string) => {
    const projectData = loadProjectFromStorage(projectId);

    if (projectData && projectData.project) {
      set({
        project: projectData.project as Project,
        activeProjectId: projectId,
      });
    }
  },

  updateProjectIndex: (projectId, updates) => {
    set((state) => {
      const updatedProjects = state.projects.map((p) =>
        p.id === projectId ? { ...p, ...updates } : p
      );
      saveProjectsIndex(updatedProjects);
      return { projects: updatedProjects };
    });
  },

  saveCurrentProject: (phases, milestones, teams) => {
    const { project, activeProjectId } = get();
    if (!activeProjectId) return;

    const updatedAt = new Date().toISOString();
    const updatedProject = { ...project, updatedAt };

    saveProjectToStorage(activeProjectId, {
      project: updatedProject,
      phases,
      milestones,
      teams,
      version: 1,
    });

    // Update project index
    set((state) => {
      const updatedProjects = state.projects.map((p) =>
        p.id === activeProjectId ? { ...p, updatedAt } : p
      );
      saveProjectsIndex(updatedProjects);
      return { project: updatedProject, projects: updatedProjects };
    });
  },

  loadProjectData: (projectId) => {
    const data = loadProjectFromStorage(projectId);
    if (!data) return null;

    return {
      phases: (data.phases || []) as Phase[],
      milestones: (data.milestones || []) as Milestone[],
      teams: (data.teams || []) as Team[],
    };
  },
}));
