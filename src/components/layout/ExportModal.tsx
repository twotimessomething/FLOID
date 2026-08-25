import { useCallback, useEffect, useState, useMemo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import {
  downloadProjectJson,
  downloadScheduleFloid,
  exportScheduleToFloid,
  exportToJson,
  projectFloidFilename,
  scheduleFloidFilename,
  stampBackupDate,
} from '../../utils/exportUtils';
import { pickDirectory, supportsDirectorySave, writeFileInDirectory } from '../../platform/files';
import { loadProjectFromStorage } from '../../utils/storageUtils';
import { Button } from '../common/Button';
import type { DependencyEdge, Section, Project } from '../../types';
import { usePresence } from '../../hooks/usePresence';

type ExportMode = 'active-project' | 'schedules' | 'all-projects';

/** A schedule list is only ever read here, so one empty array serves them all. */
const NO_SECTIONS: readonly Section[] = [];
const NO_DEPENDENCIES: readonly DependencyEdge[] = [];

/** The project a scoped modal is exporting, once it has been read off disk. */
interface ScopedProject {
  readonly project: Project;
  readonly sections: Section[];
  readonly dependencies: DependencyEdge[];
}

export function ExportModal(): JSX.Element | null {
  const isExportModalOpen = useUIStore((state) => state.isExportModalOpen);
  const closeExportModal = useUIStore((state) => state.closeExportModal);
  const scopedProjectId = useUIStore((state) => state.exportModalProjectId);
  const project = useProjectStore((state) => state.project);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const showToast = useUIStore((state) => state.showToast);

  const [exportMode, setExportMode] = useState<ExportMode>('active-project');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [scoped, setScoped] = useState<ScopedProject | null>(null);

  const isScoped = scopedProjectId !== null;
  /** Scoped to a project that is not open: it has to be read from storage. */
  const isScopedElsewhere = isScoped && scopedProjectId !== activeProjectId;

  // Reset state when modal opens
  useEffect(() => {
    if (isExportModalOpen) {
      setExportMode('active-project');
      setSelectedScheduleIds(new Set());
      setIsExporting(false);
    }
  }, [isExportModalOpen]);

  /**
   * Read a scoped project straight from storage. Opening its export dialog is
   * not opening the project, so nothing here touches the active project.
   */
  useEffect(() => {
    if (!isScopedElsewhere || !scopedProjectId) {
      setScoped(null);
      return;
    }

    // Held through the exit so the leaving panel keeps its contents; the next
    // open re-reads, so a rename made in the meantime is never exported stale.
    if (!isExportModalOpen) return;

    let isCurrent = true;
    void loadFullProject(scopedProjectId).then((data) => {
      if (isCurrent) setScoped(data);
    });

    return () => {
      isCurrent = false;
    };
  }, [isExportModalOpen, isScopedElsewhere, scopedProjectId]);

  // What this dialog actually exports: the scoped project, or the open one
  const targetProject = isScopedElsewhere ? scoped?.project ?? null : project;
  const targetSections = isScopedElsewhere ? scoped?.sections ?? NO_SECTIONS : sections;
  const targetDependencies = isScopedElsewhere
    ? scoped?.dependencies ?? NO_DEPENDENCIES
    : dependencies;

  /**
   * The index already knows what the scoped project is called, so the dialog
   * can name it on the first frame rather than waiting out the storage read.
   */
  const scopedIndexName = useMemo(
    () => (scopedProjectId ? projects.find((p) => p.id === scopedProjectId)?.name ?? null : null),
    [projects, scopedProjectId]
  );

  // Sorted sections for display
  const sortedSections = useMemo(
    () => [...targetSections].sort((a, b) => a.order - b.order),
    [targetSections]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeExportModal();
      }
    },
    [closeExportModal]
  );

  const handleScheduleToggle = useCallback((sectionId: string) => {
    setSelectedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleSelectAllSchedules = useCallback(() => {
    setSelectedScheduleIds(new Set(targetSections.map((s) => s.id)));
  }, [targetSections]);

  const handleDeselectAllSchedules = useCallback(() => {
    setSelectedScheduleIds(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    if (!targetProject) return;

    setIsExporting(true);

    try {
      if (exportMode === 'active-project') {
        await downloadProjectJson(targetProject, [...targetSections], targetDependencies);
        showToast('success', `Exported "${targetProject.name}"`);
      } else if (exportMode === 'schedules') {
        if (selectedScheduleIds.size === 0) {
          showToast('error', 'Please select at least one schedule');
          setIsExporting(false);
          return;
        }

        const selectedSections = targetSections.filter((s) => selectedScheduleIds.has(s.id));

        if (selectedSections.length > 1 && supportsDirectorySave()) {
          const files = selectedSections.map((section) => ({
            filename: scheduleFloidFilename(targetProject, section),
            contents: JSON.stringify(
              exportScheduleToFloid(targetProject, section, targetDependencies),
              null,
              2
            ),
          }));
          if (!(await exportIntoDirectory(files))) {
            setIsExporting(false);
            return;
          }
        } else {
          for (const section of selectedSections) {
            await downloadScheduleFloid(targetProject, section, targetDependencies);
          }
        }

        const count = selectedSections.length;
        showToast('success', `Exported ${count} schedule${count > 1 ? 's' : ''}`);
      } else if (exportMode === 'all-projects') {
        const projectFiles: ScopedProject[] = [];
        for (const projectEntry of projects) {
          // For the active project, use current state
          if (projectEntry.id === targetProject.id) {
            projectFiles.push({
              project: targetProject,
              sections: [...targetSections],
              dependencies: [...targetDependencies],
            });
          } else {
            const fullProjectData = await loadFullProject(projectEntry.id);
            if (fullProjectData) projectFiles.push(fullProjectData);
          }
        }

        if (projectFiles.length > 1 && supportsDirectorySave()) {
          const files = projectFiles.map((entry) => ({
            filename: projectFloidFilename(entry.project),
            contents: exportToJson(entry.project, entry.sections, entry.dependencies),
          }));
          if (!(await exportIntoDirectory(files))) {
            setIsExporting(false);
            return;
          }
          await stampBackupDate();
        } else {
          for (const entry of projectFiles) {
            await downloadProjectJson(entry.project, entry.sections, entry.dependencies);
          }
        }

        const count = projectFiles.length;
        showToast('success', `Exported ${count} project${count > 1 ? 's' : ''}`);
      }

      closeExportModal();
    } catch (error) {
      console.error('Export failed:', error);
      showToast('error', 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [
    targetProject,
    targetSections,
    targetDependencies,
    projects,
    exportMode,
    selectedScheduleIds,
    showToast,
    closeExportModal,
  ]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeExportModal();
      }
    };

    if (isExportModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isExportModalOpen, closeExportModal]);

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(
    isExportModalOpen && (project !== null || isScopedElsewhere)
  );
  if (!isMounted) return null;

  const projectName = targetProject?.name ?? scopedIndexName ?? '';

  const canExport =
    targetProject !== null &&
    (exportMode === 'active-project' ||
      exportMode === 'all-projects' ||
      (exportMode === 'schedules' && selectedScheduleIds.size > 0));

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-title font-medium text-[var(--color-text-primary)]" id="export-title">
            Export
          </h2>
          <button
            onClick={closeExportModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
            aria-label="Close (Escape)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Export options */}
          <div className="space-y-2">
            <label className="text-body font-medium text-[var(--color-text-primary)]">
              What to export
            </label>

            {/* Active project option */}
            <label className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--color-hover)]">
              <input
                type="radio"
                name="exportMode"
                value="active-project"
                checked={exportMode === 'active-project'}
                onChange={() => setExportMode('active-project')}
                className="mt-0.5 accent-[var(--color-focus)]"
              />
              <div>
                <span className="text-body text-[var(--color-text-primary)] font-medium">
                  {isScoped ? projectName : 'Active project'}
                </span>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {isScoped
                    ? 'Export this project as a .floid file'
                    : `Export "${projectName}" as a .floid file`}
                </p>
              </div>
            </label>

            {/* Specific schedules option */}
            <label className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--color-hover)]">
              <input
                type="radio"
                name="exportMode"
                value="schedules"
                checked={exportMode === 'schedules'}
                onChange={() => setExportMode('schedules')}
                className="mt-0.5 accent-[var(--color-focus)]"
              />
              <div className="flex-1">
                <span className="text-body text-[var(--color-text-primary)] font-medium">
                  Specific schedules
                </span>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {isScoped
                    ? 'Export individual schedules from this project'
                    : 'Export individual schedules from the active project'}
                </p>
              </div>
            </label>

            {/* Schedule selection (shown when schedules mode is selected) */}
            {exportMode === 'schedules' && (
              <div className="ml-6 pl-3 border-l-2 border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {selectedScheduleIds.size} of {targetSections.length} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAllSchedules}
                      className="text-xs text-[var(--color-focus)] hover:underline"
                    >
                      All
                    </button>
                    <button
                      onClick={handleDeselectAllSchedules}
                      className="text-xs text-[var(--color-text-secondary)] hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {sortedSections.map((section) => (
                    <label
                      key={section.id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScheduleIds.has(section.id)}
                        onChange={() => handleScheduleToggle(section.id)}
                        className="accent-[var(--color-focus)]"
                      />
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      />
                      <span className="text-body text-[var(--color-text-primary)] truncate">
                        {section.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Every project — meaningless once the dialog is scoped to one */}
            {!isScoped && projects.length > 1 && (
              <label className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--color-hover)]">
                <input
                  type="radio"
                  name="exportMode"
                  value="all-projects"
                  checked={exportMode === 'all-projects'}
                  onChange={() => setExportMode('all-projects')}
                  className="mt-0.5 accent-[var(--color-focus)]"
                />
                <div>
                  <span className="text-body text-[var(--color-text-primary)] font-medium">
                    All projects
                  </span>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    Export all {projects.length} projects as separate .floid files
                  </p>
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4">
          <Button variant="ghost" onClick={closeExportModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={!canExport || isExporting}>
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Many files, one dialog: where the platform can hand over a directory, N
 * exports become one picker and N writes instead of N competing downloads.
 * Returns false when the user cancels the picker. Duplicate names are
 * uniquified — a directory write overwrites where a download would dedupe.
 */
async function exportIntoDirectory(
  files: readonly { filename: string; contents: string }[]
): Promise<boolean> {
  const token = await pickDirectory({ id: 'floid-export' });
  if (!token) return false;

  const used = new Set<string>();
  for (const file of files) {
    let name = file.filename;
    for (let n = 2; used.has(name); n += 1) {
      name = file.filename.replace(/\.floid$/, `-${n}.floid`);
    }
    used.add(name);
    await writeFileInDirectory(token, name, file.contents);
  }
  return true;
}

// Helper to load full project data for export
async function loadFullProject(projectId: string): Promise<ScopedProject | null> {
  const data = await loadProjectFromStorage(projectId);
  if (!data?.project) return null;
  return {
    project: data.project,
    sections: data.sections || [],
    dependencies: data.dependencies ?? [],
  };
}
