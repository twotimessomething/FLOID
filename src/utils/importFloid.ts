import { parseProjectJson, convertImportedProject } from './exportUtils';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import type { FileFilter } from '../platform/types';

/** What the Open dialog offers: both wire formats share the `.floid` extension. */
export const FLOID_OPEN_FILTERS: readonly FileFilter[] = [
  { name: 'FLOID Files', extensions: ['floid', 'json'] },
];

export interface ImportFloidDeps {
  /**
   * `useScheduleImport().handleImport` — the schedule path runs through the
   * import-confirm modal, so it has to come from the caller's hook.
   */
  readonly handleScheduleImport: (jsonText: string) => void;
}

export type ImportFloidOutcome = 'schedule' | 'project' | 'invalid';

/**
 * Callers outside React — the command registry, a native menu, a Finder
 * open — have no hook to reach the schedule-import modal flow through, so App
 * parks its handler here on mount. The same pattern as the toast helpers
 * beside `uiStore`.
 */
let scheduleImportHandler: ((jsonText: string) => void) | null = null;

export function setScheduleImportHandler(handler: (jsonText: string) => void): void {
  scheduleImportHandler = handler;
}

/**
 * One door for every `.floid` that reaches the app — file picker, drag-drop,
 * and eventually a native Open dialog or a Finder double-click. Sniffs the
 * `format` field: a single schedule goes to the confirm-modal flow, anything
 * else is read as a project file (which also covers the legacy shapes
 * `parseProjectJson` knows).
 */
export const importFloidText = async (
  text: string,
  deps?: ImportFloidDeps
): Promise<ImportFloidOutcome> => {
  try {
    const parsed = JSON.parse(text) as { format?: string };
    if (parsed.format === 'floid') {
      const handler = deps?.handleScheduleImport ?? scheduleImportHandler;
      if (!handler) return 'invalid';
      handler(text);
      return 'schedule';
    }
  } catch {
    // Not JSON at all — parseProjectJson below reports that as invalid.
  }

  const exportData = parseProjectJson(text);
  if (!exportData) return 'invalid';

  const {
    project: importedProject,
    sections: importedSections,
    dependencies: importedDependencies,
  } = convertImportedProject(exportData);

  const { activeProjectId, saveCurrentProject, importProject, selectProject } =
    useProjectStore.getState();
  const { sections, dependencies, loadSectionsForProject } = useSectionStore.getState();

  // Save the current project before switching away from it
  if (activeProjectId) {
    await saveCurrentProject(sections, dependencies);
  }

  const newProjectId = await importProject(
    importedProject,
    importedSections,
    importedDependencies
  );
  await selectProject(newProjectId);
  await loadSectionsForProject(newProjectId);

  useUIStore.getState().showToast('success', `Imported project "${importedProject.name}"`);
  return 'project';
};
