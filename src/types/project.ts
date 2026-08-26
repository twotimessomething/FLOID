export interface ProjectSettings {
  skipWeekends: boolean;
  coloredRows: boolean;
  showDependencies: boolean;
  /**
   * Slide a bar's name along the bar so it stays in view once the bar's own
   * start has scrolled off. Off by default: a name that moves while the sheet
   * does is a second thing in motion, and most sheets are read without it.
   */
  travelingLabels: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  skipWeekends: true,
  coloredRows: true,
  showDependencies: true,
  travelingLabels: false,
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
