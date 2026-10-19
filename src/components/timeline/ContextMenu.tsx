import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
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
import { PALETTE_ENTRIES, PHASE_COLORS, isPaletteColor } from '../../constants/colors';
import { resolveItemColor } from '../../utils/timelineUtils';
import { getReadableTextColor } from '../../utils/colorUtils';
import { CustomColorPopover } from '../common/CustomColorPopover';
import { MenuIcon, type MenuIconName } from '../common/MenuIcon';
import { commitWithSlide } from '../../commands/slideCommit';
import { useMenuDismissal } from '../../hooks/useMenuDismissal';
import { useMenuKeyboard } from '../../hooks/useMenuKeyboard';

/** A key that does the same thing to the selection, printed dimmed at the row's end. */
interface MenuShortcut {
  /** What the row prints: the key as it is drawn on a Mac. */
  readonly glyph: string;
  /** The same key for assistive tech, in `aria-keyshortcuts` form. */
  readonly keys: string;
}

interface MenuItem {
  readonly label: string;
  readonly action: () => void;
  readonly icon?: MenuIconName;
  /** Fill for a `swatch` icon — the ink the item currently prints in. */
  readonly iconColor?: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** The row opens the swatch strip beneath it instead of acting itself. */
  readonly isDisclosure?: boolean;
  readonly shortcut?: MenuShortcut;
}

/**
 * Rows that belong together. A hairline is drawn between groups, and a group
 * a target has no rows for simply drops out, so no variant of the menu ever
 * prints a rule at its edge or two rules together.
 */
type MenuGroup = readonly MenuItem[];

// Only keys `useKeyboardShortcuts` really answers on a selection
const EDIT_SHORTCUT: MenuShortcut = { glyph: '↩', keys: 'Enter' };
const FOLD_SHORTCUT: MenuShortcut = { glyph: 'Space', keys: 'Space' };
const DELETE_SHORTCUT: MenuShortcut = { glyph: '⌫', keys: 'Backspace Delete' };

/** The custom picker is a portal: outside the menu in the DOM, inside it to the user. */
const COLOR_POPOVER_SELECTOR = '[data-color-popover]';

