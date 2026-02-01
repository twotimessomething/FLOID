import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { downloadScheduleFloid } from '../../utils/exportUtils';

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  info?: boolean;
}

export function ContextMenu(): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const { contextMenu, closeContextMenu, selectItem } = useUIStore();
  const {
    deletePhase,
    deleteElement,
    deleteMilestone,
    deleteSection,
    addElement,
    setAsMaster,
    sections,
  } = useSectionStore();
  const project = useProjectStore((state) => state.project);

  const { isOpen, position, targetType, targetId, sectionId, phaseId } = contextMenu;

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    // Delay adding listener to avoid immediate close from the same click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeContextMenu]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (rect.bottom > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    if (adjustedX !== position.x || adjustedY !== position.y) {
      menu.style.left = `${adjustedX}px`;
      menu.style.top = `${adjustedY}px`;
    }
  }, [isOpen, position]);

  const handleEdit = useCallback(() => {
    if (!targetId || !sectionId) return;
    selectItem(targetType, targetId, sectionId, phaseId, position);
    closeContextMenu();
  }, [targetType, targetId, sectionId, phaseId, position, selectItem, closeContextMenu]);

  const handleDelete = useCallback(() => {
    if (!targetId || !sectionId) return;

    const confirmMessage = getDeleteConfirmMessage();
    if (confirmMessage && !confirm(confirmMessage)) {
      closeContextMenu();
      return;
    }

    switch (targetType) {
      case 'phase':
        deletePhase(sectionId, targetId);
        break;
      case 'element':
        if (phaseId) {
          deleteElement(sectionId, phaseId, targetId);
        }
        break;
      case 'milestone':
        deleteMilestone(sectionId, targetId);
        break;
      case 'section':
        deleteSection(targetId);
        break;
    }
    closeContextMenu();
  }, [targetType, targetId, sectionId, phaseId, deletePhase, deleteElement, deleteMilestone, deleteSection, closeContextMenu]);

  const handleAddElement = useCallback(() => {
    if (!sectionId || !targetId) return;

    addElement(sectionId, targetId, {
      name: '',
      description: '',
      relativeStart: 0,
      relativeEnd: 0.3,
      order: 0,
    });

    // Select the newly created element
    const updatedSections = useSectionStore.getState().sections;
    const section = updatedSections.find((s) => s.id === sectionId);
    const phase = section?.phases.find((p) => p.id === targetId);
    const newElement = phase?.elements[phase.elements.length - 1];

    if (newElement) {
      selectItem('element', newElement.id, sectionId, targetId, position);
    }

    closeContextMenu();
  }, [sectionId, targetId, addElement, selectItem, position, closeContextMenu]);

  const handleExportSchedule = useCallback(() => {
    if (!sectionId) return;

    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      downloadScheduleFloid(project, section);
    }
    closeContextMenu();
  }, [sectionId, sections, project, closeContextMenu]);

  const handleSetAsMaster = useCallback(() => {
    if (!sectionId) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const confirmed = confirm(
      `Pin "${section.name}" as master schedule?\n\nThis will update the project dates to match this schedule's date range.`
    );

    if (confirmed) {
      setAsMaster(sectionId);
    }
    closeContextMenu();
  }, [sectionId, sections, setAsMaster, closeContextMenu]);

  const getDeleteConfirmMessage = (): string | null => {
    if (!targetId || !sectionId) return null;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return null;

    switch (targetType) {
      case 'phase': {
        const phase = section.phases.find((p) => p.id === targetId);
        if (phase && phase.elements.length > 0) {
          return `Delete "${phase.name}"? This will also delete ${phase.elements.length} element(s).`;
        }
        return `Delete "${phase?.name}"?`;
      }
      case 'element': {
        const phase = section.phases.find((p) => p.id === phaseId);
        const element = phase?.elements.find((e) => e.id === targetId);
        return `Delete "${element?.name || 'this element'}"?`;
      }
      case 'milestone': {
        const milestone = section.milestones.find((m) => m.id === targetId);
        return `Delete "${milestone?.name || 'this milestone'}"?`;
      }
      case 'section': {
        return `Delete "${section.name}"? This will delete all phases and milestones within it.`;
      }
      default:
        return null;
    }
  };

  const getMenuItems = (): MenuItem[] => {
    const items: MenuItem[] = [];
    const section = sections.find((s) => s.id === sectionId);
    const isMasterSection = section?.id === project.masterSectionId;

    // Edit is available for all types (except master section at section level)
    if (targetType !== 'section' || !isMasterSection) {
      items.push({ label: 'Edit', action: handleEdit });
    }

    // Add Element is only available for phases
    if (targetType === 'phase') {
      items.push({ label: 'Add Element', action: handleAddElement });
    }

    // Section-specific options
    if (targetType === 'section' && section) {
      // Master status indicator or set as master option
      if (isMasterSection) {
        items.push({
          label: 'Pinned as Master',
          action: () => {},
          disabled: true,
          info: true,
        });
      } else {
        items.push({
          label: 'Pin as Master Schedule',
          action: handleSetAsMaster,
        });
      }

      // Export Schedule is available for all sections
      items.push({ label: 'Export Schedule', action: handleExportSchedule });
    }

    // Delete is available for all types (except master section)
    const canDelete = targetType !== 'section' || !isMasterSection;

    if (canDelete) {
      items.push({ label: 'Delete', action: handleDelete, danger: true });
    }

    return items;
  };

  if (!isOpen) return null;

  const menuItems = getMenuItems();

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[140px] py-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Context menu"
    >
      {menuItems.map((item, index) => (
        <button
          key={index}
          onClick={item.disabled ? undefined : item.action}
          disabled={item.disabled}
          className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
            item.disabled
              ? 'text-[var(--color-text-muted)] cursor-default'
              : item.danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
          } ${item.info ? 'flex items-center gap-1.5' : ''}`}
          role="menuitem"
        >
          {item.info && (
            <svg className="w-4 h-4 text-amber-500 rotate-45" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          )}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
