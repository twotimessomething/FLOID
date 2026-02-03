import { useCallback } from 'react';
import { parseISO } from 'date-fns';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore, selectMasterSection } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { parseScheduleFloid, analyzeScheduleImport } from '../utils/exportUtils';
import { getRelativePositionFromDate } from '../utils/dateUtils';
import type { Section, Phase, Milestone, ImportOptions } from '../types';
import type { ScheduleExportData, ExportPhase, ExportMilestone } from '../types/scheduleExport';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

interface UseScheduleImportReturn {
  handleImport: (jsonText: string) => void;
  handleConfirmAction: (options: ImportOptions) => void;
}

export function useScheduleImport(): UseScheduleImportReturn {
  const { showToast, openImportModal, importModal, closeImportModal } = useUIStore();
  const { sections, setSections } = useSectionStore();
  const masterSection = useSectionStore(selectMasterSection);
  const project = useProjectStore((state) => state.project);

  // Get the date range to use for new sections (from master section or project)
  const getDefaultDateRange = useCallback(() => {
    if (masterSection) {
      return { startDate: masterSection.startDate, endDate: masterSection.endDate };
    }
    if (project) {
      return { startDate: project.projectStartDate, endDate: project.projectEndDate };
    }
    // Fallback to current date ± 12 months
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [masterSection, project]);

  // Convert ExportPhase to Phase, optionally recalculating positions from absolute dates
  const convertPhases = useCallback(
    (
      exportPhases: ExportPhase[],
      newSectionId: string,
      preserveDates: boolean,
      targetDateRange: { startDate: string; endDate: string }
    ): Phase[] => {
      return exportPhases.map((exportPhase) => {
        const newPhaseId = generateId();

        let relativeStart = exportPhase.relativeStart;
        let relativeEnd = exportPhase.relativeEnd;

        if (preserveDates) {
          // Recalculate relative positions from absolute dates to target section
          const startDate = parseISO(exportPhase.absoluteStart);
          const endDate = parseISO(exportPhase.absoluteEnd);

          relativeStart = getRelativePositionFromDate(
            targetDateRange.startDate,
            targetDateRange.endDate,
            startDate
          );
          relativeEnd = getRelativePositionFromDate(
            targetDateRange.startDate,
            targetDateRange.endDate,
            endDate
          );

          // Clip to valid range [0, 1]
          relativeStart = Math.max(0, Math.min(1, relativeStart));
          relativeEnd = Math.max(0, Math.min(1, relativeEnd));

          // Ensure end is after start
          if (relativeEnd <= relativeStart) {
            relativeEnd = Math.min(1, relativeStart + 0.01);
          }
        }

        // Tasks keep their relative positions within the phase
        const tasks = exportPhase.tasks.map((t) => ({
          ...t,
          id: generateId(),
          phaseId: newPhaseId,
        }));

        // Create the phase without the export-specific fields
        const phase: Phase = {
          id: newPhaseId,
          sectionId: newSectionId,
          name: exportPhase.name,
          description: exportPhase.description,
          color: exportPhase.color,
          order: exportPhase.order,
          isCollapsed: exportPhase.isCollapsed,
          relativeStart,
          relativeEnd,
          tasks,
        };

        return phase;
      });
    },
    []
  );

  // Convert ExportMilestone to Milestone, optionally recalculating positions from absolute dates
  const convertMilestones = useCallback(
    (
      exportMilestones: ExportMilestone[],
      newSectionId: string,
      preserveDates: boolean,
      targetDateRange: { startDate: string; endDate: string }
    ): Milestone[] => {
      return exportMilestones.map((exportMilestone) => {
        let relativePosition = exportMilestone.relativePosition;

        if (preserveDates) {
          const date = parseISO(exportMilestone.absoluteDate);
          relativePosition = getRelativePositionFromDate(
            targetDateRange.startDate,
            targetDateRange.endDate,
            date
          );
          // Clip to valid range [0, 1]
          relativePosition = Math.max(0, Math.min(1, relativePosition));
        }

        const milestone: Milestone = {
          id: generateId(),
          sectionId: newSectionId,
          name: exportMilestone.name,
          description: exportMilestone.description,
          relativePosition,
          order: exportMilestone.order,
        };

        return milestone;
      });
    },
    []
  );

  const addScheduleFromData = useCallback(
    (data: ScheduleExportData, rescaleToMaster: boolean, overrideName?: string) => {
      const newSectionId = generateId();
      const scheduleName = overrideName || data.schedule.name;
      const dateRange = rescaleToMaster ? getDefaultDateRange() : {
        startDate: data.scheduleDates.startDate,
        endDate: data.scheduleDates.endDate,
      };

      const newPhases = convertPhases(data.phases, newSectionId, rescaleToMaster, dateRange);
      const newMilestones = convertMilestones(
        data.milestones,
        newSectionId,
        rescaleToMaster,
        dateRange
      );

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
        order: sections.length,
        isCollapsed: false,
        phases: newPhases,
        milestones: newMilestones,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };

      setSections([...sections, newSection]);
      showToast('success', `Added "${scheduleName}" schedule`);
    },
    [sections, setSections, showToast, convertPhases, convertMilestones, getDefaultDateRange]
  );

  const updateScheduleFromData = useCallback(
    (data: ScheduleExportData, existingSectionId: string, rescaleToMaster: boolean) => {
      const existingSection = sections.find((s) => s.id === existingSectionId);
      if (!existingSection) return;

      const dateRange = rescaleToMaster ? getDefaultDateRange() : {
        startDate: data.scheduleDates.startDate,
        endDate: data.scheduleDates.endDate,
      };

      const newPhases = convertPhases(data.phases, existingSectionId, rescaleToMaster, dateRange);
      const newMilestones = convertMilestones(
        data.milestones,
        existingSectionId,
        rescaleToMaster,
        dateRange
      );

      const now = new Date().toISOString();
      const updatedSections = sections.map((s) =>
        s.id === existingSectionId
          ? {
              ...s,
              color: data.schedule.color,
              revision: data.schedule.revision,
              lastModifiedAt: now,
              phases: newPhases,
              milestones: newMilestones,
              startDate: dateRange.startDate,
              endDate: dateRange.endDate,
            }
          : s
      );

      setSections(updatedSections);
      showToast('success', `Updated "${existingSection.name}" schedule`);
    },
    [sections, setSections, showToast, convertPhases, convertMilestones, getDefaultDateRange]
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
          // For new schedules, show modal to choose rescale option
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
          addScheduleFromData(importData, options.rescaleToMaster);
          break;

        case 'update-newer':
        case 'update-older':
        case 'update-same':
          if (existingSection) {
            updateScheduleFromData(importData, existingSection.id, options.rescaleToMaster);
          }
          break;

        case 'name-collision':
          if (options.newName) {
            addScheduleFromData(importData, options.rescaleToMaster, options.newName);
          }
          break;
      }

      closeImportModal();
    },
    [importModal, addScheduleFromData, updateScheduleFromData, closeImportModal]
  );

  return { handleImport, handleConfirmAction };
}
