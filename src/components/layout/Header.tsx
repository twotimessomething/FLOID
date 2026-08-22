import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { parseProjectJson, convertImportedProject, exportTimelineAsImage } from '../../utils/exportUtils';
import { useScheduleImport } from '../../hooks/useScheduleImport';
import { useFileSystemAutoSave } from '../../hooks/useFileSystemAutoSave';
import { isFileSystemAccessSupported } from '../../utils/fileSystemUtils';
import { SyncStatusIndicator } from '../common/SyncStatusIndicator';
import { ZoomControls } from '../controls/ZoomControls';
import { usePresence, POPOVER_EXIT_MS } from '../../hooks/usePresence';

function Logo(): JSX.Element {
  const theme = useUIStore((state) => state.theme);
  const [systemIsDark, setSystemIsDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => setSystemIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemIsDark);
  const src = isDark ? '/FLOID_logo_dark.svg' : '/FLOID_logo.svg';

  return <img src={src} alt="FLOID" className="h-6" />;
}

export function Header(): JSX.Element {
  // Use selective store subscriptions to prevent unnecessary re-renders
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);
  const { saveCurrentProject, importProject, selectProject } = useProjectStore();

  const loadSectionsForProject = useSectionStore((state) => state.loadSectionsForProject);

  const showToast = useUIStore((state) => state.showToast);
  const openExportModal = useUIStore((state) => state.openExportModal);

  const { handleImport: handleScheduleImport } = useScheduleImport();
  const { saveToFolder } = useFileSystemAutoSave();

  // Export dropdown state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const exportDropdown = usePresence(isExportDropdownOpen, POPOVER_EXIT_MS);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isExportDropdownOpen) return;

    const handleClickOutside = (e: PointerEvent): void => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isExportDropdownOpen]);

  const handleExportProject = useCallback(() => {
    openExportModal();
    setIsExportDropdownOpen(false);
  }, [openExportModal]);

  const handleExportAsImage = useCallback(async () => {
    if (!project || sections.length === 0) return;

    setIsExportDropdownOpen(false);

    // No toast until there is something to report: the export is fast, and a
    // 'success' that only means 'started' is a lie the user has to unlearn.
    try {
      await exportTimelineAsImage(project, sections);
      showToast('success', 'Timeline exported as image');
    } catch (error) {
      console.error('Failed to export timeline as image:', error);
      showToast('error', 'Failed to export timeline as image');
    }
  }, [project, sections, showToast]);

  const handleSaveToFolder = useCallback(async () => {
    setIsExportDropdownOpen(false);

    try {
      const success = await saveToFolder();
      if (success) {
        showToast('success', 'Saved to folder');
      }
    } catch (error) {
      console.error('Failed to save to folder:', error);
      showToast('error', 'Failed to save to folder');
    }
  }, [saveToFolder, showToast]);

  const handleImport = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.floid';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();

      // Parse JSON and check format field to determine import type
      try {
        const parsed = JSON.parse(text);

        // Single schedule import (format: 'floid')
        if (parsed.format === 'floid') {
          handleScheduleImport(text);
          return;
        }
      } catch {
        // Not valid JSON, fall through to project import
      }

      // Full project import (format: 'floid-project' or legacy .json)
      const exportData = parseProjectJson(text);

      if (exportData) {
        // Convert export format back to runtime types
        const {
          project: importedProject,
          sections: importedSections,
          dependencies: importedDependencies,
        } = convertImportedProject(exportData);

        // Save current project before switching (if there is one)
        if (activeProjectId) {
          await saveCurrentProject(sections, dependencies);
        }

        // Add the imported project to the project list
        const newProjectId = await importProject(
          importedProject,
          importedSections,
          importedDependencies
        );

        // Switch to the imported project
        await selectProject(newProjectId);
        await loadSectionsForProject(newProjectId);

        showToast('success', `Imported project "${importedProject.name}"`);
      }
    };
    input.click();
  };

  return (
    <header className="h-12 px-4 flex items-center justify-between bg-[var(--color-background)] flex-shrink-0" aria-label="FLOID application header">
      <div className="flex items-center gap-4">
        {/* Logo with wordmark */}
        <Logo />
        {/* Project name - only show when a project exists */}
        {project && (
          <span className="text-body font-normal text-[var(--color-text-primary)]">
            {project.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {project && <ZoomControls />}
        <SyncStatusIndicator />
        <button
          onClick={handleImport}
          className="text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-fast"
        >
          Import
        </button>
        {project && (
          <div ref={exportDropdownRef} className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center gap-1 text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-fast"
            >
              Export
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {exportDropdown.isMounted && (
              <div
                className={`absolute right-0 top-full mt-1 py-1 min-w-[160px] bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-md z-[70] [--popover-origin:top_right] ${
                  exportDropdown.isLeaving ? 'popover-leave' : 'popover-enter'
                }`}
              >
                <button
                  onClick={handleExportProject}
                  className="w-full px-3 py-1.5 text-left text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors duration-fast"
                >
                  Export project...
                </button>
                <button
                  onClick={handleExportAsImage}
                  className="w-full px-3 py-1.5 text-left text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors duration-fast"
                >
                  Export as image
                </button>
                {isFileSystemAccessSupported() && (
                  <button
                    onClick={handleSaveToFolder}
                    className="w-full px-3 py-1.5 text-left text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors duration-fast"
                  >
                    Save to folder
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
