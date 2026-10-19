import { useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { isDesktop } from '../platform/detect';
import { setNativeWindowTitle } from '../platform/windowTitle';

const APP_NAME = 'FLOID';

/**
 * What the tab says before any project is open: index.html's own title,
 * written for search. Read once, before anything here replaces it.
 */
const SEARCH_TITLE = typeof document === 'undefined' ? APP_NAME : document.title;

/** The title for an open project. A blank name still names something. */
export function projectWindowTitle(name: string): string {
  return `${name.trim() || 'Untitled'} — ${APP_NAME}`;
}

/**
 * Names the open project in the tab, the title bar, the Window menu and
 * Mission Control.
 *
 * Until a project is open the web keeps the search title, so a first visit —
 * which is what a crawler always is — reads as it always did. The Mac app has
 * no search to answer to and simply says FLOID.
 */
export function useWindowTitle(): void {
  const name = useProjectStore((state) =>
    state.activeProjectId ? (state.project?.name ?? '') : null
  );

  useEffect(() => {
    const title =
      name === null ? (isDesktop() ? APP_NAME : SEARCH_TITLE) : projectWindowTitle(name);
    document.title = title;
    setNativeWindowTitle(title);
  }, [name]);
}
