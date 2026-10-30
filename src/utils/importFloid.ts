import { parseProjectJson, convertImportedProject } from './exportUtils';
import { extractJson, isAuthoringDocument, readAuthoringDocument } from './floidAuthoring';
import { sectionsExtent } from './itemTree';
import { revealRow } from './revealRow';
import { todayKey } from './dayKeys';
import { uniqueName } from './uniqueName';
import { commitWithSlide } from '../commands/slideCommit';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { DEFAULT_PROJECT_SETTINGS } from '../types/project';
import type { Project } from '../types/project';
import type { Section } from '../types/timeline';
import type { FileFilter } from '../platform/types';

/**
 * What the Open dialog offers — the same set Finder hands the Mac app. Both of
 * today's wire formats save as `.floid`; earlier backups may carry
 * `.floid-project` or `.json`.
 */
export const FLOID_OPEN_FILTERS: readonly FileFilter[] = [
  { name: 'FLOID Files', extensions: ['floid', 'floid-project', 'json'] },
];

/** Whether a file's name is one the Open dialog would offer it under. */
export const isFloidFileName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return FLOID_OPEN_FILTERS.some((filter) =>
    filter.extensions.some((extension) => lower.endsWith(`.${extension}`))
  );
};

/** What a file that is not ours hears back, whichever door it came in by. */
export const showNotFloidFileToast = (fileName?: string): void => {
  const subject = fileName ? `“${fileName}”` : 'this file';
  useUIStore.getState().showToast('error', `Couldn’t open ${subject}. It isn’t a FLOID file.`);
};

export interface ImportFloidDeps {
  /**
   * `useScheduleImport().handleImport` — the schedule path runs through the
   * import-confirm modal, so it has to come from a hook. Without one, the
   * handler App parks below is used.
   */
  readonly handleScheduleImport?: (jsonText: string) => void;
  /** Named in the message if the file turns out not to be a FLOID file. */
  readonly fileName?: string;
}

export type ImportFloidOutcome = 'schedule' | 'project' | 'authored' | 'invalid';

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
 * `parseProjectJson` knows). A file that is neither says so here, so no door
 * can open onto silence.
 */
export const importFloidText = async (
  text: string,
  deps?: ImportFloidDeps
): Promise<ImportFloidOutcome> => {
  try {
    const parsed = JSON.parse(text) as { format?: string };
    if (isAuthoringDocument(parsed)) {
      const result = await importAuthoredText(text);
      if (result.ok) return 'authored';
      // A file has no panel to list every problem in; the panel does
      const [first, ...rest] = result.errors;
      const more =
        rest.length > 0
          ? ` Paste the file into Build with AI to see all ${result.errors.length} problems.`
          : '';
      useUIStore.getState().showToast('error', `Couldn’t build this schedule. ${first}${more}`);
      return 'invalid';
    }
    if (parsed.format === 'floid') {
      const handler = deps?.handleScheduleImport ?? scheduleImportHandler;
      // The file is fine; only App is not up yet to take it
      if (!handler) return 'invalid';
      handler(text);
      return 'schedule';
    }
  } catch {
    // Not JSON at all — parseProjectJson below reports that as invalid.
  }

  const exportData = parseProjectJson(text);
  if (!exportData) {
    showNotFloidFileToast(deps?.fileName);
    return 'invalid';
  }

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

  const newProjectId = await importProject(importedProject, importedSections, importedDependencies);
  await selectProject(newProjectId);
  await loadSectionsForProject(newProjectId);

  useUIStore.getState().showToast('success', `Imported project “${importedProject.name}”`);
  return 'project';
};

export type AuthoredImportResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Bring in a document written in the authoring format — pasted from an AI's
 * reply, or opened as a file one saved. Into the open project its schedules
 * go below the ones already there, as one undoable step; with no project open
 * they become a new one. Nothing is written unless the whole document reads.
 */
export const importAuthoredText = async (text: string): Promise<AuthoredImportResult> => {
  const doc = extractJson(text);
  if (doc === undefined) {
    return {
      ok: false,
      errors: ['No FLOID document found. Paste the AI’s whole reply, including the { … } block.'],
    };
  }

  const { project, activeProjectId, setPinnedSection } = useProjectStore.getState();
  const { sections, dependencies, setSectionsAndDependencies } = useSectionStore.getState();
  const result = readAuthoringDocument(doc, project ? sections : []);
  if (!result.ok) return result;
  const { plan } = result;

  const showToast = useUIStore.getState().showToast;
  const describeAdded = (added: readonly Section[]): string =>
    added.length === 1 ? `“${added[0].name}”` : `${added.length} schedules`;

  if (project && activeProjectId) {
    const taken = sections.map((section) => section.name);
    const incoming = plan.sections.map((section) => {
      const name = uniqueName(section.name, taken);
      taken.push(name);
      return { ...section, name };
    });
    commitWithSlide(() =>
      setSectionsAndDependencies(
        [...sections, ...incoming],
        [...dependencies, ...plan.dependencies]
      )
    );
    // A pin is a project-wide choice; the document only fills an empty one
    const pinned = plan.pinnedIndex === null ? null : incoming[plan.pinnedIndex];
    if (pinned && !project.pinnedSectionId) setPinnedSection(pinned.id);
    revealRow({ sectionId: incoming[0].id, itemId: null });
    showToast('success', `Added ${describeAdded(incoming)}`);
    return { ok: true };
  }

  const extent = sectionsExtent(plan.sections);
  const now = new Date().toISOString();
  const newProject: Project = {
    id: '',
    name: plan.projectName ?? 'Untitled Project',
    pinnedSectionId: plan.pinnedIndex === null ? null : plan.sections[plan.pinnedIndex].id,
    projectStartDate: extent?.start ?? todayKey(),
    projectEndDate: extent?.end ?? todayKey(),
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
  };
  const { importProject, selectProject } = useProjectStore.getState();
  const newProjectId = await importProject(newProject, [...plan.sections], [...plan.dependencies]);
  await selectProject(newProjectId);
  await useSectionStore.getState().loadSectionsForProject(newProjectId);
  showToast('success', `Created “${newProject.name}”`);
  return { ok: true };
};
