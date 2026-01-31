import { create } from 'zustand';
import type { Project, Section } from '../types';
import { createDefaultProject, createDefaultIDTimelineSection } from '../data/defaultTemplate';
import {
  loadProjectsIndex,
  saveProjectsIndex,
  loadProjectFromStorage,
  saveProjectToStorage,
  deleteProjectFromStorage,
  type ProjectIndexEntry,
} from '../utils/storageUtils';

interface ProjectState {
  project: Project;
  projects: ProjectIndexEntry[];
  activeProjectId: string | null;

  setProject: (project: Project) => void;
  updateProject: (updates: Partial<Project>) => void;
  resetProject: () => void;

  initializeProjects: () => void;
  addProject: (config?: { name?: string; startDate?: string; endDate?: string }) => string;
  deleteProject: (projectId: string) => void;
  selectProject: (projectId: string) => void;
  updateProjectIndex: (projectId: string, updates: Partial<ProjectIndexEntry>) => void;

  saveCurrentProject: (sections: Section[]) => void;
  loadProjectData: (projectId: string) => { sections: Section[] } | null;
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

    if (projects.length === 0) {
      // Create default project
      const defaultProject = createDefaultProject();
      const defaultSection = createDefaultIDTimelineSection();
      const projectEntry: ProjectIndexEntry = {
        id: defaultProject.id,
        name: defaultProject.name,
        updatedAt: defaultProject.updatedAt,
      };
      projects = [projectEntry];
      saveProjectsIndex(projects);
      saveProjectToStorage(defaultProject.id, {
        project: defaultProject,
        sections: [defaultSection],
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

    if (projectData?.project) {
      set({
        projects,
        project: projectData.project,
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

  addProject: (config) => {
    const newProject = createDefaultProject();
    if (config?.name) newProject.name = config.name;
    if (config?.startDate) newProject.startDate = config.startDate;
    if (config?.endDate) newProject.endDate = config.endDate;

    const newSection = createDefaultIDTimelineSection();
    const projectEntry: ProjectIndexEntry = {
      id: newProject.id,
      name: newProject.name,
      updatedAt: newProject.updatedAt,
    };

    saveProjectToStorage(newProject.id, {
      project: newProject,
      sections: [newSection],
    });

    set((state) => {
      const updatedProjects = [...state.projects, projectEntry];
      saveProjectsIndex(updatedProjects);
      return { projects: updatedProjects };
    });

    return newProject.id;
  },

  deleteProject: (projectId) => {
    const { projects, activeProjectId } = get();

    if (projects.length <= 1) return;

    const updatedProjects = projects.filter((p) => p.id !== projectId);
    saveProjectsIndex(updatedProjects);
    deleteProjectFromStorage(projectId);

    if (activeProjectId === projectId) {
      const nextProject = updatedProjects[0];
      const projectData = loadProjectFromStorage(nextProject.id);

      set({
        projects: updatedProjects,
        project: projectData?.project || createDefaultProject(),
        activeProjectId: nextProject.id,
      });
    } else {
      set({ projects: updatedProjects });
    }
  },

  selectProject: (projectId) => {
    const projectData = loadProjectFromStorage(projectId);

    if (projectData?.project) {
      set({
        project: projectData.project,
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

  saveCurrentProject: (sections) => {
    const { project, activeProjectId } = get();
    if (!activeProjectId) return;

    const updatedAt = new Date().toISOString();
    const updatedProject = { ...project, updatedAt };

    saveProjectToStorage(activeProjectId, {
      project: updatedProject,
      sections,
    });

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
    return { sections: data.sections || [] };
  },
}));
