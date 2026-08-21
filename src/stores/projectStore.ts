import { create } from 'zustand';
import type { Project, Section, TimelineItem, ProjectSettings } from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../types';
import { createDefaultProject, createDefaultIDTimelineSection } from '../data/defaultTemplate';
import { generateId } from '../utils/idUtils';
import {
  createSectionFromTemplate,
  getTemplateById,
  getProjectTemplateById,
  createSectionsFromProjectTemplate,
} from '../data/scheduleTemplates';
import {
  loadProjectsIndex,
  saveProjectsIndex,
  loadProjectFromStorage,
  saveProjectToStorage,
  deleteProjectFromStorage,
  initializeStorage,
  type ProjectIndexEntry,
} from '../utils/storageUtils';
import { getSectionsDateRange } from '../utils/dateUtils';
import { toDayKey } from '../utils/dayKeys';
import { remapItemIds } from '../utils/itemTree';

// Configuration for creating a new project
export interface NewProjectConfig {
  name: string;
  startDate: Date;
  endDate: Date;
  templateId: string;
  projectTemplateId?: string; // For multi-section projects
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
  createProject: (config: NewProjectConfig) => Promise<{ projectId: string; sections: Section[] }>;
  importProject: (project: Project, sections: Section[]) => Promise<string>;
  deleteProject: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  updateProjectIndex: (projectId: string, updates: Partial<ProjectIndexEntry>) => Promise<void>;

  // Pin operations
  setPinnedSection: (sectionId: string | null) => void;

  // Settings
  getSettings: () => ProjectSettings;
  updateSettings: (updates: Partial<ProjectSettings>) => void;

  saveCurrentProject: (sections: Section[]) => Promise<void>;
  loadProjectData: (projectId: string) => Promise<{ sections: Section[] } | null>;
}

// A schedule opens with one milestone on its first day, so the marker
// affordance is visible before the user has drawn anything. Templates that
// already mark that day keep their own.
const seedStartMilestone = (section: Section): Section => {
  const hasStartMarker = section.items.some(
    (item) => item.kind === 'milestone' && item.start === section.startDate
  );
  if (hasStartMarker) return section;

  const startMilestone: TimelineItem = {
    id: generateId(),
    kind: 'milestone',
    name: 'Start',
    description: '',
    start: section.startDate,
    end: section.startDate,
    color: null,
    isCollapsed: false,
    children: [],
  };
  // Root milestones sit on the schedule's own row, so appending leaves the
  // order of the bar rows below it untouched.
  return { ...section, items: [...section.items, startMilestone] };
};

// Helper to create a default project with its first (pinned) section
const createDefaultProjectWithSection = (name?: string): { project: Project; section: Section } => {
  const section = seedStartMilestone(createDefaultIDTimelineSection());
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
    const startDateStr = toDayKey(config.startDate);
    const endDateStr = toDayKey(config.endDate);
    const dateRange = { startDate: startDateStr, endDate: endDateStr };

    let projectSections: Section[];
    let pinnedSectionId: string;

    // Check if using a project template (multi-section)
    if (config.projectTemplateId) {
      const projectTemplate = getProjectTemplateById(config.projectTemplateId);
      if (!projectTemplate) {
        throw new Error(`Project template not found: ${config.projectTemplateId}`);
      }

      const result = createSectionsFromProjectTemplate(projectTemplate, { dateRange });
      projectSections = result.sections;
      pinnedSectionId = result.pinnedSectionId;
    } else {
      // Single section from schedule template
      const template = getTemplateById(config.templateId);
      if (!template) {
        throw new Error(`Template not found: ${config.templateId}`);
      }

      const firstSection = createSectionFromTemplate(template, 0, { dateRange });
      projectSections = [firstSection];
      pinnedSectionId = firstSection.id;
    }

    // Seed a "Start" milestone on the pinned section so users see the affordance.
    projectSections = projectSections.map((s) =>
      s.id === pinnedSectionId ? seedStartMilestone(s) : s
    );

    const now = new Date();
    const newProject: Project = {
      id: Math.random().toString(36).substring(2, 11),
      name: config.name.trim() || 'New Project',
      pinnedSectionId,
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
      sections: projectSections,
    });

    const state = get();
    const updatedProjects = [...state.projects, projectEntry];
    await saveProjectsIndex(updatedProjects);

    set({ projects: updatedProjects });

    return { projectId: newProject.id, sections: projectSections };
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

    // Update pinned section ID reference
    const newPinnedSectionId = importedProject.pinnedSectionId
      ? sectionIdMap.get(importedProject.pinnedSectionId) ?? importedProject.pinnedSectionId
      : null;

    // Create new project with new ID
    const newProject: Project = {
      ...importedProject,
      id: newProjectId,
      pinnedSectionId: newPinnedSectionId,
      createdAt: now,
      updatedAt: now,
    };

    // Every id in the file is regenerated, item trees included, so an imported
    // copy can sit alongside the project it was exported from.
    const newSections: Section[] = importedSections.map((section) => ({
      ...section,
      id: sectionIdMap.get(section.id) ?? section.id,
      items: section.items.map((item) => remapItemIds(item, generateId)),
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

  setPinnedSection: (sectionId) =>
    set((state) => ({
      project: {
        ...state.project,
        pinnedSectionId: sectionId,
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
    // Project dates are derived from the combined range of all schedules
    const dateRange = getSectionsDateRange(sections);
    const updatedProject = {
      ...project,
      ...(dateRange && {
        projectStartDate: dateRange.startDate,
        projectEndDate: dateRange.endDate,
      }),
      updatedAt,
    };

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
