import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useUIStore,
  showItemDeletedToast,
  showSectionDeletedToast,
} from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { downloadScheduleFloid } from '../../utils/exportUtils';
import { createBarAt, createMilestoneAt, createTaskAt } from '../../utils/creationUtils';
import { findItem, locateItem } from '../../utils/itemTree';
import { PHASE_COLORS, isPaletteColor } from '../../constants/colors';
import { resolveItemColor } from '../../utils/timelineUtils';
import { getReadableTextColor } from '../../utils/colorUtils';
import { CustomColorPopover } from '../common/CustomColorPopover';
import { MenuIcon, type MenuIconName } from '../common/MenuIcon';
import { commitWithSlide } from '../../commands/slideCommit';
import { keyBelongsToGesture } from '../../commands/gesture';

interface MenuItem {
  readonly label: string;
  readonly action: () => void;
  readonly icon?: MenuIconName;
  /** Fill for a `swatch` icon — the ink the item currently prints in. */
  readonly iconColor?: string;
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
 *
 * Every entry that changes what is on the sheet — moving, folding, deleting,
 * pinning — commits through `commitWithSlide`, so the rows it displaces slide
 * to their new places exactly as they would after a drop. Adding is the one
 * exception, and only because it already moves: `creationUtils` opens the
 * rows and fades the new item in on its own, and wrapping it a second time
 * would play the rows twice over.
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
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const customColorButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowColorSubmenu(false);
      setIsCustomPickerOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: PointerEvent): void => {
      const target = e.target as Node;
      // The custom picker is a portal, so it is outside the menu in the DOM
      // while being very much inside it as far as the user is concerned.
      if (target instanceof Element && target.closest('[data-color-popover]')) return;
      if (menuRef.current && !menuRef.current.contains(target)) closeContextMenu();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      // An Escape that called a drag off is spent
      if (e.key === 'Escape' && !keyBelongsToGesture(e)) closeContextMenu();
    };

    // Deferred so the click that opened the menu does not immediately close it
    const timeoutId = setTimeout(() => {
      document.addEventListener('pointerdown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('pointerdown', handleClickOutside);
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

  // What the Color row's swatch prints, and what the picker opens on: the
  // item's own ink, or the one it inherits.
  const resolvedItemColor = useMemo(
    () =>
      section && targetId && targetType === 'item' ? resolveItemColor(section, targetId) : null,
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

  /**
   * `run`, for an entry that rearranges the sheet: the rows slide, then the
   * menu goes. Not for the Add entries, which animate themselves.
   */
  const slide = useCallback(
    (fn: () => void) => () => {
      commitWithSlide(fn);
      close();
    },
    [close]
  );

  const menuItems = useMemo((): MenuItem[] => {
    if (!sectionId || !section) return [];

    // ---- an item -------------------------------------------------------
    if (targetType === 'item' && item && targetId) {
      const items: MenuItem[] = [
        {
          label: 'Edit',
          icon: 'edit',
          action: run(() => selectItem(targetId, sectionId, position)),
        },
      ];

      if (item.kind === 'bar') {
        if (item.children.length > 0) {
          items.push({
            label: item.isCollapsed ? 'Expand' : 'Collapse',
            icon: item.isCollapsed ? 'expand' : 'collapse',
            action: slide(() => toggleItemCollapse(sectionId, targetId)),
          });
        }
        items.push({
          label: 'Add bar inside',
          icon: 'bar',
          action: run(() => createBarAt(sectionId, { parentId: targetId }, position)),
        });
        items.push({
          label: 'Add milestone inside',
          icon: 'milestone',
          action: run(() =>
            createMilestoneAt(sectionId, { day: clickDay ?? item.start, parentId: targetId }, position)
          ),
        });
        items.push({
          label: 'Add task inside',
          icon: 'task',
          action: run(() =>
            createTaskAt(sectionId, { day: clickDay ?? item.start, parentId: targetId }, position)
          ),
        });
        items.push({
          label: 'Color',
          icon: 'swatch',
          iconColor: resolvedItemColor ?? undefined,
          action: () => setShowColorSubmenu((open) => !open),
          hasSubmenu: true,
        });
      }

      items.push({
        label: item.isLocked ? 'Unlock' : 'Lock',
        icon: item.isLocked ? 'unlock' : 'lock',
        action: run(() => toggleItemLock(sectionId, targetId)),
        disabled: section.isLocked === true,
      });

      if (itemLocation && itemLocation.parent !== null) {
        items.push({
          label: 'Move out of group',
          icon: 'move-out',
          action: slide(() =>
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
          icon: 'move-up',
          action: slide(() => reorderItem(sectionId, targetId, itemLocation.index - 1)),
          disabled: itemLocation.index === 0,
        });
        items.push({
          label: 'Move down',
          icon: 'move-down',
          action: slide(() => reorderItem(sectionId, targetId, itemLocation.index + 2)),
          disabled: itemLocation.index >= itemLocation.siblings.length - 1,
        });
      }

      items.push({
        label: 'Delete',
        icon: 'delete',
        action: slide(() => {
          // Named while it still exists — a group takes its children with it
          showItemDeletedToast(item);
          deleteItem(sectionId, targetId);
        }),
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
            icon: 'bar',
            action: run(() =>
              createBarAt(sectionId, { startDay: clickDay ?? section.startDate }, position)
            ),
          },
          {
            label: 'Add milestone here',
            icon: 'milestone',
            action: run(() =>
              createMilestoneAt(sectionId, { day: clickDay ?? section.startDate }, position)
            ),
          },
          {
            label: 'Add task here',
            icon: 'task',
            action: run(() =>
              createTaskAt(sectionId, { day: clickDay ?? section.startDate }, position)
            ),
          },
        ];
      }

      return [
        { label: 'Edit', icon: 'edit', action: run(() => selectSection(sectionId, position)) },
        {
          label: section.isCollapsed ? 'Expand' : 'Collapse',
          icon: section.isCollapsed ? 'expand' : 'collapse',
          action: slide(() => toggleSectionCollapse(sectionId)),
        },
        {
          label: section.isLocked ? 'Unlock schedule' : 'Lock schedule',
          icon: section.isLocked ? 'unlock' : 'lock',
          action: run(() => toggleSectionLock(sectionId)),
        },
        { label: 'Add bar', icon: 'bar', action: run(() => createBarAt(sectionId, {}, position)) },
        {
          label: 'Add milestone',
          icon: 'milestone',
          action: run(() => createMilestoneAt(sectionId, { day: section.startDate }, position)),
        },
        {
          label: 'Add task',
          icon: 'task',
          action: run(() => createTaskAt(sectionId, { day: section.startDate }, position)),
        },
        {
          label: project?.pinnedSectionId === sectionId ? 'Unpin' : 'Pin to top',
          icon: project?.pinnedSectionId === sectionId ? 'unpin' : 'pin',
          // The whole schedule travels to the top (or back to its place), and
          // the ones it passes make room for it on the way
          action: slide(() =>
            setPinnedSection(project?.pinnedSectionId === sectionId ? null : sectionId)
          ),
        },
        {
          label: 'Export schedule',
          icon: 'export',
          action: run(() => {
            if (project) {
              void downloadScheduleFloid(
                project,
                section,
                useSectionStore.getState().dependencies
              );
            }
          }),
        },
        {
          label: 'Delete',
          icon: 'delete',
          danger: true,
          action: () => {
            const result = commitWithSlide(() => deleteSection(sectionId));
            if (result.success) showSectionDeletedToast(section);
            else if (result.reason) showToast('warning', result.reason);
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
    resolvedItemColor,
    run,
    slide,
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

  /**
   * A custom pick paints without dismissing anything — the picker is a drag,
   * and a menu that closed on the first committed colour would take the
   * picker with it. The menu closes when the picker is dismissed instead.
   */
  const handleCustomColorChange = useCallback(
    (color: string) => {
      if (!sectionId || !targetId) return;
      updateItem(sectionId, targetId, { color });
    },
    [sectionId, targetId, updateItem]
  );

  const handleCustomPickerClose = useCallback(() => {
    setIsCustomPickerOpen(false);
    setShowColorSubmenu(false);
    close();
  }, [close]);

  const isCustomColor = Boolean(item?.color && !isPaletteColor(item.color));

  if (!isOpen || menuItems.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] py-1 bg-[var(--color-raised)] rounded-[var(--radius-md)] shadow-md border border-[var(--color-border)] popover-enter"
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
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-fast ${
            menuItem.disabled
              ? 'text-[var(--color-text-muted)] cursor-default'
              : menuItem.danger
                ? 'text-[var(--color-error)] hover:bg-[var(--color-error-bg)]'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
          }`}
          role="menuitem"
        >
          {/* The slot is held open whether or not there is a glyph in it, so
              every label in the menu starts on the same vertical line. */}
          {menuItem.icon ? (
            <MenuIcon name={menuItem.icon} color={menuItem.iconColor} />
          ) : (
            <span className="w-3.5 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1 truncate">{menuItem.label}</span>
          {menuItem.hasSubmenu && (
            <svg
              className="w-4 h-4 flex-shrink-0 text-[var(--color-text-muted)]"
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
          {/* Held to seven a row. A menu is sized against the room it has, so
              an unconstrained swatch strip would stretch it to four hundred
              pixels wide and make the menu itself the widest thing on screen. */}
          <div className="flex gap-1.5 flex-wrap max-w-[204px]">
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
            <button
              ref={customColorButtonRef}
              onClick={() => setIsCustomPickerOpen((open) => !open)}
              className={`w-6 h-6 flex items-center justify-center rounded-full transition-opacity duration-fast hover:opacity-80 ${
                isCustomColor
                  ? 'ring-2 ring-offset-1 ring-[var(--color-focus)]'
                  : 'border border-[var(--color-border)]'
              }`}
              style={isCustomColor && item.color ? { backgroundColor: item.color } : undefined}
              title="Custom"
              aria-label="Choose a custom color"
              aria-haspopup="dialog"
              aria-expanded={isCustomPickerOpen}
            >
              <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
                <path
                  d="M6 2v8M2 6h8"
                  stroke={
                    isCustomColor && item.color
                      ? getReadableTextColor(item.color)
                      : 'var(--color-text-muted)'
                  }
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {isCustomPickerOpen && (
            <CustomColorPopover
              anchor={customColorButtonRef.current}
              value={item.color ?? resolvedItemColor ?? PHASE_COLORS.teal}
              onChange={handleCustomColorChange}
              onClose={handleCustomPickerClose}
            />
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
