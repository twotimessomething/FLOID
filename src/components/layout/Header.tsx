import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { exportTimelineAsImage } from '../../utils/exportUtils';
import { importFloidText, FLOID_OPEN_FILTERS } from '../../utils/importFloid';
import { openFiles } from '../../platform/files';
import { useScheduleImport } from '../../hooks/useScheduleImport';
import { useFileSystemAutoSave } from '../../hooks/useFileSystemAutoSave';
import { supportsFolderAutoSave } from '../../platform/files';
import { SLIDE_TIGHT_SCALE } from '../../constants/slideDimensions';
import { SyncStatusIndicator } from '../common/SyncStatusIndicator';
import { ZoomControls } from '../controls/ZoomControls';
import { usePresence, POPOVER_EXIT_MS } from '../../hooks/usePresence';
import { useMenuDismissal } from '../../hooks/useMenuDismissal';
import { titleIfTruncated } from '../../utils/truncatedTitle';

/** A dropdown row: instant highlight, as a native menu has, and a ring inside its edge. */
const DROPDOWN_ROW =
  'menu-row focus-ring w-full px-3 py-1.5 text-left text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]';

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

  // The mark is not a file to drag out of the window
  return <img src={src} alt="FLOID" className="h-6 flex-shrink-0" draggable={false} />;
}

export function Header(): JSX.Element {
  // Use selective store subscriptions to prevent unnecessary re-renders
  const project = useProjectStore((state) => state.project);
  const sections = useSectionStore((state) => state.sections);
  const dependencies = useSectionStore((state) => state.dependencies);

  const showToast = useUIStore((state) => state.showToast);
  const openExportModal = useUIStore((state) => state.openExportModal);

  const { handleImport: handleScheduleImport } = useScheduleImport();
  const { saveToFolder } = useFileSystemAutoSave();

  // Export dropdown state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const exportDropdown = usePresence(isExportDropdownOpen, POPOVER_EXIT_MS);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const closeExportDropdown = useCallback(() => setIsExportDropdownOpen(false), []);
  useMenuDismissal(isExportDropdownOpen, closeExportDropdown, exportDropdownRef);

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
      // A cancelled save dialog wrote nothing, so there is nothing to report
      if (!(await exportTimelineAsImage(project, sections, dependencies))) return;
      showToast('success', 'Timeline exported as image');
    } catch (error) {
      console.error('Failed to export timeline as image:', error);
      showToast('error', 'Failed to export timeline as image');
    }
  }, [project, sections, dependencies, showToast]);

  const handleExportAsSlide = useCallback(async () => {
    if (!project || sections.length === 0) return;

    setIsExportDropdownOpen(false);

    try {
      // Loaded on demand: the PowerPoint writer is far larger than the app
      const { exportTimelineAsPptx } = await import('../../utils/pptxExport');
      const { scale, saved } = await exportTimelineAsPptx(project, sections, dependencies);
      if (!saved) return;

      // A slide is one slide, so a tall timeline is squeezed to hold it. Say so
      // rather than let someone find 5pt type in front of a room.
      showToast(
        'success',
        scale < SLIDE_TIGHT_SCALE
          ? 'Exported slide — collapse a schedule for larger type'
          : 'Timeline exported as slide'
      );
    } catch (error) {
      console.error('Failed to export timeline as slide:', error);
      showToast('error', 'Failed to export timeline as slide');
    }
  }, [project, sections, dependencies, showToast]);

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

  const handleImport = useCallback(async (): Promise<void> => {
    const files = await openFiles({ filters: FLOID_OPEN_FILTERS });
    for (const file of files) {
      await importFloidText(file.text, { handleScheduleImport, fileName: file.name });
    }
  }, [handleScheduleImport]);

  return (
    <header className="h-12 px-4 flex items-center justify-between gap-4 bg-[var(--color-background)] flex-shrink-0" aria-label="FLOID application header">
      <div className="flex items-center gap-4 min-w-0">
        {/* Logo with wordmark */}
        <Logo />
        {/* Project name - only show when a project exists. One line however
            long it is: the header is 48px, and a name that wrapped would
            spill out of it. Cut short, it says itself in full on hover. */}
        {project && (
          <span
            className="text-body font-normal text-[var(--color-text-primary)] truncate"
            onPointerEnter={titleIfTruncated}
          >
            {project.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        {project && <ZoomControls />}
        <SyncStatusIndicator />
        <button
          onClick={handleImport}
          className="text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-fast rounded-[var(--radius-sm)] focus-ring"
        >
          Import
        </button>
        {project && (
          <div ref={exportDropdownRef} className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center gap-1 text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-fast rounded-[var(--radius-sm)] focus-ring"
              aria-expanded={isExportDropdownOpen}
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
                {/* The ellipsis marks the rows that ask for more before they
                    are done: a dialog, or a save panel. */}
                <button onClick={handleExportProject} className={DROPDOWN_ROW}>
                  Export project…
                </button>
                <button onClick={handleExportAsImage} className={DROPDOWN_ROW}>
                  Export as image…
                </button>
                <button onClick={handleExportAsSlide} className={DROPDOWN_ROW}>
                  Export as slide…
                </button>
                {supportsFolderAutoSave() && (
                  <button onClick={handleSaveToFolder} className={DROPDOWN_ROW}>
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
