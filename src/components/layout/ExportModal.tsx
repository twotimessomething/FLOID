import { useCallback, useEffect, useState, useMemo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { downloadProjectJson, downloadScheduleFloid } from '../../utils/exportUtils';
import { loadProjectFromStorage } from '../../utils/storageUtils';
import type { Section, Project } from '../../types';

type ExportMode = 'active-project' | 'schedules' | 'all-projects';

export function ExportModal(): JSX.Element | null {
  const { isExportModalOpen, closeExportModal } = useUIStore();
  const project = useProjectStore((state) => state.project);
  const projects = useProjectStore((state) => state.projects);
  const sections = useSectionStore((state) => state.sections);
  const showToast = useUIStore((state) => state.showToast);

  const [exportMode, setExportMode] = useState<ExportMode>('active-project');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isExportModalOpen) {
      setExportMode('active-project');
      setSelectedScheduleIds(new Set());
      setIsExporting(false);
    }
  }, [isExportModalOpen]);

  // Sorted sections for display
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections]
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
    setSelectedScheduleIds(new Set(sections.map((s) => s.id)));
  }, [sections]);

  const handleDeselectAllSchedules = useCallback(() => {
    setSelectedScheduleIds(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    if (!project) return;

    setIsExporting(true);

    try {
      if (exportMode === 'active-project') {
        await downloadProjectJson(project, sections);
        showToast('success', `Exported "${project.name}"`);
      } else if (exportMode === 'schedules') {
        if (selectedScheduleIds.size === 0) {
          showToast('error', 'Please select at least one schedule');
          setIsExporting(false);
          return;
        }

        const selectedSections = sections.filter((s) => selectedScheduleIds.has(s.id));

        // Export each schedule as a separate file
        for (const section of selectedSections) {
          await downloadScheduleFloid(project, section);
        }

        const count = selectedSections.length;
        showToast('success', `Exported ${count} schedule${count > 1 ? 's' : ''}`);
      } else if (exportMode === 'all-projects') {
        let exportedCount = 0;

        for (const projectEntry of projects) {
          // For the active project, use current state
          if (projectEntry.id === project.id) {
            await downloadProjectJson(project, sections);
            exportedCount++;
          } else {
            // Load the full project from storage
            const fullProjectData = await loadFullProject(projectEntry.id);
            if (fullProjectData) {
              await downloadProjectJson(fullProjectData.project, fullProjectData.sections);
              exportedCount++;
            }
          }
        }

        showToast('success', `Exported ${exportedCount} project${exportedCount > 1 ? 's' : ''}`);
      }

      closeExportModal();
    } catch (error) {
      console.error('Export failed:', error);
      showToast('error', 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [
    project,
    sections,
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

  if (!isExportModalOpen || !project) {
    return null;
  }

  const canExport =
    exportMode === 'active-project' ||
    exportMode === 'all-projects' ||
    (exportMode === 'schedules' && selectedScheduleIds.size > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/20">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]" id="export-title">
            Export
          </h2>
          <button
            onClick={closeExportModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 rounded-md hover:bg-black/5 focus-ring btn-press"
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
            <label className="text-sm font-medium text-[var(--color-text-primary)]">
              What to export
            </label>

            {/* Active project option */}
            <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-[var(--color-hover)] transition-colors">
              <input
                type="radio"
                name="exportMode"
                value="active-project"
                checked={exportMode === 'active-project'}
                onChange={() => setExportMode('active-project')}
                className="mt-0.5 accent-[var(--color-focus)]"
              />
              <div>
                <span className="text-sm text-[var(--color-text-primary)] font-medium">
                  Active project
                </span>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Export "{project.name}" as a .floid file
                </p>
              </div>
            </label>

            {/* Specific schedules option */}
            <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-[var(--color-hover)] transition-colors">
              <input
                type="radio"
                name="exportMode"
                value="schedules"
                checked={exportMode === 'schedules'}
                onChange={() => setExportMode('schedules')}
                className="mt-0.5 accent-[var(--color-focus)]"
              />
              <div className="flex-1">
                <span className="text-sm text-[var(--color-text-primary)] font-medium">
                  Specific schedules
                </span>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Export individual schedules from the active project
                </p>
              </div>
            </label>

            {/* Schedule selection (shown when schedules mode is selected) */}
            {exportMode === 'schedules' && (
              <div className="ml-6 pl-3 border-l-2 border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {selectedScheduleIds.size} of {sections.length} selected
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
                      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--color-hover)] cursor-pointer"
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
                      <span className="text-sm text-[var(--color-text-primary)] truncate">
                        {section.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* All projects option */}
            {projects.length > 1 && (
              <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-[var(--color-hover)] transition-colors">
                <input
                  type="radio"
                  name="exportMode"
                  value="all-projects"
                  checked={exportMode === 'all-projects'}
                  onChange={() => setExportMode('all-projects')}
                  className="mt-0.5 accent-[var(--color-focus)]"
                />
                <div>
                  <span className="text-sm text-[var(--color-text-primary)] font-medium">
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
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-white/20">
          <button
            onClick={closeExportModal}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport || isExporting}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-focus)] hover:bg-[var(--color-focus-hover)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to load full project data for export
async function loadFullProject(
  projectId: string
): Promise<{ project: Project; sections: Section[] } | null> {
  const data = await loadProjectFromStorage(projectId);
  if (!data?.project) return null;
  return { project: data.project, sections: data.sections || [] };
}
