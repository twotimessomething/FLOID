export interface ProjectSettings {
  skipWeekends: boolean;
  milestoneSnap: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  skipWeekends: true,
  milestoneSnap: true,
};

export interface Project {
  id: string;
  name: string;
  masterSectionId: string;      // Section driving project dates
  projectStartDate: string;     // ISO date string
  projectEndDate: string;       // ISO date string
  createdAt: string;
  updatedAt: string;
  settings?: ProjectSettings;
}
