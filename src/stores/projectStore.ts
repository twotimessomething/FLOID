import { create } from 'zustand';
import type { Project, Section, ProjectSettings } from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../types';
import { createDefaultProject, createDefaultIDTimelineSection } from '../data/defaultTemplate';
import { createSectionFromTemplate, getTemplateById } from '../data/scheduleTemplates';
import {
  loadProjectsIndex,
  saveProjectsIndex,
  loadProjectFromStorage,
  saveProjectToStorage,
  deleteProjectFromStorage,
  initializeStorage,
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
  isStorageReady: boolean;

  setProject: (project: Project) => void;
  updateProject: (updates: Partial<Project>) => void;
  resetProject: () => void;

  initializeProjects: () => Promise<void>;
  addProject: (config?: { name?: string }) => Promise<string>;
  createProject: (config: NewProjectConfig) => Promise<{ projectId: string; section: Section }>;
  importProject: (project: Project, sections: Section[]) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  updateProjectIndex: (projectId: string, updates: Partial<ProjectIndexEntry>) => Promise<void>;

  // Master section operations
  setMasterSection: (sectionId: string, startDate: string, endDate: string) => void;
  updateProjectDates: (startDate: string, endDate: string) => void;

  // Settings
  getSettings: () => ProjectSettings;
  updateSettings: (updates: Partial<ProjectSettings>) => void;

  saveCurrentProject: (sections: Section[]) => Promise<void>;
  loadProjectData: (projectId: string) => Promise<{ sections: Section[] } | null>;
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
  isStorageReady: false,

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

      // Save async but don't await
      saveProjectsIndex(updatedProjects).catch(console.error);

      return {
        project: updatedProject,
        projects: updatedProjects,
      };
    }),

  resetProject: () => {
    const { project } = createDefaultProjectWithSection();
    set({ project });
  },

  initializeProjects: async () => {
    // Initialize storage (migrate from localStorage if needed)
    await initializeStorage();

    const projects = await loadProjectsIndex();

    // No projects - start with empty state
    if (projects.length === 0) {
      set({
        projects: [],
        project: null as unknown as Project,
        activeProjectId: null,
        isStorageReady: true,
      });
      return;
    }

    // Load the most recently updated project
    const sortedProjects = [...projects].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const mostRecent = sortedProjects[0];
    const projectData = await loadProjectFromStorage(mostRecent.id);

    if (projectData?.project) {
      set({
        projects,
        project: projectData.project,
        activeProjectId: mostRecent.id,
        isStorageReady: true,
      });
    } else {
      // Project data missing - remove from index and try next
      const remainingProjects = projects.filter(p => p.id !== mostRecent.id);
      await saveProjectsIndex(remainingProjects);
      await deleteProjectFromStorage(mostRecent.id);

      if (remainingProjects.length === 0) {
        set({
          projects: [],
          project: null as unknown as Project,
          activeProjectId: null,
          isStorageReady: true,
        });
      } else {
        // Recursively try to load remaining projects
        set({ projects: remainingProjects });
        await get().initializeProjects();
      }
    }
  },

  addProject: async (config) => {
    const { project: newProject, section: newSection } = createDefaultProjectWithSection(config?.name);

    const projectEntry: ProjectIndexEntry = {
      id: newProject.id,
      name: newProject.name,
      updatedAt: newProject.updatedAt,
    };

    await saveProjectToStorage(newProject.id, {
      project: newProject,
      sections: [newSection],
    });

    const state = get();
    const updatedProjects = [...state.projects, projectEntry];
    await saveProjectsIndex(updatedProjects);

    set({ projects: updatedProjects });

    return newProject.id;
  },

  createProject: async (config) => {
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

    await saveProjectToStorage(newProject.id, {
      project: newProject,
      sections: [masterSection],
    });

    const state = get();
    const updatedProjects = [...state.projects, projectEntry];
    await saveProjectsIndex(updatedProjects);

    set({ projects: updatedProjects });

    return { projectId: newProject.id, section: masterSection };
  },

  importProject: async (importedProject, importedSections) => {
    // Generate new IDs to avoid collisions with existing projects
    const newProjectId = Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();

    // Create ID mapping for sections
    const sectionIdMap = new Map<string, string>();
    importedSections.forEach((section) => {
      sectionIdMap.set(section.id, Math.random().toString(36).substring(2, 11));
    });

    // Update master section ID reference
    const newMasterSectionId = sectionIdMap.get(importedProject.masterSectionId) ?? importedProject.masterSectionId;

    // Create new project with new ID
    const newProject: Project = {
      ...importedProject,
      id: newProjectId,
      masterSectionId: newMasterSectionId,
      createdAt: now,
      updatedAt: now,
    };

    // Update sections with new IDs
    const newSections: Section[] = importedSections.map((section) => ({
      ...section,
      id: sectionIdMap.get(section.id) ?? section.id,
      phases: section.phases.map((phase) => ({
        ...phase,
        sectionId: sectionIdMap.get(section.id) ?? section.id,
      })),
      milestones: section.milestones.map((milestone) => ({
        ...milestone,
        sectionId: sectionIdMap.get(section.id) ?? section.id,
      })),
    }));

    const projectEntry: ProjectIndexEntry = {
      id: newProjectId,
      name: newProject.name,
      updatedAt: newProject.updatedAt,
    };

    await saveProjectToStorage(newProjectId, {
      project: newProject,
      sections: newSections,
    });

    const state = get();
    const updatedProjects = [...state.projects, projectEntry];
    await saveProjectsIndex(updatedProjects);

    set({ projects: updatedProjects });

    return newProjectId;
  },

  deleteProject: async (projectId) => {
    const { projects, activeProjectId } = get();

    const updatedProjects = projects.filter((p) => p.id !== projectId);
    await saveProjectsIndex(updatedProjects);
    await deleteProjectFromStorage(projectId);

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
      const projectData = await loadProjectFromStorage(nextProject.id);

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

  selectProject: async (projectId) => {
    const projectData = await loadProjectFromStorage(projectId);

    if (projectData?.project) {
      set({
        project: projectData.project,
        activeProjectId: projectId,
      });
    }
  },

  updateProjectIndex: async (projectId, updates) => {
    const state = get();
    const updatedProjects = state.projects.map((p) =>
      p.id === projectId ? { ...p, ...updates } : p
    );
    await saveProjectsIndex(updatedProjects);
    set({ projects: updatedProjects });
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

  getSettings: () => {
    const { project } = get();
    return project?.settings ?? DEFAULT_PROJECT_SETTINGS;
  },

  updateSettings: (updates) =>
    set((state) => ({
      project: {
        ...state.project,
        settings: {
          ...(state.project?.settings ?? DEFAULT_PROJECT_SETTINGS),
          ...updates,
        },
        updatedAt: new Date().toISOString(),
      },
    })),

  saveCurrentProject: async (sections) => {
    const { project, activeProjectId } = get();
    if (!activeProjectId) return;

    const updatedAt = new Date().toISOString();
    const updatedProject = { ...project, updatedAt };

    await saveProjectToStorage(activeProjectId, {
      project: updatedProject,
      sections,
    });

    const state = get();
    const updatedProjects = state.projects.map((p) =>
      p.id === activeProjectId ? { ...p, updatedAt } : p
    );
    await saveProjectsIndex(updatedProjects);

    set({ project: updatedProject, projects: updatedProjects });
  },

  loadProjectData: async (projectId) => {
    const data = await loadProjectFromStorage(projectId);
    if (!data) return null;
    return { sections: data.sections || [] };
  },
}));
