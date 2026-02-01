import type { Project, Section } from '../types';
import type { ScheduleExportData, ImportAnalysis, ExportPhase, ExportMilestone, ProjectExportData } from '../types/scheduleExport';
import { getDateFromRelativePosition } from './dateUtils';
import { format } from 'date-fns';

// Helper to sanitize filename
const sanitizeFilename = (name: string): string =>
  name.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');

// Helper to compute absolute dates for phases
const computePhaseAbsoluteDates = (phase: Section['phases'][0], section: Section): ExportPhase => {
  const startDate = getDateFromRelativePosition(
    section.startDate,
    section.endDate,
    phase.relativeStart
  );
  const endDate = getDateFromRelativePosition(
    section.startDate,
    section.endDate,
    phase.relativeEnd
  );

  return {
    ...phase,
    absoluteStart: format(startDate, 'yyyy-MM-dd'),
    absoluteEnd: format(endDate, 'yyyy-MM-dd'),
  };
};

// Helper to compute absolute dates for milestones
const computeMilestoneAbsoluteDate = (milestone: Section['milestones'][0], section: Section): ExportMilestone => {
  const date = getDateFromRelativePosition(
    section.startDate,
    section.endDate,
    milestone.relativePosition
  );

  return {
    ...milestone,
    absoluteDate: format(date, 'yyyy-MM-dd'),
  };
};

// Full project export (v2.0 format)
export const exportProjectToJson = (project: Project, sections: Section[]): ProjectExportData => {
  return {
    format: 'floid-project',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      masterSectionId: project.masterSectionId,
      projectStartDate: project.projectStartDate,
      projectEndDate: project.projectEndDate,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      type: section.type,
      templateId: section.templateId,
      bindingMode: section.bindingMode,
      revision: section.revision,
      lastModifiedAt: section.lastModifiedAt,
      sourceProjectId: section.sourceProjectId,
      sourceProjectName: section.sourceProjectName,
      order: section.order,
      startDate: section.startDate,
      endDate: section.endDate,
      color: section.color,
      isCollapsed: section.isCollapsed,
      phases: section.phases.map((phase) => computePhaseAbsoluteDates(phase, section)),
      milestones: section.milestones.map((milestone) => computeMilestoneAbsoluteDate(milestone, section)),
    })),
  };
};

// Legacy export format for backwards compatibility during transition
export interface LegacyExportData {
  version: number;
  exportedAt: string;
  project: Project;
  sections: Section[];
}

export const exportToJson = (project: Project, sections: Section[]): string => {
  const data = exportProjectToJson(project, sections);
  return JSON.stringify(data, null, 2);
};

