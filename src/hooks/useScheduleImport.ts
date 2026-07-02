import { useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { parseScheduleFloid, analyzeScheduleImport } from '../utils/exportUtils';
import type { Section, Phase, Milestone, ImportOptions } from '../types';
import type { ScheduleExportData, ExportPhase, ExportMilestone } from '../types/scheduleExport';
import { generateId } from '../utils/idUtils';

interface UseScheduleImportReturn {
  handleImport: (jsonText: string) => void;
  handleConfirmAction: (options: ImportOptions) => void;
}

// Convert ExportPhase to Phase; imported schedules keep their original dates
const convertPhases = (exportPhases: ExportPhase[], newSectionId: string): Phase[] => {
  return exportPhases.map((exportPhase) => {
    const newPhaseId = generateId();

    // Tasks keep their relative positions within the phase
    const tasks = exportPhase.tasks.map((t) => ({
      ...t,
      id: generateId(),
      phaseId: newPhaseId,
    }));

    // Create the phase without the export-specific fields
    return {
      id: newPhaseId,
      sectionId: newSectionId,
      name: exportPhase.name,
      description: exportPhase.description,
      color: exportPhase.color,
      order: exportPhase.order,
      isCollapsed: exportPhase.isCollapsed,
      relativeStart: exportPhase.relativeStart,
      relativeEnd: exportPhase.relativeEnd,
      tasks,
    };
  });
};

// Convert ExportMilestone to Milestone
const convertMilestones = (exportMilestones: ExportMilestone[], newSectionId: string): Milestone[] => {
  return exportMilestones.map((exportMilestone) => ({
    id: generateId(),
    sectionId: newSectionId,
    name: exportMilestone.name,
    description: exportMilestone.description,
    relativePosition: exportMilestone.relativePosition,
    order: exportMilestone.order,
  }));
};

export function useScheduleImport(): UseScheduleImportReturn {
  const { showToast, openImportModal, importModal, closeImportModal } = useUIStore();
  const { sections, setSections } = useSectionStore();
  const project = useProjectStore((state) => state.project);

  const addScheduleFromData = useCallback(
    (data: ScheduleExportData, overrideName?: string) => {
      const newSectionId = generateId();
      const scheduleName = overrideName || data.schedule.name;

      const now = new Date().toISOString();
      const newSection: Section = {
        id: newSectionId,
        type: 'schedule',
        name: scheduleName,
        templateId: data.schedule.templateId,
        revision: data.schedule.revision,
        lastModifiedAt: now,
        sourceProjectId: data.sourceProjectId,
        sourceProjectName: data.sourceProjectName,
        color: data.schedule.color,
        isMulticolor: data.schedule.isMulticolor,
        order: sections.length,
        isCollapsed: false,
        phases: convertPhases(data.phases, newSectionId),
        milestones: convertMilestones(data.milestones, newSectionId),
        startDate: data.scheduleDates.startDate,
        endDate: data.scheduleDates.endDate,
      };

      setSections([...sections, newSection]);
      showToast('success', `Added "${scheduleName}" schedule`);
    },
    [sections, setSections, showToast]
  );

  const updateScheduleFromData = useCallback(
    (data: ScheduleExportData, existingSectionId: string) => {
      const existingSection = sections.find((s) => s.id === existingSectionId);
      if (!existingSection) return;

      const now = new Date().toISOString();
      const updatedSections = sections.map((s) =>
        s.id === existingSectionId
          ? {
              ...s,
              color: data.schedule.color,
              isMulticolor: data.schedule.isMulticolor,
              revision: data.schedule.revision,
              lastModifiedAt: now,
              phases: convertPhases(data.phases, existingSectionId),
              milestones: convertMilestones(data.milestones, existingSectionId),
              startDate: data.scheduleDates.startDate,
              endDate: data.scheduleDates.endDate,
            }
          : s
      );

      setSections(updatedSections);
      showToast('success', `Updated "${existingSection.name}" schedule`);
    },
    [sections, setSections, showToast]
  );

  const handleImport = useCallback(
    (jsonText: string) => {
      const data = parseScheduleFloid(jsonText);
      if (!data || !project) {
        showToast('error', 'Invalid .floid file format');
        return;
      }

      const analysis = analyzeScheduleImport(data, project, sections);

      switch (analysis.type) {
        case 'new-schedule':
          openImportModal('new-schedule', analysis);
          break;

        case 'update-newer':
        case 'update-older':
        case 'update-same':
          // Show update modal
          openImportModal('update', analysis);
          break;

        case 'name-collision':
          // Show name collision modal
          openImportModal('name-collision', analysis);
          break;
      }
    },
    [project, sections, openImportModal, showToast]
  );

  const handleConfirmAction = useCallback(
    (options: ImportOptions) => {
      const { analysis } = importModal;
      if (!analysis) return;

      const { importData, existingSection } = analysis;

      switch (analysis.type) {
        case 'new-schedule':
          addScheduleFromData(importData);
          break;

        case 'update-newer':
        case 'update-older':
        case 'update-same':
          if (existingSection) {
            updateScheduleFromData(importData, existingSection.id);
          }
          break;

        case 'name-collision':
          if (options.newName) {
            addScheduleFromData(importData, options.newName);
          }
          break;
      }

      closeImportModal();
    },
    [importModal, addScheduleFromData, updateScheduleFromData, closeImportModal]
  );

  return { handleImport, handleConfirmAction };
}
