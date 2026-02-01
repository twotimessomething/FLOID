import { create } from 'zustand';
import type { Project, Section } from '../types';
import { createDefaultProject, createDefaultIDTimelineSection } from '../data/defaultTemplate';
import { createSectionFromTemplate, getTemplateById } from '../data/scheduleTemplates';
import {
  loadProjectsIndex,
  saveProjectsIndex,
  loadProjectFromStorage,
  saveProjectToStorage,
  deleteProjectFromStorage,
  type ProjectIndexEntry,
} from '../utils/storageUtils';

// Configuration for creating a new project
export interface NewProjectConfig {
  name: string;
  startDate: Date;
  endDate: Date;
  masterTemplateId: string;
}

interface ProjectState {
  project: Project;
  projects: ProjectIndexEntry[];
  activeProjectId: string | null;

  setProject: (project: Project) => void;
  updateProject: (updates: Partial<Project>) => void;
  resetProject: () => void;

  initializeProjects: () => void;
  addProject: (config?: { name?: string }) => string;
  createProject: (config: NewProjectConfig) => { projectId: string; section: Section };
  deleteProject: (projectId: string) => void;
  selectProject: (projectId: string) => void;
  updateProjectIndex: (projectId: string, updates: Partial<ProjectIndexEntry>) => void;

  // Master section operations
  setMasterSection: (sectionId: string, startDate: string, endDate: string) => void;
  updateProjectDates: (startDate: string, endDate: string) => void;

  saveCurrentProject: (sections: Section[]) => void;
  loadProjectData: (projectId: string) => { sections: Section[] } | null;
}

// Helper to create a default project with its master section
const createDefaultProjectWithSection = (name?: string): { project: Project; section: Section } => {
  const section = createDefaultIDTimelineSection();
  const project = createDefaultProject(section.id, section.startDate, section.endDate);
  if (name) project.name = name;
  return { project, section };
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: (() => {
    const section = createDefaultIDTimelineSection();
    return createDefaultProject(section.id, section.startDate, section.endDate);
  })(),
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

  resetProject: () => {
    const { project } = createDefaultProjectWithSection();
    set({ project });
  },

  initializeProjects: () => {
    const projects = loadProjectsIndex();

    // No projects - start with empty state
    if (projects.length === 0) {
      set({
        projects: [],
        project: null as unknown as Project,
        activeProjectId: null,
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
      // Project data missing - remove from index and try next
      const remainingProjects = projects.filter(p => p.id !== mostRecent.id);
      saveProjectsIndex(remainingProjects);
      deleteProjectFromStorage(mostRecent.id);

      if (remainingProjects.length === 0) {
        set({
          projects: [],
          project: null as unknown as Project,
          activeProjectId: null,
        });
      } else {
        // Recursively try to load remaining projects
        set({ projects: remainingProjects });
        get().initializeProjects();
      }
    }
  },

  addProject: (config) => {
    const { project: newProject, section: newSection } = createDefaultProjectWithSection(config?.name);

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

  createProject: (config) => {
    const template = getTemplateById(config.masterTemplateId);
    if (!template) {
      throw new Error(`Template not found: ${config.masterTemplateId}`);
    }

    const startDateStr = config.startDate.toISOString();
    const endDateStr = config.endDate.toISOString();

    // Create master section from template
    const masterSection = createSectionFromTemplate(template, 0, {
      dateRange: { startDate: startDateStr, endDate: endDateStr },
    });

    const now = new Date();
    const newProject: Project = {
      id: Math.random().toString(36).substring(2, 11),
      name: config.name.trim() || 'New Project',
      masterSectionId: masterSection.id,
      projectStartDate: startDateStr,
      projectEndDate: endDateStr,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const projectEntry: ProjectIndexEntry = {
      id: newProject.id,
      name: newProject.name,
      updatedAt: newProject.updatedAt,
    };

    saveProjectToStorage(newProject.id, {
      project: newProject,
      sections: [masterSection],
    });

    set((state) => {
      const updatedProjects = [...state.projects, projectEntry];
      saveProjectsIndex(updatedProjects);
      return { projects: updatedProjects };
    });

    return { projectId: newProject.id, section: masterSection };
  },

  deleteProject: (projectId) => {
    const { projects, activeProjectId } = get();

    const updatedProjects = projects.filter((p) => p.id !== projectId);
    saveProjectsIndex(updatedProjects);
    deleteProjectFromStorage(projectId);

    // If no projects remain, clear state entirely
    if (updatedProjects.length === 0) {
      set({
        projects: [],
        project: null as unknown as Project,
        activeProjectId: null,
      });
      return;
    }

    if (activeProjectId === projectId) {
      const nextProject = updatedProjects[0];
      const projectData = loadProjectFromStorage(nextProject.id);

      if (projectData?.project) {
        set({
          projects: updatedProjects,
          project: projectData.project,
          activeProjectId: nextProject.id,
        });
      } else {
        const { project: defaultProject } = createDefaultProjectWithSection(nextProject.name);
        set({
          projects: updatedProjects,
          project: { ...defaultProject, id: nextProject.id },
          activeProjectId: nextProject.id,
        });
      }
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

  setMasterSection: (sectionId, startDate, endDate) =>
    set((state) => ({
      project: {
        ...state.project,
        masterSectionId: sectionId,
        projectStartDate: startDate,
        projectEndDate: endDate,
        updatedAt: new Date().toISOString(),
      },
    })),

  updateProjectDates: (startDate, endDate) =>
    set((state) => ({
      project: {
        ...state.project,
        projectStartDate: startDate,
        projectEndDate: endDate,
        updatedAt: new Date().toISOString(),
      },
    })),

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
