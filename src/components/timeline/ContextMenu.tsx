import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { downloadScheduleFloid } from '../../utils/exportUtils';
import { PHASE_COLORS } from '../../constants/colors';

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  info?: boolean;
  hasSubmenu?: boolean;
}

export function ContextMenu(): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const { contextMenu, closeContextMenu, selectItem } = useUIStore();
  const {
    deletePhase,
    deleteElement,
    deleteMilestone,
    deleteSection,
    addPhase,
    addElement,
    addMilestone,
    setAsMaster,
    reorderPhases,
    sections,
    togglePhaseCollapse,
    toggleSectionCollapse,
    addPhaseBarMilestone,
    addElementBarMilestone,
    deletePhaseBarMilestone,
    deleteElementBarMilestone,
    updatePhase,
  } = useSectionStore();
  const project = useProjectStore((state) => state.project);

  const { isOpen, position, targetType, targetId, sectionId, phaseId, elementId, location, clickRelativePosition } = contextMenu;

  // Color submenu state
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  // Reset color submenu when menu closes
  useEffect(() => {
    if (!isOpen) {
      setShowColorSubmenu(false);
    }
  }, [isOpen]);

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
    selectItem(targetType, targetId, sectionId, phaseId, position, elementId);
    closeContextMenu();
  }, [targetType, targetId, sectionId, phaseId, elementId, position, selectItem, closeContextMenu]);

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
      case 'barMilestone':
        if (phaseId) {
          if (elementId) {
            deleteElementBarMilestone(sectionId, phaseId, elementId, targetId);
          } else {
            deletePhaseBarMilestone(sectionId, phaseId, targetId);
          }
        }
        break;
    }
    closeContextMenu();
  }, [targetType, targetId, sectionId, phaseId, elementId, deletePhase, deleteElement, deleteMilestone, deleteSection, deletePhaseBarMilestone, deleteElementBarMilestone, closeContextMenu]);

  const handleAddPhase = useCallback(() => {
    if (!sectionId) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const isMasterSection = section.id === project?.masterSectionId;
    const colorKeys = Object.keys(PHASE_COLORS) as (keyof typeof PHASE_COLORS)[];
    const colorIndex = section.phases.length % colorKeys.length;
    const phaseColor = isMasterSection ? PHASE_COLORS[colorKeys[colorIndex]] : null;

    addPhase(sectionId, {
      name: '',
      description: '',
      color: phaseColor,
      relativeStart: 0.1,
      relativeEnd: 0.4,
      order: section.phases.length,
      isCollapsed: false,
      elements: [],
    });

    // Select the newly created phase
    const updatedSections = useSectionStore.getState().sections;
    const updatedSection = updatedSections.find((s) => s.id === sectionId);
    const newPhase = updatedSection?.phases[updatedSection.phases.length - 1];

    if (newPhase) {
      selectItem('phase', newPhase.id, sectionId, null, position);
    }

    closeContextMenu();
  }, [sectionId, sections, project?.masterSectionId, addPhase, selectItem, position, closeContextMenu]);

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

  const handleMovePhaseUp = useCallback(() => {
    if (!sectionId || !targetId || targetType !== 'phase') return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const phaseIndex = section.phases.findIndex((p) => p.id === targetId);
    if (phaseIndex > 0) {
      reorderPhases(sectionId, phaseIndex, phaseIndex - 1);
    }

    closeContextMenu();
  }, [sectionId, targetId, targetType, sections, reorderPhases, closeContextMenu]);

  const handleMovePhaseDown = useCallback(() => {
    if (!sectionId || !targetId || targetType !== 'phase') return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const phaseIndex = section.phases.findIndex((p) => p.id === targetId);
    if (phaseIndex < section.phases.length - 1) {
      reorderPhases(sectionId, phaseIndex, phaseIndex + 1);
    }

    closeContextMenu();
  }, [sectionId, targetId, targetType, sections, reorderPhases, closeContextMenu]);

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

  // Toggle collapse for phases
  const handleTogglePhaseCollapse = useCallback(() => {
    if (!sectionId || !targetId) return;
    togglePhaseCollapse(sectionId, targetId);
    closeContextMenu();
  }, [sectionId, targetId, togglePhaseCollapse, closeContextMenu]);

  // Toggle collapse for sections
  const handleToggleSectionCollapse = useCallback(() => {
    if (!sectionId) return;
    toggleSectionCollapse(sectionId);
    closeContextMenu();
  }, [sectionId, toggleSectionCollapse, closeContextMenu]);

  // Add bar milestone at click position (for phase bar)
  const handleAddBarMilestoneHere = useCallback(() => {
    if (!sectionId || !phaseId || clickRelativePosition === undefined) return;

    const newMilestone = { name: '', relativePosition: clickRelativePosition };
    let newId: string;

    if (elementId) {
      newId = addElementBarMilestone(sectionId, phaseId, elementId, newMilestone);
      selectItem('barMilestone', newId, sectionId, phaseId, position, elementId);
    } else {
      newId = addPhaseBarMilestone(sectionId, phaseId, newMilestone);
      selectItem('barMilestone', newId, sectionId, phaseId, position);
    }

    closeContextMenu();
  }, [sectionId, phaseId, elementId, clickRelativePosition, addPhaseBarMilestone, addElementBarMilestone, selectItem, position, closeContextMenu]);

  // Add section milestone at click position (for section header)
  const handleAddMilestoneHere = useCallback(() => {
    if (!sectionId || clickRelativePosition === undefined) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    addMilestone(sectionId, {
      name: '',
      description: '',
      relativePosition: clickRelativePosition,
      order: section.milestones.length,
    });

    // Select the newly created milestone
    const updatedSections = useSectionStore.getState().sections;
    const updatedSection = updatedSections.find((s) => s.id === sectionId);
    const newMilestone = updatedSection?.milestones[updatedSection.milestones.length - 1];

    if (newMilestone) {
      selectItem('milestone', newMilestone.id, sectionId, null, position);
    }

    closeContextMenu();
  }, [sectionId, clickRelativePosition, sections, addMilestone, selectItem, position, closeContextMenu]);

  // Change phase color
  const handleColorChange = useCallback((color: string) => {
    if (!sectionId || !targetId) return;
    updatePhase(sectionId, targetId, { color });
    closeContextMenu();
  }, [sectionId, targetId, updatePhase, closeContextMenu]);

  // Add phase at click position (for empty row area)
  const handleAddPhaseHere = useCallback(() => {
    if (!sectionId || clickRelativePosition === undefined) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const isMasterSection = section.id === project?.masterSectionId;
    const colorKeys = Object.keys(PHASE_COLORS) as (keyof typeof PHASE_COLORS)[];
    const colorIndex = section.phases.length % colorKeys.length;
    const phaseColor = isMasterSection ? PHASE_COLORS[colorKeys[colorIndex]] : null;

    // Create phase starting at click position with ~20% width
    const phaseWidth = 0.2;
    const relativeStart = Math.max(0, Math.min(1 - phaseWidth, clickRelativePosition));
    const relativeEnd = Math.min(1, relativeStart + phaseWidth);

    // Find the order for insertion (after the phase we clicked near, if any)
    // phaseId contains the context phase when clicking in phase row area
    const contextPhase = phaseId ? section.phases.find((p) => p.id === phaseId) : null;
    const insertOrder = contextPhase ? contextPhase.order + 1 : section.phases.length;

    addPhase(sectionId, {
      name: '',
      description: '',
      color: phaseColor,
      relativeStart,
      relativeEnd,
      order: insertOrder,
      isCollapsed: false,
      elements: [],
    });

    // Reorder if needed
    const updatedSections = useSectionStore.getState().sections;
    const updatedSection = updatedSections.find((s) => s.id === sectionId);
    const newPhase = updatedSection?.phases[updatedSection.phases.length - 1];

    if (newPhase && contextPhase) {
      const currentIndex = updatedSection.phases.length - 1;
      const targetIndex = Math.min(insertOrder, updatedSection.phases.length - 1);
      if (currentIndex !== targetIndex) {
        reorderPhases(sectionId, currentIndex, targetIndex);
      }
    }

    // Get the final state and select the new phase
    const finalSections = useSectionStore.getState().sections;
    const finalSection = finalSections.find((s) => s.id === sectionId);
    const finalPhase = finalSection?.phases.find((p) => p.id === newPhase?.id);

    if (finalPhase) {
      selectItem('phase', finalPhase.id, sectionId, null, position);
    }

    closeContextMenu();
  }, [sectionId, phaseId, clickRelativePosition, sections, project?.masterSectionId, addPhase, reorderPhases, selectItem, position, closeContextMenu]);

  // Add element at click position (for empty element area)
  const handleAddElementHere = useCallback(() => {
    if (!sectionId || !phaseId || clickRelativePosition === undefined) return;

    const section = sections.find((s) => s.id === sectionId);
    const phase = section?.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    // Create element starting at click position with ~20% width (phase-relative)
    const elementWidth = 0.2;
    const relativeStart = Math.max(0, Math.min(1 - elementWidth, clickRelativePosition));
    const relativeEnd = Math.min(1, relativeStart + elementWidth);

    addElement(sectionId, phaseId, {
      name: '',
      description: '',
      relativeStart,
      relativeEnd,
      order: phase.elements.length,
    });

    // Select the newly created element
    const updatedSections = useSectionStore.getState().sections;
    const updatedSection = updatedSections.find((s) => s.id === sectionId);
    const updatedPhase = updatedSection?.phases.find((p) => p.id === phaseId);
    const newElement = updatedPhase?.elements[updatedPhase.elements.length - 1];

    if (newElement) {
      selectItem('element', newElement.id, sectionId, phaseId, position);
    }

    closeContextMenu();
  }, [sectionId, phaseId, clickRelativePosition, sections, addElement, selectItem, position, closeContextMenu]);

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
      case 'barMilestone': {
        // Find the bar milestone
        if (phaseId) {
          const phase = section.phases.find((p) => p.id === phaseId);
          if (elementId) {
            const element = phase?.elements.find((e) => e.id === elementId);
            const bm = element?.barMilestones?.find((b) => b.id === targetId);
            return `Delete "${bm?.name || 'this milestone'}"?`;
          } else {
            const bm = phase?.barMilestones?.find((b) => b.id === targetId);
            return `Delete "${bm?.name || 'this milestone'}"?`;
          }
        }
        return 'Delete this milestone?';
      }
      default:
        return null;
    }
  };

  // Memoize menu items to avoid recalculating on every render
  const menuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [];
    const section = sections.find((s) => s.id === sectionId);
    const isMasterSection = section?.id === project?.masterSectionId;

    // Bar milestone context menu
    if (targetType === 'barMilestone') {
      items.push({ label: 'Edit', action: handleEdit });
      items.push({ label: 'Delete', action: handleDelete, danger: true });
      return items;
    }

    // Phase context menu
    if (targetType === 'phase' && section) {
      const phase = section.phases.find((p) => p.id === targetId);

      if (location === 'label') {
        // Label area: Edit, Collapse/Expand, Add Element, Move Up/Down, Delete
        items.push({ label: 'Edit', action: handleEdit });

        // Collapse/Expand toggle with dynamic label
        if (phase) {
          items.push({
            label: phase.isCollapsed ? 'Expand' : 'Collapse',
            action: handleTogglePhaseCollapse,
          });
        }

        items.push({ label: 'Add Element', action: handleAddElement });

        const phaseIndex = section.phases.findIndex((p) => p.id === targetId);
        const isFirstPhase = phaseIndex === 0;
        const isLastPhase = phaseIndex === section.phases.length - 1;

        items.push({
          label: 'Move Up',
          action: handleMovePhaseUp,
          disabled: isFirstPhase,
        });
        items.push({
          label: 'Move Down',
          action: handleMovePhaseDown,
          disabled: isLastPhase,
        });

        items.push({ label: 'Delete', action: handleDelete, danger: true });
      } else if (location === 'bar') {
        // Bar area: Edit, Add Milestone Here, Color, Delete
        items.push({ label: 'Edit', action: handleEdit });

        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Milestone Here', action: handleAddBarMilestoneHere });
        }

        // Color submenu (only for master section phases)
        if (isMasterSection) {
          items.push({ label: 'Color', action: () => setShowColorSubmenu(!showColorSubmenu), hasSubmenu: true });
        }

        items.push({ label: 'Delete', action: handleDelete, danger: true });
      } else if (location === 'empty') {
        // Empty area (element container): Add Element Here
        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Element Here', action: handleAddElementHere });
        }
      }

      return items;
    }

    // Element context menu
    if (targetType === 'element') {
      if (location === 'label') {
        // Label area: Edit, Delete
        items.push({ label: 'Edit', action: handleEdit });
        items.push({ label: 'Delete', action: handleDelete, danger: true });
      } else if (location === 'bar') {
        // Bar area: Edit, Add Milestone Here, Delete
        items.push({ label: 'Edit', action: handleEdit });

        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Milestone Here', action: handleAddBarMilestoneHere });
        }

        items.push({ label: 'Delete', action: handleDelete, danger: true });
      }

      return items;
    }

    // Section context menu
    if (targetType === 'section' && section) {
      if (location === 'header') {
        // Header area (timeline side): Add Milestone Here only
        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Milestone Here', action: handleAddMilestoneHere });
        }
        return items;
      }

      if (location === 'empty') {
        // Empty area (phase row background): Add Phase Here, Add Milestone Here
        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Phase Here', action: handleAddPhaseHere });
          items.push({ label: 'Add Milestone Here', action: handleAddMilestoneHere });
        }
        return items;
      }

      // Label area: Full section menu
      // Edit is available for non-master sections
      if (!isMasterSection) {
        items.push({ label: 'Edit', action: handleEdit });
      }

      // Collapse/Expand toggle with dynamic label
      items.push({
        label: section.isCollapsed ? 'Expand' : 'Collapse',
        action: handleToggleSectionCollapse,
      });

      // Add Phase is available for all sections
      items.push({ label: 'Add Phase', action: handleAddPhase });

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

      // Delete is available for non-master sections
      if (!isMasterSection) {
        items.push({ label: 'Delete', action: handleDelete, danger: true });
      }

      return items;
    }

    // Milestone context menu (regular section milestones)
    if (targetType === 'milestone') {
      items.push({ label: 'Edit', action: handleEdit });
      items.push({ label: 'Delete', action: handleDelete, danger: true });
      return items;
    }

    return items;
  }, [sections, sectionId, targetId, phaseId, elementId, project?.masterSectionId, targetType, location, clickRelativePosition, showColorSubmenu, handleEdit, handleAddPhase, handleAddElement, handleMovePhaseUp, handleMovePhaseDown, handleSetAsMaster, handleExportSchedule, handleDelete, handleTogglePhaseCollapse, handleToggleSectionCollapse, handleAddBarMilestoneHere, handleAddMilestoneHere, handleAddPhaseHere, handleAddElementHere]);

  if (!isOpen) return null;

  // Get current phase color for highlighting in submenu
  const section = sections.find((s) => s.id === sectionId);
  const currentPhase = section?.phases.find((p) => p.id === targetId);
  const currentPhaseColor = currentPhase?.color;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[140px] py-1 bg-[var(--color-surface)] rounded-lg shadow-lg border border-[var(--color-border)] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Context menu"
    >
      {menuItems.map((item, index) => (
        <button
          key={index}
          ref={item.hasSubmenu ? colorButtonRef : undefined}
          onClick={item.disabled ? undefined : item.action}
          disabled={item.disabled}
          className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
            item.disabled
              ? 'text-[var(--color-text-muted)] cursor-default'
              : item.danger
                ? 'text-[var(--color-error)] hover:bg-[var(--color-error-bg)]'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
          } ${item.info ? 'flex items-center gap-1.5' : ''} ${item.hasSubmenu ? 'flex items-center justify-between' : ''}`}
          role="menuitem"
        >
          {item.info && (
            <svg className="w-4 h-4 text-[var(--color-warning)] rotate-45" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          )}
          {item.label}
          {item.hasSubmenu && (
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}

      {/* Color submenu */}
      {showColorSubmenu && targetType === 'phase' && (
        <div className="px-2 py-1.5 border-t border-[var(--color-border)]">
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(PHASE_COLORS).map(([name, color]) => (
              <button
                key={name}
                onClick={() => handleColorChange(color)}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                  currentPhaseColor === color ? 'ring-2 ring-offset-1 ring-[var(--color-focus)]' : ''
                }`}
                style={{ backgroundColor: color }}
                title={name.charAt(0).toUpperCase() + name.slice(1)}
                aria-label={`Set color to ${name}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
