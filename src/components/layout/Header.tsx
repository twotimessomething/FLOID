import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore, type ThemeMode } from '../../stores/uiStore';
import { downloadJson, parseProjectJson, convertImportedProject } from '../../utils/exportUtils';
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


export default function Header() {
  // Use selective store subscriptions to prevent unnecessary re-renders
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const { setProject, updateProject, saveCurrentProject, updateProjectIndex } = useProjectStore();

  const sections = useSectionStore((state) => state.sections);
  const setSections = useSectionStore((state) => state.setSections);

  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ref to store project name for stable callback
  const projectNameRef = useRef(project?.name ?? '');
  projectNameRef.current = project?.name ?? '';

  const { handleImport: handleScheduleImport } = useScheduleImport();

  const handleThemeToggle = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }, [theme, setTheme]);

  const ThemeIcon = theme === 'light' ? SunIcon : theme === 'dark' ? MoonIcon : MonitorIcon;

  // Update editedName when project changes
  useEffect(() => {
    setEditedName(project?.name ?? '');
  }, [project?.name]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameDoubleClick = useCallback(() => {
    setIsEditingName(true);
  }, []);

  const handleNameSave = useCallback(() => {
    if (!project) return;
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== project.name) {
      updateProject({ name: trimmedName });
    } else {
      setEditedName(project.name);
    }
    setIsEditingName(false);
  }, [editedName, project, updateProject]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      // Use ref to avoid callback recreation when project name changes
      setEditedName(projectNameRef.current);
      setIsEditingName(false);
    }
  }, [handleNameSave]);

  const handleExport = () => {
    downloadJson(project, sections);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.floid';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();

      // Check file extension to determine import type
      if (file.name.endsWith('.floid')) {
        handleScheduleImport(text);
        return;
      }

      // Full project import (.json or .floid-project)
      const exportData = parseProjectJson(text);

      if (exportData) {
        // Convert export format back to runtime types
        const { project: importedProject, sections: importedSections } = convertImportedProject(exportData);

        // Update the current project with imported data
        setProject(importedProject);
        setSections(importedSections);
        // Save and update the project index
        if (activeProjectId) {
          saveCurrentProject(importedSections);
          updateProjectIndex(activeProjectId, { name: importedProject.name });
        }
      }
    };
    input.click();
  };

  return (
    <header className="h-14 border-b border-[var(--color-border)] px-4 flex items-center justify-between bg-[var(--color-surface)] flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo with wordmark */}
        <>
          <img src="/FLOID_logo.svg" alt="FLOID" className="h-8 dark:hidden" />
          <img src="/FLOID_logo_dark.svg" alt="FLOID" className="h-8 hidden dark:block" />
        </>
        {/* Project name - only show when a project exists */}
        {project && (
          <>
            <span className="text-[var(--color-text-muted)] mx-2">|</span>
            {isEditingName ? (
              <input
                ref={inputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleNameKeyDown}
                className="text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border-b border-[var(--color-text-secondary)] outline-none px-1 py-0.5 min-w-[100px] rounded-sm"
              />
            ) : (
              <span
                onDoubleClick={handleNameDoubleClick}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                title="Double-click to edit"
              >
                {project.name}
              </span>
            )}
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
