import type { Project, Section } from '../types';
import { getPhaseColor } from '../types';
import type { ScheduleExportData, ImportAnalysis, ExportPhase, ExportMilestone, ProjectExportData } from '../types/scheduleExport';
import { getDateFromRelativePosition, computeViewportBounds, sectionToViewportRelative, getMonthMarkers } from './dateUtils';
import { format, differenceInDays } from 'date-fns';
import { setAppSettings } from './indexedDB';
import { sanitizeFilename } from './stringUtils';
import {
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
  IMAGE_PADDING,
  LABEL_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  TASK_ROW_HEIGHT,
  BAR_HEIGHT,
  TASK_BAR_HEIGHT,
  BAR_RADIUS,
} from '../constants/exportDimensions';

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

export const downloadProjectJson = async (project: Project, sections: Section[]): Promise<void> => {
  const json = exportToJson(project, sections);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(project.name)}.floid`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Update last backup date
  await setAppSettings({ lastBackupDate: new Date().toISOString() });
};


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
      tasks: phase.tasks,
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

export const downloadScheduleFloid = async (project: Project, section: Section): Promise<void> => {
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

  // Update last backup date
  await setAppSettings({ lastBackupDate: new Date().toISOString() });
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

// Export timeline as image (1920x1080 PNG)
// Renders the FULL timeline programmatically - all sections, phases, and tasks
export const exportTimelineAsImage = async (
  project: Project,
  sections: Section[]
): Promise<void> => {
  const WIDTH = IMAGE_WIDTH;
  const HEIGHT = IMAGE_HEIGHT;
  const PADDING = IMAGE_PADDING;

  // Get CSS variable colors or use defaults
  const getColor = (varName: string, fallback: string): string => {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
  };

  const colors = {
    surface: getColor('--color-surface', '#ffffff'),
    text: getColor('--color-text-primary', '#1f2937'),
    textSecondary: getColor('--color-text-secondary', '#6b7280'),
    textMuted: getColor('--color-text-muted', '#9ca3af'),
    border: getColor('--color-border', '#e5e7eb'),
    hover: getColor('--color-hover', '#f3f4f6'),
  };

  // Sort sections by order (master section first)
  const sortedSections = [...sections].sort((a, b) => {
    if (a.id === project.masterSectionId) return -1;
    if (b.id === project.masterSectionId) return 1;
    return a.order - b.order;
  });

  // Calculate total content height (all expanded)
  let totalHeight = HEADER_HEIGHT;
  for (const section of sortedSections) {
    totalHeight += ROW_HEIGHT; // Section row
    for (const phase of section.phases) {
      totalHeight += ROW_HEIGHT; // Phase row
      totalHeight += phase.tasks.length * TASK_ROW_HEIGHT; // Task rows
    }
  }
  totalHeight += PADDING; // Bottom padding

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  // Fill background
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Calculate viewport bounds from all sections
  const viewport = computeViewportBounds(sortedSections);
  const timelineWidth = WIDTH - LABEL_WIDTH - PADDING * 2;
  const timelineX = LABEL_WIDTH + PADDING;

  // Calculate vertical scaling if content is taller than canvas
  const availableHeight = HEIGHT - HEADER_HEIGHT - PADDING * 2;
  const contentHeight = totalHeight - HEADER_HEIGHT;
  const verticalScale = contentHeight > availableHeight ? availableHeight / contentHeight : 1;
  const scaledRowHeight = ROW_HEIGHT * verticalScale;
  const scaledTaskRowHeight = TASK_ROW_HEIGHT * verticalScale;
  const scaledBarHeight = BAR_HEIGHT * verticalScale;
  const scaledTaskBarHeight = TASK_BAR_HEIGHT * verticalScale;

  // Draw header with month markers
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_HEIGHT);
  ctx.lineTo(WIDTH, HEADER_HEIGHT);
  ctx.stroke();

  // Draw month markers
  const monthMarkers = getMonthMarkers(viewport.startDate, viewport.endDate);
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = colors.textSecondary;
  ctx.textAlign = 'center';

  for (const marker of monthMarkers) {
    const days = differenceInDays(marker.date, viewport.startDate);
    const relativeX = days / viewport.totalDays;
    const x = timelineX + relativeX * timelineWidth;

    if (x >= timelineX && x <= timelineX + timelineWidth) {
      ctx.fillText(marker.label, x, HEADER_HEIGHT - 15);

      // Draw vertical grid line
      ctx.strokeStyle = colors.border;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Draw year indicator
  ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = colors.textMuted;
  ctx.textAlign = 'left';
  const year = viewport.startDate.getFullYear();
  ctx.fillText(String(year), timelineX + 5, HEADER_HEIGHT - 30);

  // Draw project title
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'left';
  ctx.fillText(project.name, PADDING, HEADER_HEIGHT - 18);

  // Helper to draw rounded rect
  const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Helper to get contrasting text color for a background
  const getContrastColor = (hexColor: string): string => {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Draw sections
  let y = HEADER_HEIGHT + PADDING;

  for (const section of sortedSections) {
    const isMaster = section.id === project.masterSectionId;
    const sectionHeaderY = y; // Store for milestone positioning

    // Draw section label
    ctx.font = isMaster ? 'bold 13px system-ui, -apple-system, sans-serif' : '13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    const sectionLabel = section.name + (isMaster ? ' ★' : '');
    ctx.fillText(sectionLabel, PADDING, y + scaledRowHeight / 2 + 4, LABEL_WIDTH - PADDING);

    // Draw section divider
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();

    // Draw section milestones on the section header row
    for (const milestone of section.milestones) {
      const milestoneViewport = sectionToViewportRelative(milestone.relativePosition, section, viewport);
      const milestoneX = timelineX + milestoneViewport * timelineWidth;
      const milestoneY = sectionHeaderY + scaledRowHeight / 2;

      // Draw milestone diamond
      ctx.fillStyle = section.color;
      ctx.beginPath();
      const size = 6 * verticalScale;
      ctx.moveTo(milestoneX, milestoneY - size);
      ctx.lineTo(milestoneX + size, milestoneY);
      ctx.lineTo(milestoneX, milestoneY + size);
      ctx.lineTo(milestoneX - size, milestoneY);
      ctx.closePath();
      ctx.fill();

      // Draw milestone label
      ctx.font = `${Math.max(9 * verticalScale, 8)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      ctx.fillText(milestone.name, milestoneX + size + 4, milestoneY + 3, 100);
    }

    y += scaledRowHeight;

    // Draw phases
    const totalPhases = section.phases.length;
    const sortedPhases = [...section.phases].sort((a, b) => a.order - b.order);

    for (let phaseIndex = 0; phaseIndex < sortedPhases.length; phaseIndex++) {
      const phase = sortedPhases[phaseIndex];
      const phaseColor = getPhaseColor(phase, section, phaseIndex, totalPhases);

      // Draw phase label in left column
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = colors.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(phase.name, PADDING + 16, y + scaledRowHeight / 2 + 4, LABEL_WIDTH - PADDING - 20);

      // Calculate phase position in viewport
      const phaseStartViewport = sectionToViewportRelative(phase.relativeStart, section, viewport);
      const phaseEndViewport = sectionToViewportRelative(phase.relativeEnd, section, viewport);
      const phaseX = timelineX + phaseStartViewport * timelineWidth;
      const phaseWidth = (phaseEndViewport - phaseStartViewport) * timelineWidth;

      // Draw phase bar
      if (phaseWidth > 0) {
        ctx.fillStyle = phaseColor;
        const barY = y + (scaledRowHeight - scaledBarHeight) / 2;
        drawRoundedRect(phaseX, barY, Math.max(phaseWidth, 2), scaledBarHeight, BAR_RADIUS * verticalScale);
        ctx.fill();

        // Draw phase label on bar (if bar is wide enough)
        if (phaseWidth > 40) {
          ctx.font = `bold ${Math.max(10 * verticalScale, 9)}px system-ui, -apple-system, sans-serif`;
          ctx.fillStyle = getContrastColor(phaseColor);
          ctx.textAlign = 'left';
          ctx.fillText(phase.name, phaseX + 6, barY + scaledBarHeight / 2 + 3, phaseWidth - 12);
        }
      }

      // Draw bar milestones on phase bar
      if (phase.barMilestones) {
        for (const barMilestone of phase.barMilestones) {
          // Bar milestone position is relative to the phase bar
          const bmRelativeSection = phase.relativeStart + barMilestone.relativePosition * (phase.relativeEnd - phase.relativeStart);
          const bmViewport = sectionToViewportRelative(bmRelativeSection, section, viewport);
          const bmX = timelineX + bmViewport * timelineWidth;
          const bmY = y + scaledRowHeight / 2;

          // Draw small diamond
          ctx.fillStyle = getContrastColor(phaseColor);
          ctx.beginPath();
          const bmSize = 4 * verticalScale;
          ctx.moveTo(bmX, bmY - bmSize);
          ctx.lineTo(bmX + bmSize, bmY);
          ctx.lineTo(bmX, bmY + bmSize);
          ctx.lineTo(bmX - bmSize, bmY);
          ctx.closePath();
          ctx.fill();

          // Draw bar milestone label
          ctx.font = `${Math.max(8 * verticalScale, 7)}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillText(barMilestone.name, bmX + bmSize + 2, bmY + 2, 60);
        }
      }

      y += scaledRowHeight;

      // Draw tasks
      const sortedTasks = [...phase.tasks].sort((a, b) => a.order - b.order);
      for (const task of sortedTasks) {
        // Draw task label in left column
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colors.textMuted;
        ctx.textAlign = 'left';
        ctx.fillText(task.name, PADDING + 32, y + scaledTaskRowHeight / 2 + 3, LABEL_WIDTH - PADDING - 36);

        // Calculate task position (task is relative to phase, need to convert to section then viewport)
        const taskStartSection = phase.relativeStart + task.relativeStart * (phase.relativeEnd - phase.relativeStart);
        const taskEndSection = phase.relativeStart + task.relativeEnd * (phase.relativeEnd - phase.relativeStart);
        const taskStartViewport = sectionToViewportRelative(taskStartSection, section, viewport);
        const taskEndViewport = sectionToViewportRelative(taskEndSection, section, viewport);
        const taskX = timelineX + taskStartViewport * timelineWidth;
        const taskWidth = (taskEndViewport - taskStartViewport) * timelineWidth;

        // Draw task bar (lighter version of phase color)
        if (taskWidth > 0) {
          ctx.fillStyle = phaseColor;
          ctx.globalAlpha = 0.6;
          const barY = y + (scaledTaskRowHeight - scaledTaskBarHeight) / 2;
          drawRoundedRect(taskX, barY, Math.max(taskWidth, 2), scaledTaskBarHeight, BAR_RADIUS * verticalScale * 0.8);
          ctx.fill();
          ctx.globalAlpha = 1;

          // Draw task label on bar (if bar is wide enough)
          if (taskWidth > 30) {
            ctx.font = `${Math.max(9 * verticalScale, 8)}px system-ui, -apple-system, sans-serif`;
            ctx.fillStyle = getContrastColor(phaseColor);
            ctx.textAlign = 'left';
            ctx.fillText(task.name, taskX + 4, barY + scaledTaskBarHeight / 2 + 3, taskWidth - 8);
          }
        }

        // Draw bar milestones on task bar
        if (task.barMilestones) {
          for (const barMilestone of task.barMilestones) {
            // Bar milestone position is relative to the task bar (which is relative to the phase)
            const taskBarStart = phase.relativeStart + task.relativeStart * (phase.relativeEnd - phase.relativeStart);
            const taskBarEnd = phase.relativeStart + task.relativeEnd * (phase.relativeEnd - phase.relativeStart);
            const bmRelativeSection = taskBarStart + barMilestone.relativePosition * (taskBarEnd - taskBarStart);
            const bmViewport = sectionToViewportRelative(bmRelativeSection, section, viewport);
            const bmX = timelineX + bmViewport * timelineWidth;
            const bmY = y + scaledTaskRowHeight / 2;

            // Draw small diamond
            ctx.fillStyle = getContrastColor(phaseColor);
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            const bmSize = 3 * verticalScale;
            ctx.moveTo(bmX, bmY - bmSize);
            ctx.lineTo(bmX + bmSize, bmY);
            ctx.lineTo(bmX, bmY + bmSize);
            ctx.lineTo(bmX - bmSize, bmY);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;

            // Draw bar milestone label
            ctx.font = `${Math.max(7 * verticalScale, 6)}px system-ui, -apple-system, sans-serif`;
            ctx.fillStyle = colors.textMuted;
            ctx.textAlign = 'left';
            ctx.fillText(barMilestone.name, bmX + bmSize + 2, bmY + 2, 50);
          }
        }

        y += scaledTaskRowHeight;
      }
    }
  }

  // Draw today line if in range
  const today = new Date();
  if (today >= viewport.startDate && today <= viewport.endDate) {
    const todayDays = differenceInDays(today, viewport.startDate);
    const todayX = timelineX + (todayDays / viewport.totalDays) * timelineWidth;

    ctx.strokeStyle = '#ef4444'; // Red color for today
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(todayX, HEADER_HEIGHT);
    ctx.lineTo(todayX, HEIGHT);
    ctx.stroke();

    // Draw today dot
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(todayX, HEADER_HEIGHT, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw label column border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_WIDTH, 0);
  ctx.lineTo(LABEL_WIDTH, HEIGHT);
  ctx.stroke();

  // Convert to blob and download
  canvas.toBlob((blob) => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.name)}-timeline.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
};
