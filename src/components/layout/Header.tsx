import { useProjectStore } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTeamStore } from '../../stores/teamStore';
import { downloadJson, parseImportedJson } from '../../utils/exportUtils';
import { clearStorage } from '../../utils/storageUtils';
import { createDefaultPhases } from '../../data/defaultTemplate';

export default function Header() {
  const { project, setProject, resetProject } = useProjectStore();
  const { phases, setPhases } = useTimelineStore();
  const { teams, setTeams } = useTeamStore();

  const handleExport = () => {
    downloadJson(project, phases, teams);
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
        setProject(data.project);
        setPhases(data.phases);
        if (data.teams) {
          setTeams(data.teams);
        }
      }
    };
    input.click();
  };

  const handleNewProject = () => {
    if (confirm('Create a new project? This will replace the current project.')) {
      clearStorage();
      resetProject();
      setPhases(createDefaultPhases());
      setTeams([]);
    }
  };

  return (
    <header className="h-14 border-b border-gray-200 px-4 flex items-center justify-between bg-white flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo - 32x32 circular mark with staggered timeline bars */}
        <svg
          className="w-8 h-8"
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
        <span className="text-xl font-semibold text-gray-900">FLOID</span>
        {/* Project name */}
        <span className="text-gray-400 mx-2">|</span>
        <span className="text-gray-600">{project.name}</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleImport}
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Export
        </button>
        <button
          onClick={handleNewProject}
          className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md transition-colors"
        >
          New Project
        </button>
      </div>
    </header>
  );
}
