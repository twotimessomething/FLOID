import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useConfirm } from '../../hooks';
import { downloadProjectJson } from '../../utils/exportUtils';
import { loadProjectFromStorage } from '../../utils/storageUtils';

export function LeftSidebar() {
  const confirm = useConfirm();

  // Use selective store subscriptions to prevent unnecessary re-renders
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const project = useProjectStore((state) => state.project);
  const { selectProject, deleteProject, saveCurrentProject, updateProjectIndex, updateProject } = useProjectStore();

  const sections = useSectionStore((state) => state.sections);
  const loadSectionsForProject = useSectionStore((state) => state.loadSectionsForProject);

  const isLeftSidebarOpen = useUIStore((state) => state.isLeftSidebarOpen);
  const { toggleLeftSidebar, closeModal, openProjectSetupModal, openProjectEditModal } = useUIStore();
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [menuOpenProjectId, setMenuOpenProjectId] = useState<string | null>(null);
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
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenProjectId(null);
      }
    };

    if (menuOpenProjectId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpenProjectId]);

  const handleToggleMenu = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenProjectId((prev) => (prev === projectId ? null : projectId));
  }, []);

  const handleEditProject = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenProjectId(null);

    // If not the active project, switch to it first
    if (projectId !== activeProjectId) {
      saveCurrentProject(sections);
      closeModal();
      selectProject(projectId);
      loadSectionsForProject(projectId);
    }

    // Open the edit modal
    openProjectEditModal(projectId);
  }, [activeProjectId, sections, saveCurrentProject, closeModal, selectProject, loadSectionsForProject, openProjectEditModal]);

  const handleExportProject = useCallback(async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenProjectId(null);

    // If it's the active project, use current project and sections from store
    if (projectId === activeProjectId) {
      await downloadProjectJson(project, sections);
      return;
    }

    // For non-active projects, load directly from storage without switching
    const projectData = await loadProjectFromStorage(projectId);
    if (projectData) {
      await downloadProjectJson(projectData.project, projectData.sections);
    }
  }, [activeProjectId, project, sections]);

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
      <button
        onClick={toggleLeftSidebar}
        className="flex-shrink-0 w-10 h-full border-r border-[var(--color-border)] bg-[var(--color-background)] flex items-start justify-center pt-4 hover:bg-[var(--color-hover)] transition-colors duration-150"
        aria-label="Open sidebar"
      >
        <svg
          className="w-4 h-4 text-[var(--color-text-secondary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="flex-shrink-0 w-56 border-r border-[var(--color-border)] bg-[var(--color-background)] flex flex-col">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleNewProject}
            title="New Project"
            className="w-5 h-5 flex items-center justify-center rounded-full border border-current text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">Projects</h2>
        </div>
        <button
          onClick={toggleLeftSidebar}
          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-active)] rounded-md transition-colors duration-150"
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
        <div className="space-y-1">
          {sortedProjects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => handleSelectProject(proj.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors duration-150 ${
                proj.id === activeProjectId
                  ? 'bg-[var(--color-active)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <svg
                  className={`w-4 h-4 flex-shrink-0 ${
                    proj.id === activeProjectId ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-muted)]'
                  }`}
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
                    className="text-sm bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-[var(--color-text-secondary)] min-w-0 flex-1"
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => handleStartEditing(proj.id, proj.name, e)}
                    className="text-sm truncate"
                  >
                    {proj.name}
                  </span>
                )}
              </div>
              <div className="relative" ref={menuOpenProjectId === proj.id ? menuRef : undefined}>
                <button
                  onClick={(e) => handleToggleMenu(proj.id, e)}
                  className={`p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded transition-all duration-150 ${
                    menuOpenProjectId === proj.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  aria-label="Project options"
                  aria-haspopup="true"
                  aria-expanded={menuOpenProjectId === proj.id}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>

                {/* Dropdown menu */}
                {menuOpenProjectId === proj.id && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 z-10">
                    <button
                      onClick={(e) => handleEditProject(proj.id, e)}
                      className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors duration-150"
                    >
                      Edit project...
                    </button>
                    <button
                      onClick={(e) => handleExportProject(proj.id, e)}
                      className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors duration-150"
                    >
                      Export project...
                    </button>
                    <button
                      onClick={(e) => {
                        setMenuOpenProjectId(null);
                        handleDeleteProject(proj.id, e);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] transition-colors duration-150"
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

    </aside>
  );
}
