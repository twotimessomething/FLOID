import type { Project, Phase, Team } from '../types';

export interface ExportData {
  version: number;
  exportedAt: string;
  project: Project;
  phases: Phase[];
  teams: Team[];
}

export const exportToJson = (
  project: Project,
  phases: Phase[],
  teams: Team[]
): string => {
  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    phases,
    teams,
  };
  return JSON.stringify(data, null, 2);
};

export const downloadJson = (
  project: Project,
  phases: Phase[],
  teams: Team[]
): void => {
  const json = exportToJson(project, phases, teams);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-schedule.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const parseImportedJson = (json: string): ExportData | null => {
  try {
    const data = JSON.parse(json);
    if (!data.project || !data.phases) {
      throw new Error('Invalid format');
    }
    return data;
  } catch (error) {
    console.error('Failed to parse imported JSON:', error);
    return null;
  }
};
