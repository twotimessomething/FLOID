import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';

/**
 * Delete a project, and open whichever one takes its place.
 *
 * Deleting a project that is not open leaves the sheet alone: reloading it
 * would throw away edits autosave has not written yet, and wipe undo. Only a
 * change of open project loads anything — the next one in the list, or an
 * empty sheet when the last project goes.
 *
 * Returns whether the open project changed.
 */
export async function deleteProjectAndOpenNext(projectId: string): Promise<boolean> {
  const before = useProjectStore.getState().activeProjectId;
  await useProjectStore.getState().deleteProject(projectId);

  const after = useProjectStore.getState().activeProjectId;
  if (after === before) return false;

  const { loadSectionsForProject, clearSections } = useSectionStore.getState();
  if (after) {
    await loadSectionsForProject(after);
  } else {
    clearSections();
    useSectionStore.temporal.getState().clear();
  }
  return true;
}
