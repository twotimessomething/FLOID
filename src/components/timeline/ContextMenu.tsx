import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { downloadScheduleFloid } from '../../utils/exportUtils';
import { createBarAt, createMilestoneAt } from '../../utils/creationUtils';
import { findItem, locateItem } from '../../utils/itemTree';
import { PHASE_COLORS } from '../../constants/colors';

interface MenuItem {
  readonly label: string;
  readonly action: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly hasSubmenu?: boolean;
}

/**
 * The context menu.
 *
 * With one item type the menu is built from capabilities rather than from a
 * type × location matrix: anything can be renamed, locked, nested into,
 * reordered and deleted. Only one entry is genuinely exclusive to this menu —
 * adding a milestone anywhere other than a schedule's own row, which is
 * deliberately not a click-anywhere gesture.
 */
export function ContextMenu(): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenu = useUIStore((s) => s.contextMenu);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const selectItem = useUIStore((s) => s.selectItem);
  const selectSection = useUIStore((s) => s.selectSection);
  const showToast = useUIStore((s) => s.showToast);

  const sections = useSectionStore((s) => s.sections);
  const updateItem = useSectionStore((s) => s.updateItem);
  const deleteItem = useSectionStore((s) => s.deleteItem);
  const deleteSection = useSectionStore((s) => s.deleteSection);
  const toggleItemCollapse = useSectionStore((s) => s.toggleItemCollapse);
  const toggleItemLock = useSectionStore((s) => s.toggleItemLock);
  const toggleSectionCollapse = useSectionStore((s) => s.toggleSectionCollapse);
  const toggleSectionLock = useSectionStore((s) => s.toggleSectionLock);
  const reorderItem = useSectionStore((s) => s.reorderItem);
  const moveItem = useSectionStore((s) => s.moveItem);

  const project = useProjectStore((state) => state.project);
  const setPinnedSection = useProjectStore((state) => state.setPinnedSection);

  const { isOpen, position, targetType, targetId, sectionId, location, clickDay } = contextMenu;

  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) setShowColorSubmenu(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeContextMenu();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeContextMenu();
    };

    // Deferred so the click that opened the menu does not immediately close it
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

  /**
   * Keep the menu on screen, and tell it which corner it grew from.
   *
   * Measured with offsetWidth rather than a client rect: the entrance scales
   * the menu, and a rect read mid-scale would clamp against a menu 3% smaller
   * than the real one. A layout effect, so the corrected corner is the one the
   * first painted frame plays from rather than a frame late.
   */
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menu = menuRef.current;
    // Measured where it stands. A fixed box is sized against the room it has,
    // so moving it first to read a "natural" width only makes it balloon.
    const { offsetWidth: width, offsetHeight: height } = menu;

    const flipX = position.x + width > window.innerWidth;
    const flipY = position.y + height > window.innerHeight;

    menu.style.left = `${flipX ? Math.max(8, window.innerWidth - width - 8) : position.x}px`;
    menu.style.top = `${flipY ? Math.max(8, window.innerHeight - height - 8) : position.y}px`;
    menu.style.setProperty(
      '--popover-origin',
      `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`
    );
  }, [isOpen, position]);

  const section = useMemo(
    () => sections.find((s) => s.id === sectionId),
    [sections, sectionId]
  );
  const item = useMemo(
    () => (section && targetType === 'item' && targetId ? findItem(section.items, targetId) : null),
    [section, targetType, targetId]
  );
  const itemLocation = useMemo(
    () => (section && targetId && targetType === 'item' ? locateItem(section.items, targetId) : null),
    [section, targetId, targetType]
  );

  const close = useCallback(() => closeContextMenu(), [closeContextMenu]);

  const run = useCallback(
    (fn: () => void) => () => {
      fn();
      close();
    },
    [close]
  );

  const menuItems = useMemo((): MenuItem[] => {
    if (!sectionId || !section) return [];

    // ---- an item -------------------------------------------------------
    if (targetType === 'item' && item && targetId) {
      const items: MenuItem[] = [
        { label: 'Edit', action: run(() => selectItem(targetId, sectionId, position)) },
      ];

      if (item.kind === 'bar') {
        if (item.children.length > 0) {
          items.push({
            label: item.isCollapsed ? 'Expand' : 'Collapse',
            action: run(() => toggleItemCollapse(sectionId, targetId)),
          });
        }
        items.push({
          label: 'Add bar inside',
          action: run(() => createBarAt(sectionId, { parentId: targetId }, position)),
        });
        items.push({
          label: 'Add milestone inside',
          action: run(() =>
            createMilestoneAt(sectionId, { day: clickDay ?? item.start, parentId: targetId }, position)
          ),
        });
        items.push({
          label: 'Color',
          action: () => setShowColorSubmenu((open) => !open),
          hasSubmenu: true,
        });
      }

      items.push({
        label: item.isLocked ? 'Unlock' : 'Lock',
        action: run(() => toggleItemLock(sectionId, targetId)),
        disabled: section.isLocked === true,
      });

      if (itemLocation && itemLocation.parent !== null) {
        items.push({
          label: 'Move out of group',
          action: run(() =>
            moveItem({
              itemId: targetId,
              fromSectionId: sectionId,
              toSectionId: sectionId,
              toParentId: null,
              toIndex: section.items.length,
              dayDelta: 0,
            })
          ),
        });
      }

      if (itemLocation) {
        items.push({
          label: 'Move up',
          action: run(() => reorderItem(sectionId, targetId, itemLocation.index - 1)),
          disabled: itemLocation.index === 0,
        });
        items.push({
          label: 'Move down',
          action: run(() => reorderItem(sectionId, targetId, itemLocation.index + 2)),
          disabled: itemLocation.index >= itemLocation.siblings.length - 1,
        });
      }

      items.push({
        label: 'Delete',
        action: run(() => deleteItem(sectionId, targetId)),
        danger: true,
      });

      return items;
    }

    // ---- a schedule ----------------------------------------------------
    if (targetType === 'section') {
      // Both the schedule's own row and the open space below it can seed
      // something at the exact day that was right-clicked
      if (location === 'header' || location === 'row') {
        return [
          {
            label: 'Add bar here',
            action: run(() =>
              createBarAt(sectionId, { startDay: clickDay ?? section.startDate }, position)
            ),
          },
          {
            label: 'Add milestone here',
            action: run(() =>
              createMilestoneAt(sectionId, { day: clickDay ?? section.startDate }, position)
            ),
          },
        ];
      }

      return [
        { label: 'Edit', action: run(() => selectSection(sectionId, position)) },
        {
          label: section.isCollapsed ? 'Expand' : 'Collapse',
          action: run(() => toggleSectionCollapse(sectionId)),
        },
        {
          label: section.isLocked ? 'Unlock schedule' : 'Lock schedule',
          action: run(() => toggleSectionLock(sectionId)),
        },
        { label: 'Add bar', action: run(() => createBarAt(sectionId, {}, position)) },
        {
          label: 'Add milestone',
          action: run(() => createMilestoneAt(sectionId, { day: section.startDate }, position)),
        },
        {
          label: project?.pinnedSectionId === sectionId ? 'Unpin' : 'Pin to top',
          action: run(() =>
            setPinnedSection(project?.pinnedSectionId === sectionId ? null : sectionId)
          ),
        },
        {
          label: 'Export schedule',
          action: run(() => {
            if (project) void downloadScheduleFloid(project, section);
          }),
        },
        {
          label: 'Delete',
          danger: true,
          action: () => {
            const result = deleteSection(sectionId);
            if (!result.success && result.reason) showToast('warning', result.reason);
            close();
          },
        },
      ];
    }

    return [];
  }, [
    sectionId,
    section,
    targetType,
    targetId,
    item,
    itemLocation,
    location,
    clickDay,
    position,
    project,
    run,
    close,
    selectItem,
    selectSection,
    toggleItemCollapse,
    toggleItemLock,
    toggleSectionCollapse,
    toggleSectionLock,
    reorderItem,
    moveItem,
    deleteItem,
    deleteSection,
    setPinnedSection,
    showToast,
  ]);

  const handleColorChange = useCallback(
    (color: string) => {
      if (!sectionId || !targetId) return;
      updateItem(sectionId, targetId, { color });
      setShowColorSubmenu(false);
      close();
    },
    [sectionId, targetId, updateItem, close]
  );

  if (!isOpen || menuItems.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] py-1 bg-[var(--color-raised)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] border border-[var(--color-border)] popover-enter"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Context menu"
    >
      {menuItems.map((menuItem, index) => (
        <button
          key={`${menuItem.label}-${index}`}
          ref={menuItem.hasSubmenu ? colorButtonRef : undefined}
          onClick={menuItem.disabled ? undefined : menuItem.action}
          disabled={menuItem.disabled}
          className={`w-full px-3 py-1.5 text-left text-xs transition-colors duration-fast ${
            menuItem.disabled
              ? 'text-[var(--color-text-muted)] cursor-default'
              : menuItem.danger
                ? 'text-[var(--color-error)] hover:bg-[var(--color-error-bg)]'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
          } ${menuItem.hasSubmenu ? 'flex items-center justify-between' : ''}`}
          role="menuitem"
        >
          {menuItem.label}
          {menuItem.hasSubmenu && (
            <svg
              className="w-4 h-4 text-[var(--color-text-muted)]"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      ))}

      {showColorSubmenu && item && (
        <div className="px-2 py-1.5 border-t border-[var(--color-border)]">
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(PHASE_COLORS).map(([name, color]) => {
              const label = name.charAt(0).toUpperCase() + name.slice(1);
              return (
                <button
                  key={name}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded-full transition-opacity duration-fast hover:opacity-80 ${
                    item.color === color ? 'ring-2 ring-offset-1 ring-[var(--color-focus)]' : ''
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
