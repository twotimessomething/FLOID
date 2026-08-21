import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { downloadScheduleFloid } from '../../utils/exportUtils';
import { createPhaseAt, createTaskAt, createMilestoneAt, createBarMilestoneAt } from '../../utils/creationUtils';
import { PHASE_COLORS } from '../../constants/colors';

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  hasSubmenu?: boolean;
}

export function ContextMenu(): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const { contextMenu, closeContextMenu, selectItem, showToast } = useUIStore();
  const {
    deletePhase,
    deleteTask,
    deleteMilestone,
    deleteSection,
    reorderPhases,
    sections,
    togglePhaseCollapse,
    togglePhaseLock,
    toggleSectionCollapse,
    toggleSectionLock,
    deletePhaseBarMilestone,
    deleteTaskBarMilestone,
    updatePhase,
  } = useSectionStore();
  const project = useProjectStore((state) => state.project);
  const setPinnedSection = useProjectStore((state) => state.setPinnedSection);

  const { isOpen, position, targetType, targetId, sectionId, phaseId, taskId, location, clickRelativePosition } = contextMenu;

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

    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
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
    selectItem(targetType, targetId, sectionId, phaseId, position, taskId);
    closeContextMenu();
  }, [targetType, targetId, sectionId, phaseId, taskId, position, selectItem, closeContextMenu]);

  const handleDelete = useCallback(() => {
    if (!targetId || !sectionId) return;

    switch (targetType) {
      case 'phase':
        deletePhase(sectionId, targetId);
        break;
      case 'task':
        if (phaseId) {
          deleteTask(sectionId, phaseId, targetId);
        }
        break;
      case 'milestone':
        deleteMilestone(sectionId, targetId);
        break;
      case 'section': {
        const result = deleteSection(targetId);
        if (!result.success && result.reason) {
          showToast('warning', result.reason);
        }
        break;
      }
      case 'barMilestone':
        if (phaseId) {
          if (taskId) {
            deleteTaskBarMilestone(sectionId, phaseId, taskId, targetId);
          } else {
            deletePhaseBarMilestone(sectionId, phaseId, targetId);
          }
        }
        break;
    }
    closeContextMenu();
  }, [targetType, targetId, sectionId, phaseId, taskId, deletePhase, deleteTask, deleteMilestone, deleteSection, deletePhaseBarMilestone, deleteTaskBarMilestone, closeContextMenu]);

  const handleAddPhase = useCallback(() => {
    if (!sectionId) return;
    // No click position on the label side — continues after the last phase
    createPhaseAt(sectionId, {}, position);
    closeContextMenu();
  }, [sectionId, position, closeContextMenu]);

  const handleAddTask = useCallback(() => {
    if (!sectionId || !targetId) return;
    // No click position — default-width task at the phase start
    createTaskAt(sectionId, targetId, {}, position);
    closeContextMenu();
  }, [sectionId, targetId, position, closeContextMenu]);

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

  const handleTogglePin = useCallback(() => {
    if (!sectionId) return;
    const isPinned = project?.pinnedSectionId === sectionId;
    setPinnedSection(isPinned ? null : sectionId);
    closeContextMenu();
  }, [sectionId, project?.pinnedSectionId, setPinnedSection, closeContextMenu]);

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

  // Toggle lock for phases
  const handleTogglePhaseLock = useCallback(() => {
    if (!sectionId || !targetId) return;
    togglePhaseLock(sectionId, targetId);
    closeContextMenu();
  }, [sectionId, targetId, togglePhaseLock, closeContextMenu]);

  // Toggle lock for sections
  const handleToggleSectionLock = useCallback(() => {
    if (!sectionId) return;
    toggleSectionLock(sectionId);
    closeContextMenu();
  }, [sectionId, toggleSectionLock, closeContextMenu]);

  // Add bar milestone at click position (for phase bar)
  const handleAddBarMilestoneHere = useCallback(() => {
    if (!sectionId || !phaseId || clickRelativePosition === undefined) return;
    createBarMilestoneAt(sectionId, phaseId, taskId ?? null, clickRelativePosition, position);
    closeContextMenu();
  }, [sectionId, phaseId, taskId, clickRelativePosition, position, closeContextMenu]);

  // Add section milestone at click position (for section header)
  const handleAddMilestoneHere = useCallback(() => {
    if (!sectionId || clickRelativePosition === undefined) return;
    createMilestoneAt(sectionId, clickRelativePosition, position);
    closeContextMenu();
  }, [sectionId, clickRelativePosition, position, closeContextMenu]);

  // Change phase color
  const handleColorChange = useCallback((color: string) => {
    if (!sectionId || !targetId) return;
    updatePhase(sectionId, targetId, { color });
    closeContextMenu();
  }, [sectionId, targetId, updatePhase, closeContextMenu]);

  // Add phase at click position (for empty row area)
  const handleAddPhaseHere = useCallback(() => {
    if (!sectionId || clickRelativePosition === undefined) return;
    // phaseId carries the context phase when clicking in a phase row area
    createPhaseAt(
      sectionId,
      { startAt: clickRelativePosition, afterPhaseId: phaseId ?? undefined },
      position
    );
    closeContextMenu();
  }, [sectionId, phaseId, clickRelativePosition, position, closeContextMenu]);

  // Add task at click position (for empty task area)
  const handleAddTaskHere = useCallback(() => {
    if (!sectionId || !phaseId || clickRelativePosition === undefined) return;
    createTaskAt(sectionId, phaseId, { startAt: clickRelativePosition }, position);
    closeContextMenu();
  }, [sectionId, phaseId, clickRelativePosition, position, closeContextMenu]);

  // Memoize menu items to avoid recalculating on every render
  const menuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [];
    const section = sections.find((s) => s.id === sectionId);
    const isPinnedSection = section?.id === project?.pinnedSectionId;

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
        // Label area: Edit, Collapse/Expand, Lock/Unlock, Add Task, Move Up/Down, Delete
        items.push({ label: 'Edit', action: handleEdit });

        // Collapse/Expand toggle with dynamic label
        if (phase) {
          items.push({
            label: phase.isCollapsed ? 'Expand' : 'Collapse',
            action: handleTogglePhaseCollapse,
          });
        }

        // Lock/Unlock toggle (disabled if section is locked)
        if (phase) {
          items.push({
            label: phase.isLocked ? 'Unlock' : 'Lock',
            action: handleTogglePhaseLock,
            disabled: section.isLocked,
          });
        }

        items.push({ label: 'Add Task', action: handleAddTask });

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
        // Bar area: Edit, Add Task, Add Milestone Here, Color, Delete
        items.push({ label: 'Edit', action: handleEdit });
        items.push({ label: 'Add Task', action: handleAddTask });

        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Milestone Here', action: handleAddBarMilestoneHere });
        }

        // Color submenu (only for multicolor schedule phases)
        if (section.isMulticolor) {
          items.push({ label: 'Color', action: () => setShowColorSubmenu(!showColorSubmenu), hasSubmenu: true });
        }

        items.push({ label: 'Delete', action: handleDelete, danger: true });
      } else if (location === 'empty') {
        // Empty area (task container): Add Task Here
        if (clickRelativePosition !== undefined) {
          items.push({ label: 'Add Task Here', action: handleAddTaskHere });
        }
      }

      return items;
    }

    // Task context menu
    if (targetType === 'task') {
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
      items.push({ label: 'Edit', action: handleEdit });

      // Collapse/Expand toggle with dynamic label
      items.push({
        label: section.isCollapsed ? 'Expand' : 'Collapse',
        action: handleToggleSectionCollapse,
      });

      // Lock/Unlock toggle
      items.push({
        label: section.isLocked ? 'Unlock Schedule' : 'Lock Schedule',
        action: handleToggleSectionLock,
      });

      // Add Phase is available for all sections
      items.push({ label: 'Add Phase', action: handleAddPhase });

      // Pin the schedule to the top of the timeline
      items.push({
        label: isPinnedSection ? 'Unpin' : 'Pin to Top',
        action: handleTogglePin,
      });

      // Export Schedule is available for all sections
      items.push({ label: 'Export Schedule', action: handleExportSchedule });

      items.push({ label: 'Delete', action: handleDelete, danger: true });

      return items;
    }

    // Milestone context menu (regular section milestones)
    if (targetType === 'milestone') {
      items.push({ label: 'Edit', action: handleEdit });
      items.push({ label: 'Delete', action: handleDelete, danger: true });
      return items;
    }

    return items;
  }, [sections, sectionId, targetId, phaseId, taskId, project?.pinnedSectionId, targetType, location, clickRelativePosition, showColorSubmenu, handleEdit, handleAddPhase, handleAddTask, handleMovePhaseUp, handleMovePhaseDown, handleTogglePin, handleExportSchedule, handleDelete, handleTogglePhaseCollapse, handleTogglePhaseLock, handleToggleSectionCollapse, handleToggleSectionLock, handleAddBarMilestoneHere, handleAddMilestoneHere, handleAddPhaseHere, handleAddTaskHere]);

  if (!isOpen) return null;

  // Get current phase color for highlighting in submenu
  const section = sections.find((s) => s.id === sectionId);
  const currentPhase = section?.phases.find((p) => p.id === targetId);
  const currentPhaseColor = currentPhase?.color;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[140px] py-1 bg-[var(--color-raised)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] border border-[var(--color-border)]"
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
          className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
            item.disabled
              ? 'text-[var(--color-text-muted)] cursor-default'
              : item.danger
                ? 'text-[var(--color-error)] hover:bg-[var(--color-error-bg)]'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
          } ${item.hasSubmenu ? 'flex items-center justify-between' : ''}`}
          role="menuitem"
        >
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
            {Object.entries(PHASE_COLORS).map(([name, color]) => {
              const label = name.charAt(0).toUpperCase() + name.slice(1);
              return (
                <button
                  key={name}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded-full transition-opacity hover:opacity-80 ${
                    currentPhaseColor === color ? 'ring-2 ring-offset-1 ring-[var(--color-focus)]' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={label}
                  aria-label={`Set color to ${label}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
