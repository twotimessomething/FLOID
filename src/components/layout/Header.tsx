import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { downloadJson, parseImportedJson } from '../../utils/exportUtils';

export default function Header() {
  const { project, setProject, updateProject, saveCurrentProject, updateProjectIndex, activeProjectId } = useProjectStore();
  const { sections, setSections } = useSectionStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editedName when project changes
  useEffect(() => {
    setEditedName(project.name);
  }, [project.name]);

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
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== project.name) {
      updateProject({ name: trimmedName });
    } else {
      setEditedName(project.name);
    }
    setIsEditingName(false);
  }, [editedName, project.name, updateProject]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setEditedName(project.name);
      setIsEditingName(false);
    }
  }, [handleNameSave, project.name]);

  const handleExport = () => {
    downloadJson(project, sections);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      const data = parseImportedJson(text);

      if (data) {
        // Update the current project with imported data
        setProject(data.project);
        setSections(data.sections);
        // Save and update the project index
        if (activeProjectId) {
          saveCurrentProject(data.sections);
          updateProjectIndex(activeProjectId, { name: data.project.name });
        }
      }
    };
    input.click();
  };

  return (
    <header className="h-14 border-b border-[#e5e7eb] px-4 flex items-center justify-between bg-white flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo - circular mark with staggered timeline bars */}
        <svg
          className="w-10 h-10"
          viewBox="0 0 64 64"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="32" cy="32" r="30" fill="#6366F1" />
          <rect x="14" y="20" width="36" height="6" rx="2" fill="#A5B4FC" />
          <rect x="14" y="29" width="28" height="6" rx="2" fill="#C4B5FD" />
          <rect x="14" y="38" width="32" height="6" rx="2" fill="#F9A8D4" />
        </svg>
        {/* Wordmark */}
        <span className="text-[25px] font-semibold text-[#111827]">FLOID</span>
        {/* Project name */}
        <span className="text-[#9ca3af] mx-2">|</span>
        {isEditingName ? (
          <input
            ref={inputRef}
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleNameKeyDown}
            className="text-sm text-[#111827] bg-transparent border-b border-[#6b7280] outline-none px-1 py-0.5 min-w-[100px]"
          />
        ) : (
          <span
            onDoubleClick={handleNameDoubleClick}
            className="text-sm text-[#6b7280] hover:text-[#111827] cursor-pointer"
            title="Double-click to edit"
          >
            {project.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleImport}
          className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors duration-150"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors duration-150"
        >
          Export
        </button>
      </div>
    </header>
  );
}
