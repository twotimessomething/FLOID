import { useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { parseScheduleFloid, analyzeScheduleImport } from '../utils/exportUtils';
import type { Section, TimelineItem } from '../types/timeline';
import type { ExportItem, ImportOptions, ScheduleExportData } from '../types/scheduleExport';
import { forEachItem, remapItemIds } from '../utils/itemTree';
import { pruneEdgesTouching, remapEdgeItemIds } from '../utils/dependencyUtils';
import { generateId } from '../utils/idUtils';

interface UseScheduleImportReturn {
  handleImport: (jsonText: string) => void;
  handleConfirmAction: (options: ImportOptions) => void;
}

/**
 * Take the imported tree as it stands — the dates in it are absolute, so nothing
 * needs recomputing — but remint every id in it, at every depth. An imported
 * schedule can otherwise collide with the one it was exported from. The id map
 * comes back filled so the file's dependency edges can follow their items.
 */
const convertItems = (
  items: readonly ExportItem[],
  newId: () => string,
  idMap: Map<string, string>
): TimelineItem[] => items.map((item) => remapItemIds(item, newId, idMap));

export function useScheduleImport(): UseScheduleImportReturn {
  const { showToast, openImportModal, importModal, closeImportModal } = useUIStore();
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const setSectionsAndDependencies = useSectionStore((state) => state.setSectionsAndDependencies);
  const project = useProjectStore((state) => state.project);

  const addScheduleFromData = useCallback(
    (data: ScheduleExportData, overrideName?: string) => {
      const scheduleName = overrideName || data.schedule.name;

      const now = new Date().toISOString();
      const idMap = new Map<string, string>();
      const newSection: Section = {
        id: generateId(),
        type: 'schedule',
        name: scheduleName,
        templateId: data.schedule.templateId,
        revision: data.schedule.revision,
        lastModifiedAt: now,
        sourceProjectId: data.sourceProjectId,
        sourceProjectName: data.sourceProjectName,
        color: data.schedule.color,
        isMulticolor: data.schedule.isMulticolor,
        isLocked: data.schedule.isLocked,
        order: sections.length,
        isCollapsed: false,
        items: convertItems(data.items, generateId, idMap),
        startDate: data.scheduleDates.startDate,
        endDate: data.scheduleDates.endDate,
      };

      // Schedule and links land together, so one undo takes the whole import
      const imported = remapEdgeItemIds(data.dependencies ?? [], idMap, generateId);
      setSectionsAndDependencies([...sections, newSection], [...dependencies, ...imported]);
      showToast('success', `Added "${scheduleName}" schedule`);
    },
    [sections, dependencies, setSectionsAndDependencies, showToast]
  );

  const updateScheduleFromData = useCallback(
    (data: ScheduleExportData, existingSectionId: string) => {
      const existingSection = sections.find((s) => s.id === existingSectionId);
      if (!existingSection) return;

      const now = new Date().toISOString();
      const idMap = new Map<string, string>();
      const updatedSections = sections.map((s) =>
        s.id === existingSectionId
          ? {
              ...s,
              color: data.schedule.color,
              isMulticolor: data.schedule.isMulticolor,
              isLocked: data.schedule.isLocked,
              revision: data.schedule.revision,
              lastModifiedAt: now,
              items: convertItems(data.items, generateId, idMap),
              startDate: data.scheduleDates.startDate,
              endDate: data.scheduleDates.endDate,
            }
          : s
      );

      // The old items are gone, so every link touching them goes too — the
      // file's own links come in on the new ids in their place. Both halves
      // land in one write, so one undo rewinds the whole update.
      const oldIds = new Set<string>();
      forEachItem(existingSection.items, (item) => oldIds.add(item.id));
      const kept = pruneEdgesTouching(dependencies, oldIds);
      const imported = remapEdgeItemIds(data.dependencies ?? [], idMap, generateId);
      setSectionsAndDependencies(updatedSections, [...kept, ...imported]);
      showToast('success', `Updated "${existingSection.name}" schedule`);
    },
    [sections, dependencies, setSectionsAndDependencies, showToast]
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
