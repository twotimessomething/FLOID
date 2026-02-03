import { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore, type ThemeMode } from '../../stores/uiStore';
import { parseProjectJson, convertImportedProject } from '../../utils/exportUtils';
import { useScheduleImport } from '../../hooks/useScheduleImport';

// Theme icons
function SunIcon(): JSX.Element {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

function MonitorIcon(): JSX.Element {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System preference',
};

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

  return <img src={src} alt="FLOID" className="h-8" />;
}


export function Header() {
  // Use selective store subscriptions to prevent unnecessary re-renders
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const sections = useSectionStore((state) => state.sections);
  const { saveCurrentProject, importProject, selectProject } = useProjectStore();

  const loadSectionsForProject = useSectionStore((state) => state.loadSectionsForProject);

  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const showToast = useUIStore((state) => state.showToast);
  const openExportModal = useUIStore((state) => state.openExportModal);

  const { handleImport: handleScheduleImport } = useScheduleImport();

  const handleThemeToggle = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }, [theme, setTheme]);

  const ThemeIcon = theme === 'light' ? SunIcon : theme === 'dark' ? MoonIcon : MonitorIcon;

  const handleExport = useCallback(() => {
    openExportModal();
  }, [openExportModal]);

  const handleImport = () => {
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
        const { project: importedProject, sections: importedSections } = convertImportedProject(exportData);

        // Save current project before switching (if there is one)
        if (activeProjectId) {
          await saveCurrentProject(sections);
        }

        // Add the imported project to the project list
        const newProjectId = await importProject(importedProject, importedSections);

        // Switch to the imported project
        await selectProject(newProjectId);
        await loadSectionsForProject(newProjectId);

        showToast('success', `Imported project "${importedProject.name}"`);
      }
    };
    input.click();
  };

  return (
    <header className="h-14 border-b border-[var(--color-border)] px-4 flex items-center justify-between bg-[var(--color-surface)] flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo with wordmark */}
        <Logo />
        {/* Project name - only show when a project exists */}
        {project && (
          <>
            <span className="text-[var(--color-text-muted)] mx-2">|</span>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {project.name}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleThemeToggle}
          className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-md transition-colors duration-150"
          title={THEME_LABELS[theme]}
          aria-label={`Theme: ${THEME_LABELS[theme]}. Click to change.`}
        >
          <ThemeIcon />
        </button>
        <button
          onClick={handleImport}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
        >
          Import
        </button>
        {project && (
          <button
            onClick={handleExport}
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
          >
            Export
          </button>
        )}
      </div>
    </header>
  );
}
