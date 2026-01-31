import type { Project, Section } from '../types';

export interface ExportData {
  version: number;
  exportedAt: string;
  project: Project;
  sections: Section[];
}

export const exportToJson = (project: Project, sections: Section[]): string => {
  const data: ExportData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    project,
    sections,
  };
  return JSON.stringify(data, null, 2);
};

export const downloadJson = (project: Project, sections: Section[]): void => {
  const json = exportToJson(project, sections);
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
    if (!data.project || !data.sections) {
      throw new Error('Invalid format');
    }
    return data;
  } catch (error) {
    console.error('Failed to parse imported JSON:', error);
    return null;
  }
};
