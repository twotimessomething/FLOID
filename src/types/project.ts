export interface ProjectSettings {
  skipWeekends: boolean;
  coloredRows: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  skipWeekends: true,
  coloredRows: true,
};

export interface Project {
  id: string;
  name: string;
  pinnedSectionId: string | null; // Schedule pinned to the top (optional)
  projectStartDate: string;     // ISO date string, derived from all schedules
  projectEndDate: string;       // ISO date string, derived from all schedules
  createdAt: string;
  updatedAt: string;
  settings?: ProjectSettings;
}
