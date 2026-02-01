import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { downloadJson, parseProjectJson, convertImportedProject } from '../../utils/exportUtils';
import { useScheduleImport } from '../../hooks/useScheduleImport';


export default function Header() {
  // Use selective store subscriptions to prevent unnecessary re-renders
  const project = useProjectStore((state) => state.project);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const { setProject, updateProject, saveCurrentProject, updateProjectIndex } = useProjectStore();

  const sections = useSectionStore((state) => state.sections);
  const setSections = useSectionStore((state) => state.setSections);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const { handleImport: handleScheduleImport } = useScheduleImport();

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
      setEditedName(project?.name ?? '');
      setIsEditingName(false);
    }
  }, [handleNameSave, project?.name]);

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
        <img src="/FLOID_logo.svg" alt="FLOID" className="h-8" />
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
                className="text-sm text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-text-secondary)] outline-none px-1 py-0.5 min-w-[100px]"
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
