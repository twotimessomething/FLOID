import { create } from 'zustand';
import type { Project } from '../types';
import { createDefaultProject } from '../data/defaultTemplate';

interface ProjectState {
  project: Project;
  setProject: (project: Project) => void;
  updateProject: (updates: Partial<Project>) => void;
  resetProject: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: createDefaultProject(),

  setProject: (project) => set({ project }),

  updateProject: (updates) =>
    set((state) => ({
      project: {
        ...state.project,
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    })),

  resetProject: () => set({ project: createDefaultProject() }),
}));