export const downloadProjectJson = (project: Project, sections: Section[]): void => {
  const json = exportToJson(project, sections);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(project.name)}.floid-project`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Legacy alias for backwards compatibility
export const downloadJson = downloadProjectJson;

export const parseProjectJson = (json: string): ProjectExportData | null => {
  try {
    const data = JSON.parse(json);

    // Support v2.0 format
    if (data.format === 'floid-project' && data.version === '2.0') {
      // Ensure isCollapsed has a default value
      const result = data as ProjectExportData;
      result.sections = result.sections.map((section) => ({
        ...section,
        isCollapsed: section.isCollapsed ?? false,
      }));
      return result;
    }

    // Support legacy format (version: 2)
    if (data.version === 2 && data.project && data.sections) {
      // Convert legacy format to v2.0
      const legacyData = data as LegacyExportData;
      return {
        format: 'floid-project',
        version: '2.0',
        exportedAt: legacyData.exportedAt,
        project: {
          id: legacyData.project.id,
          name: legacyData.project.name,
          masterSectionId: legacyData.project.masterSectionId,
          projectStartDate: legacyData.project.projectStartDate,
          projectEndDate: legacyData.project.projectEndDate,
          createdAt: legacyData.project.createdAt,
          updatedAt: legacyData.project.updatedAt,
        },
        sections: legacyData.sections.map((section) => ({
          id: section.id,
          name: section.name,
          type: section.type,
          templateId: section.templateId,
          bindingMode: section.bindingMode,
          revision: section.revision,
          lastModifiedAt: section.lastModifiedAt,
          sourceProjectId: section.sourceProjectId,
          sourceProjectName: section.sourceProjectName,
          order: section.order,
          startDate: section.startDate,
          endDate: section.endDate,
          color: section.color,
          isCollapsed: section.isCollapsed ?? false,
          // Legacy format doesn't have absolute dates, so we compute them
          phases: section.phases.map((phase) => ({
            ...phase,
            absoluteStart: format(getDateFromRelativePosition(section.startDate, section.endDate, phase.relativeStart), 'yyyy-MM-dd'),
            absoluteEnd: format(getDateFromRelativePosition(section.startDate, section.endDate, phase.relativeEnd), 'yyyy-MM-dd'),
          })),
          milestones: section.milestones.map((milestone) => ({
            ...milestone,
            absoluteDate: format(getDateFromRelativePosition(section.startDate, section.endDate, milestone.relativePosition), 'yyyy-MM-dd'),
          })),
        })),
      };
    }

    throw new Error('Unknown format');
  } catch (error) {
    console.error('Failed to parse project JSON:', error);
    return null;
  }
};

// Convert ProjectExportData back to runtime types (strips absolute dates from phases/milestones)
export const convertImportedProject = (data: ProjectExportData): { project: Project; sections: Section[] } => {
  const project: Project = {
    id: data.project.id,
    name: data.project.name,
    masterSectionId: data.project.masterSectionId,
    projectStartDate: data.project.projectStartDate,
    projectEndDate: data.project.projectEndDate,
    createdAt: data.project.createdAt,
    updatedAt: data.project.updatedAt,
  };

  const sections: Section[] = data.sections.map((section) => ({
    id: section.id,
    name: section.name,
    type: section.type,
    templateId: section.templateId,
    bindingMode: section.bindingMode,
    revision: section.revision,
    lastModifiedAt: section.lastModifiedAt,
    sourceProjectId: section.sourceProjectId,
    sourceProjectName: section.sourceProjectName,
    order: section.order,
    startDate: section.startDate,
    endDate: section.endDate,
    color: section.color,
    isCollapsed: section.isCollapsed,
    // Strip absolute dates from phases (keep relative positions)
    phases: section.phases.map((phase) => ({
      id: phase.id,
      sectionId: phase.sectionId,
      name: phase.name,
      description: phase.description,
      color: phase.color,
      order: phase.order,
      isCollapsed: phase.isCollapsed,
      relativeStart: phase.relativeStart,
      relativeEnd: phase.relativeEnd,
      elements: phase.elements,
    })),
    // Strip absolute dates from milestones (keep relative positions)
    milestones: section.milestones.map((milestone) => ({
      id: milestone.id,
      sectionId: milestone.sectionId,
      name: milestone.name,
      description: milestone.description,
      relativePosition: milestone.relativePosition,
      order: milestone.order,
    })),
  }));

  return { project, sections };
};

// Legacy alias for backwards compatibility
export const parseImportedJson = parseProjectJson;

// Schedule-specific export/import functions for .floid files

export const exportScheduleToFloid = (project: Project, section: Section): ScheduleExportData => {
  return {
    format: 'floid',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    sourceProjectId: project.id,
    sourceProjectName: project.name,
    schedule: {
      id: section.id,
      name: section.name,
      templateId: section.templateId,
      revision: section.revision,
      lastModifiedAt: section.lastModifiedAt,
      bindingMode: section.bindingMode,
      color: section.color,
    },
    projectDates: {
      startDate: project.projectStartDate,
      endDate: project.projectEndDate,
    },
    scheduleDates: {
      startDate: section.startDate,
      endDate: section.endDate,
    },
    phases: section.phases.map((phase) => computePhaseAbsoluteDates(phase, section)),
    milestones: section.milestones.map((milestone) => computeMilestoneAbsoluteDate(milestone, section)),
  };
};

export const downloadScheduleFloid = (project: Project, section: Section): void => {
  const data = exportScheduleToFloid(project, section);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(project.name)}_${sanitizeFilename(section.name)}_r${section.revision}.floid`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const parseScheduleFloid = (json: string): ScheduleExportData | null => {
  try {
    const data = JSON.parse(json);
    // Validate .floid format (v2.0)
    if (
      data.format === 'floid' &&
      data.version === '2.0' &&
      data.sourceProjectId &&
      data.sourceProjectName &&
      data.schedule?.id &&
      data.schedule?.name &&
      data.scheduleDates?.startDate &&
      data.scheduleDates?.endDate &&
      data.phases
    ) {
      return data as ScheduleExportData;
    }
    throw new Error('Invalid .floid v2.0 format');
  } catch (error) {
    console.error('Failed to parse .floid file:', error);
    return null;
  }
};

export const analyzeScheduleImport = (
  data: ScheduleExportData,
  project: Project,
  sections: Section[]
): ImportAnalysis => {
  // Check if an existing section with the same ID exists
  const existingById = sections.find((s) => s.id === data.schedule.id);

  // Check for name collision (same name, different ID)
  const existingByName = sections.find(
    (s) => s.name === data.schedule.name && s.id !== data.schedule.id
  );

  // Check date alignment with project
  const dateMismatch =
    data.scheduleDates.startDate !== project.projectStartDate ||
    data.scheduleDates.endDate !== project.projectEndDate;

  if (existingById) {
    const revisionDelta = data.schedule.revision - existingById.revision;

    if (revisionDelta > 0) {
      return {
        type: 'update-newer',
        existingSection: existingById,
        importData: data,
        dateMismatch,
        revisionDelta,
      };
    } else if (revisionDelta < 0) {
      return {
        type: 'update-older',
        existingSection: existingById,
        importData: data,
        dateMismatch,
        revisionDelta,
      };
    } else {
      return {
        type: 'update-same',
        existingSection: existingById,
        importData: data,
        dateMismatch,
        revisionDelta: 0,
      };
    }
  }

  if (existingByName) {
    return {
      type: 'name-collision',
      existingSection: existingByName,
      importData: data,
      dateMismatch,
    };
  }

  return {
    type: 'new-schedule',
    importData: data,
    dateMismatch,
  };
};