/** See `.color-swatch--selected` in index.css — the editor's ColorPicker wears the same. */
const SELECTED_RING = 'color-swatch--selected';

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
 *
 * It behaves like a native menu: the highlight is instant and follows the
 * pointer or the arrows alike (`useMenuKeyboard`), and it goes away the ways
 * a native one does (`useMenuDismissal`).
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
  const customColorButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowColorSubmenu(false);
      setIsCustomPickerOpen(false);
    }
  }, [isOpen]);

  /**
   * Keep the menu on screen, and tell it which corner it grew from.
   *
   * Measured with offsetWidth rather than a client rect: the entrance scales
   * the menu, and a rect read mid-scale would clamp against a menu 3% smaller
   * than the real one. A layout effect, so the corrected corner is the one the
   * first painted frame plays from rather than a frame late. Run again when
   * the swatch strip opens or closes: it changes the menu's height, and a menu
   * opened near the bottom would otherwise grow off the screen.
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
  }, [isOpen, position, showColorSubmenu]);

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

  // What the Color row's swatch prints, what the strip marks as chosen, and
  // what the picker opens on: the item's own ink, or the one it inherits.
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

  const menuGroups = useMemo((): MenuGroup[] => {
    if (!sectionId || !section) return [];

    // ---- an item -------------------------------------------------------
    if (targetType === 'item' && item && targetId) {
      const isBar = item.kind === 'bar';

      const edit: MenuItem = {
        label: 'Edit',
        icon: 'edit',
        shortcut: EDIT_SHORTCUT,
        action: run(() => selectItem(targetId, sectionId, position)),
      };

      const fold: MenuItem[] =
        isBar && item.children.length > 0
          ? [
              {
                label: item.isCollapsed ? 'Expand' : 'Collapse',
                icon: item.isCollapsed ? 'expand' : 'collapse',
                shortcut: FOLD_SHORTCUT,
                action: slide(() => toggleItemCollapse(sectionId, targetId)),
              },
            ]
          : [];

      // A locked schedule or a locked bar takes nothing new
      const canAddInside = section.isLocked !== true && item.isLocked !== true;
      const add: MenuItem[] = isBar
        ? [
            {
              label: 'Add bar inside',
              disabled: !canAddInside,
              icon: 'bar',
              action: run(() => createBarAt(sectionId, { parentId: targetId }, position)),
            },
            {
              label: 'Add milestone inside',
              disabled: !canAddInside,
              icon: 'milestone',
              action: run(() =>
                createMilestoneAt(
                  sectionId,
                  { day: clickDay ?? item.start, parentId: targetId },
                  position
                )
              ),
            },
            {
              label: 'Add task inside',
              disabled: !canAddInside,
              icon: 'task',
              action: run(() =>
                createTaskAt(
                  sectionId,
                  { day: clickDay ?? item.start, parentId: targetId },
                  position
                )
              ),
            },
          ]
        : [];

      const properties: MenuItem[] = [];
      if (isBar) {
        properties.push({
          label: 'Color',
          icon: 'swatch',
          iconColor: resolvedItemColor ?? undefined,
          action: () => setShowColorSubmenu((open) => !open),
          isDisclosure: true,
        });
      }
      properties.push({
        label: item.isLocked ? 'Unlock' : 'Lock',
        icon: item.isLocked ? 'unlock' : 'lock',
        action: run(() => toggleItemLock(sectionId, targetId)),
        disabled: section.isLocked === true,
      });

      const moves: MenuItem[] = [];
      if (itemLocation && itemLocation.parent !== null) {
        moves.push({
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
        moves.push(
          {
            label: 'Move up',
            icon: 'move-up',
            action: slide(() => reorderItem(sectionId, targetId, itemLocation.index - 1)),
            disabled: itemLocation.index === 0,
          },
          {
            label: 'Move down',
            icon: 'move-down',
            action: slide(() => reorderItem(sectionId, targetId, itemLocation.index + 2)),
            disabled: itemLocation.index >= itemLocation.siblings.length - 1,
          }
        );
      }

      const remove: MenuItem = {
        label: 'Delete',
        icon: 'delete',
        shortcut: DELETE_SHORTCUT,
        action: slide(() => {
          // Named while it still exists — a group takes its children with it
          showItemDeletedToast(item);
          deleteItem(sectionId, targetId);
        }),
        danger: true,
      };

      return [[edit], fold, add, properties, moves, [remove]].filter((group) => group.length > 0);
    }

    // ---- a schedule ----------------------------------------------------
    if (targetType === 'section') {
      // Both the schedule's own row and the open space below it can seed
      // something at the exact day that was right-clicked
      if (location === 'header' || location === 'row') {
        return [
          [
            {
              label: 'Add bar here',
              disabled: section.isLocked === true,
              icon: 'bar',
              action: run(() =>
                createBarAt(sectionId, { startDay: clickDay ?? section.startDate }, position)
              ),
            },
            {
              label: 'Add milestone here',
              disabled: section.isLocked === true,
              icon: 'milestone',
              action: run(() =>
                createMilestoneAt(sectionId, { day: clickDay ?? section.startDate }, position)
              ),
            },
            {
              label: 'Add task here',
              disabled: section.isLocked === true,
              icon: 'task',
              action: run(() =>
                createTaskAt(sectionId, { day: clickDay ?? section.startDate }, position)
              ),
            },
          ],
        ];
      }

      const isPinned = project?.pinnedSectionId === sectionId;

      return [
        [
          {
            label: 'Edit',
            icon: 'edit',
            shortcut: EDIT_SHORTCUT,
            action: run(() => selectSection(sectionId, position)),
          },
        ],
        [
          {
            label: section.isCollapsed ? 'Expand' : 'Collapse',
            icon: section.isCollapsed ? 'expand' : 'collapse',
            shortcut: FOLD_SHORTCUT,
            action: slide(() => toggleSectionCollapse(sectionId)),
          },
        ],
        [
          {
            label: 'Add bar',
            disabled: section.isLocked === true,
            icon: 'bar',
            action: run(() => createBarAt(sectionId, {}, position)),
          },
          {
            label: 'Add milestone',
            disabled: section.isLocked === true,
            icon: 'milestone',
            action: run(() => createMilestoneAt(sectionId, { day: section.startDate }, position)),
          },
          {
            label: 'Add task',
            disabled: section.isLocked === true,
            icon: 'task',
            action: run(() => createTaskAt(sectionId, { day: section.startDate }, position)),
          },
        ],
        [
          {
            label: section.isLocked ? 'Unlock schedule' : 'Lock schedule',
            icon: section.isLocked ? 'unlock' : 'lock',
            action: run(() => toggleSectionLock(sectionId)),
          },
          {
            label: isPinned ? 'Unpin' : 'Pin to top',
            icon: isPinned ? 'unpin' : 'pin',
            // The whole schedule travels to the top (or back to its place), and
            // the ones it passes make room for it on the way
            action: slide(() => setPinnedSection(isPinned ? null : sectionId)),
          },
        ],
        [
          {
            // A save panel follows, so the row says there is more to come
            label: 'Export schedule…',
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
        ],
        [
          {
            label: 'Delete',
            icon: 'delete',
            shortcut: DELETE_SHORTCUT,
            danger: true,
            action: () => {
              const result = commitWithSlide(() => deleteSection(sectionId));
              if (result.success) showSectionDeletedToast(section);
              else if (result.reason) showToast('warning', result.reason);
              close();
            },
          },
        ],
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

  // Bound to the store's flag rather than to whether anything rendered: a menu
  // whose target vanished under it (an undo) still closes on the next press
  useMenuDismissal(isOpen, closeContextMenu, menuRef, COLOR_POPOVER_SELECTOR);
  const { handlePointerMove, handlePointerLeave } = useMenuKeyboard(
    menuRef,
    isOpen,
    COLOR_POPOVER_SELECTOR
  );

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

  // Marked the way the editor marks it: the ink the bar prints, inherited or
  // not. Off the palette — a pick, or a schedule's gradient — the `+` wears it.
  const isCustomColor = resolvedItemColor !== null && !isPaletteColor(resolvedItemColor);

  if (!isOpen || menuGroups.length === 0) return null;

  const swatchStrip = item && (
    <div role="group" aria-label="Colors" data-menu-stop="" className="px-3 pt-1 pb-2">
      {/* Held to seven a row. A menu is sized against the room it has, so
          an unconstrained swatch strip would stretch it to four hundred
          pixels wide and make the menu itself the widest thing on screen. */}
      <div className="flex gap-1.5 flex-wrap max-w-[204px]">
        {PALETTE_ENTRIES.map(({ color, label }) => {
          const isCurrent =
            !isCustomColor && resolvedItemColor?.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              role="menuitemradio"
              aria-checked={isCurrent}
              data-menu-member=""
              data-current={isCurrent ? '' : undefined}
              tabIndex={-1}
              onClick={() => handleColorChange(color)}
              className={`w-6 h-6 rounded-[var(--radius-sm)] btn-press focus-ring ${
                isCurrent ? SELECTED_RING : ''
              }`}
              style={{ backgroundColor: color }}
              title={label}
              aria-label={label}
            />
          );
        })}
        <button
          ref={customColorButtonRef}
          type="button"
          role="menuitem"
          data-menu-member=""
          data-current={isCustomColor ? '' : undefined}
          tabIndex={-1}
          onClick={() => setIsCustomPickerOpen((open) => !open)}
          className={`w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] btn-press focus-ring ${
            isCustomColor ? SELECTED_RING : 'border border-[var(--color-border)]'
          }`}
          style={
            isCustomColor && resolvedItemColor ? { backgroundColor: resolvedItemColor } : undefined
          }
          title="Custom color"
          aria-label="Choose a custom color"
          aria-haspopup="dialog"
          aria-expanded={isCustomPickerOpen}
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
            <path
              d="M6 2v8M2 6h8"
              stroke={
                isCustomColor && resolvedItemColor
                  ? getReadableTextColor(resolvedItemColor)
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
  );

  return createPortal(
    <div
      ref={menuRef}
      tabIndex={-1}
      className="fixed z-[100] min-w-[160px] py-1 bg-[var(--color-raised)] rounded-[var(--radius-md)] shadow-md border border-[var(--color-border)] outline-none popover-enter"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Context menu"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {menuGroups.map((group, groupIndex) => (
        <Fragment key={group[0].label}>
          {groupIndex > 0 && (
            <div role="separator" className="my-1 h-px bg-[var(--color-hairline)]" />
          )}
          {group.map((menuItem) => (
            <Fragment key={menuItem.label}>
              {/* No colour transition: a menu highlights the instant the
                  pointer or an arrow reaches a row, as a native one does. */}
              <button
                type="button"
                role="menuitem"
                data-menu-stop=""
                tabIndex={-1}
                onClick={menuItem.disabled ? undefined : menuItem.action}
                disabled={menuItem.disabled}
                aria-expanded={menuItem.isDisclosure ? showColorSubmenu : undefined}
                aria-keyshortcuts={menuItem.shortcut?.keys}
                className={`menu-row focus-ring w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  menuItem.disabled
                    ? 'text-[var(--color-text-muted)] cursor-default'
                    : menuItem.danger
                      ? 'text-[var(--color-error)] focus:bg-[var(--color-error-bg)]'
                      : 'text-[var(--color-text-primary)] focus:bg-[var(--color-hover)]'
                }`}
              >
                {/* The slot is held open whether or not there is a glyph in it,
                    so every label in the menu starts on the same vertical line. */}
                {menuItem.icon ? (
                  <MenuIcon name={menuItem.icon} color={menuItem.iconColor} />
                ) : (
                  <span className="w-3.5 flex-shrink-0" aria-hidden="true" />
                )}
                <span className="flex-1 truncate">{menuItem.label}</span>
                {menuItem.shortcut && (
                  <span className="pl-4 text-[var(--color-text-muted)]" aria-hidden="true">
                    {menuItem.shortcut.glyph}
                  </span>
                )}
                {/* A disclosure, not a flyout: the strip opens right here,
                    beneath the row, and the chevron turns to point at it. */}
                {menuItem.isDisclosure && (
                  <svg
                    className={`collapse-chevron w-4 h-4 flex-shrink-0 text-[var(--color-text-muted)] ${
                      showColorSubmenu ? 'expanded' : ''
                    }`}
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
              {menuItem.isDisclosure && showColorSubmenu && swatchStrip}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>,
    document.body
  );
}
