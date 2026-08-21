import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useConfirm } from '../../hooks';
import { POPOVER_EXIT_MS } from '../../hooks/usePresence';

/**
 * The panel, and the rail it folds down to. Both are fixed numbers so the
 * contents can keep their own width and be clipped as the box narrows, rather
 * than re-wrapping their text on every frame of the fold.
 */
const PANEL_WIDTH = 224;
const RAIL_WIDTH = 32;

export function LeftSidebar(): JSX.Element {
  const confirm = useConfirm();

  // Use selective store subscriptions to prevent unnecessary re-renders
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const { selectProject, deleteProject, saveCurrentProject, updateProjectIndex, updateProject } = useProjectStore();

  const sections = useSectionStore((state) => state.sections);
  const loadSectionsForProject = useSectionStore((state) => state.loadSectionsForProject);

  const isLeftSidebarOpen = useUIStore((state) => state.isLeftSidebarOpen);
  const { toggleLeftSidebar, closeModal, openProjectSetupModal } = useUIStore();
  const openExportModal = useUIStore((state) => state.openExportModal);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [menuOpenProjectId, setMenuOpenProjectId] = useState<string | null>(null);
  /**
   * The project menu that just closed, held for the length of its exit.
   * One popover per project rules out a plain open/closed flag, so the id
   * itself is what is kept.
   */
  const [leavingMenuProjectId, setLeavingMenuProjectId] = useState<string | null>(null);
  const previousMenuProjectId = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSelectProject = useCallback(
    (projectId: string) => {
      if (projectId === activeProjectId) return;

      // Save current project before switching
      saveCurrentProject(sections);

      // Clear any selection
      closeModal();

      // Switch to new project
      selectProject(projectId);
      loadSectionsForProject(projectId);
    },
    [
      activeProjectId,
      sections,
      saveCurrentProject,
      selectProject,
      loadSectionsForProject,
      closeModal,
    ]
  );

  const handleNewProject = useCallback(() => {
    openProjectSetupModal();
  }, [openProjectSetupModal]);

  const clearSections = useSectionStore((state) => state.clearSections);

  const handleDeleteProject = useCallback(
    async (projectId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      const projectToDelete = projects.find((p) => p.id === projectId);
      if (!projectToDelete) return;

      const confirmed = await confirm({
        title: 'Delete Project',
        message: `Delete "${projectToDelete.name}"?\n\nThis cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });

      if (confirmed) {
        deleteProject(projectId);

        // If we deleted the active project, load the new active one (if any remain)
        const newActiveId = useProjectStore.getState().activeProjectId;
        if (newActiveId) {
          loadSectionsForProject(newActiveId);
        } else {
          // No projects left, clear sections
          clearSections();
        }
      }
    },
    [projects, deleteProject, loadSectionsForProject, clearSections, confirm]
  );

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingProjectId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingProjectId]);

  const handleStartEditing = useCallback((projectId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(projectId);
    setEditedName(currentName);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingProjectId) return;

    const trimmedName = editedName.trim();
    if (trimmedName) {
      updateProjectIndex(editingProjectId, { name: trimmedName });
      // If editing the active project, also update the current project state
      if (editingProjectId === activeProjectId) {
        updateProject({ name: trimmedName });
      }
    }
    setEditingProjectId(null);
    setEditedName('');
  }, [editingProjectId, editedName, updateProjectIndex, activeProjectId, updateProject]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingProjectId(null);
      setEditedName('');
    }
  }, [handleSaveEdit]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenProjectId(null);
      }
    };

    if (menuOpenProjectId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpenProjectId]);

  useEffect(() => {
    const previous = previousMenuProjectId.current;
    previousMenuProjectId.current = menuOpenProjectId;
    if (!previous || previous === menuOpenProjectId) return;
    setLeavingMenuProjectId(previous);
    const timer = window.setTimeout(() => setLeavingMenuProjectId(null), POPOVER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [menuOpenProjectId]);

  const handleToggleMenu = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenProjectId((prev) => (prev === projectId ? null : projectId));
  }, []);

  /**
   * Every project export goes through the one dialog, scoped to the row it was
   * opened from. Scoping is not opening: a project other than the active one is
   * read from storage by the modal, and the user stays where they were.
   */
  const handleExportProject = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenProjectId(null);
    openExportModal(projectId);
  }, [openExportModal]);

  // Sort projects by most recently updated - memoize to avoid recalculating on every render
  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [projects]
  );

  if (!isLeftSidebarOpen) {
    return (
      <aside
        className="flex-shrink-0 h-full overflow-hidden bg-[var(--color-background)] border-r border-[var(--color-hairline)] sidebar-fold"
        style={{ width: RAIL_WIDTH }}
      >
        <button
          onClick={toggleLeftSidebar}
          className="sidebar-enter group w-8 h-full flex items-start justify-center pt-4 focus-ring"
          aria-label="Open sidebar"
        >
          <svg
            className="w-4 h-4 text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100 transition-opacity duration-fast"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="flex-shrink-0 h-full overflow-hidden bg-[var(--color-background)] border-r border-[var(--color-hairline)] sidebar-fold"
      style={{ width: PANEL_WIDTH }}
    >
      <div className="sidebar-enter w-56 h-full flex flex-col">
        {/* Header with collapse button */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleNewProject}
              title="New Project"
              aria-label="New Project"
              className="w-5 h-5 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-fast focus-ring"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <h2 className="eyebrow">Projects</h2>
          </div>
          <button
            onClick={toggleLeftSidebar}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-fast focus-ring"
            aria-label="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto p-2">
          {sortedProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <p className="text-sm text-[var(--color-text-muted)]">
                No projects yet
              </p>
            </div>
          ) : (
          <div className="space-y-0.5">
            {sortedProjects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => handleSelectProject(proj.id)}
                className={`row-selectable group flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] cursor-pointer ${
                  proj.id === activeProjectId
                    ? 'selected text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-text-muted)] opacity-40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {editingProjectId === proj.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleEditKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="text-body bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-[var(--color-text-secondary)] min-w-0 flex-1"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => handleStartEditing(proj.id, proj.name, e)}
                      className="text-body truncate"
                    >
                      {proj.name}
                    </span>
                  )}
                </div>
                <div className="relative" ref={menuOpenProjectId === proj.id ? menuRef : undefined}>
                  <button
                    onClick={(e) => handleToggleMenu(proj.id, e)}
                    className="row-affordance p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-sm)] transition-colors duration-fast"
                    data-always-visible={menuOpenProjectId === proj.id}
                    aria-label="Project options"
                    aria-haspopup="true"
                    aria-expanded={menuOpenProjectId === proj.id}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {(menuOpenProjectId === proj.id || leavingMenuProjectId === proj.id) && (
                    <div
                      className={`absolute right-0 top-full mt-1 w-36 bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-md py-1 z-10 [--popover-origin:top_right] ${
                        menuOpenProjectId === proj.id ? 'popover-enter' : 'popover-leave'
                      }`}
                    >
                      <button
                        onClick={(e) => handleExportProject(proj.id, e)}
                        className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors duration-fast"
                      >
                        Export project...
                      </button>
                      <button
                        onClick={(e) => {
                          setMenuOpenProjectId(null);
                          handleDeleteProject(proj.id, e);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] transition-colors duration-fast"
                      >
                        Delete project
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </aside>
  );
}
