import { useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useUIStore,
  showItemDeletedToast,
  showSectionDeletedToast,
} from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { usePinnedSection } from './usePinnedSection';
import { SHORTCUTS } from '../constants/shortcuts';
import { commandForKeydown, executeCommand } from '../commands/executeCommand';
import { keyBelongsToGesture, watchGestureKeys } from '../commands/gesture';
import { commitWithSlide } from '../commands/slideCommit';
import { isDesktop } from '../platform/detect';
import { flattenSection, headerMilestones } from '../utils/timelineUtils';
import { findItem } from '../utils/itemTree';
import { revealRow } from '../utils/revealRow';
import { holdsOwnDraft, isSheetCovered, isTypingTarget } from '../utils/keyboardTargets';
import type { CommandId } from '../commands/types';
import type { Section } from '../types';

interface NavigableRow {
  readonly id: string;
  readonly type: 'section' | 'item';
  readonly sectionId: string;
}

/**
 * Keys this hook acts on by itself. While a gesture holds the sheet they do
 * nothing, but they are still claimed: left to the browser, Space and the
 * arrows would scroll the sheet out from under the drag.
 */
const CLAIMED_KEYS: ReadonlySet<string> = new Set([
  SHORTCUTS.ARROW_UP,
  SHORTCUTS.ARROW_DOWN,
  SHORTCUTS.ENTER,
  SHORTCUTS.SPACE,
  SHORTCUTS.DELETE,
  SHORTCUTS.BACKSPACE,
]);

/** History, which a field holding a draft of its own keeps for its text. */
const HISTORY_COMMANDS: ReadonlySet<CommandId> = new Set(['edit.undo', 'edit.redo']);

/** Focus inside one of these is on its controls, not on the sheet behind it. */
const LAYER_SELECTOR = '[role="dialog"], [role="menu"]';

/** Controls that answer Return and Space themselves. */
const PRESSABLE_SELECTOR = 'button, a[href], select, [role="switch"], [role="menuitem"]';

function isInsideLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(LAYER_SELECTOR) !== null;
}

function isPressable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PRESSABLE_SELECTOR) !== null;
}

/**
 * The arrows put the keyboard on the sheet. Whatever control had focus — a
 * row clicked earlier, an entry in the status sidebar — lets go of it, so the
 * next Return opens the new selection instead of pressing that control again.
 */
function releaseFocus(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

/**
 * Hook for handling global keyboard shortcuts in the timeline application.
 * Supports navigation, the editor, collapse/expand, deletion, and history.
 */
export function useKeyboardShortcuts(): void {
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const selectSection = useUIStore((s) => s.selectSection);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const closeModal = useUIStore((s) => s.closeModal);
  const isModalOpen = useUIStore((s) => s.isModalOpen);
  const showToast = useUIStore((s) => s.showToast);
  const selectedDependencyId = useUIStore((s) => s.selectedDependencyId);
  const selectDependency = useUIStore((s) => s.selectDependency);

  const { pinnedSection, unpinnedSections } = usePinnedSection();
  const sections = useSectionStore((s) => s.sections);
  const toggleSectionCollapse = useSectionStore((s) => s.toggleSectionCollapse);
  const toggleItemCollapse = useSectionStore((s) => s.toggleItemCollapse);
  const deleteSection = useSectionStore((s) => s.deleteSection);
  const deleteItem = useSectionStore((s) => s.deleteItem);
  const removeDependency = useSectionStore((s) => s.removeDependency);

  /**
   * Arrow keys walk exactly what is on screen. `flattenSection` is the same
   * function the timeline renders from, so navigation can never disagree with
   * the rows the user is looking at — at any nesting depth.
   */
  const { rows: navigableItems, indexMap } = useMemo(() => {
    const rows: NavigableRow[] = [];

    const addSection = (section: Section): void => {
      rows.push({ id: section.id, type: 'section', sectionId: section.id });
      if (section.isCollapsed) return;
      for (const row of flattenSection(section)) {
        rows.push({ id: row.item.id, type: 'item', sectionId: section.id });
      }
      // A schedule's own markers sit on its header row, after its bars
      for (const milestone of headerMilestones(section)) {
        rows.push({ id: milestone.id, type: 'item', sectionId: section.id });
      }
    };

    if (pinnedSection) addSection(pinnedSection);
    unpinnedSections.forEach(addSection);

    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.id, index));
    return { rows, indexMap: map };
  }, [pinnedSection, unpinnedSections]);

  const getCurrentIndex = useCallback((): number => {
    if (!selection.id) return -1;
    return indexMap.get(selection.id) ?? -1;
  }, [selection.id, indexMap]);

  // The arrows move the outline, not the editor: opened on every row, its
  // name field would take the next press. The sheet scrolls to keep the
  // outline in view, and Return opens the editor on whatever it reached.
  const handleNavigation = useCallback(
    (direction: 'up' | 'down'): void => {
      if (navigableItems.length === 0) return;

      const currentIndex = getCurrentIndex();
      let newIndex: number;

      if (currentIndex === -1) {
        // No selection - start from beginning or end
        newIndex = direction === 'down' ? 0 : navigableItems.length - 1;
      } else {
        newIndex =
          direction === 'down'
            ? Math.min(currentIndex + 1, navigableItems.length - 1)
            : Math.max(currentIndex - 1, 0);
      }

      const row = navigableItems[newIndex];
      if (!row) return;

      releaseFocus();
      if (row.type === 'section') {
        selectSection(row.sectionId, undefined, { openEditor: false });
        revealRow({ sectionId: row.sectionId, itemId: null });
      } else {
        selectItem(row.id, row.sectionId, undefined, { openEditor: false });
        revealRow({ sectionId: row.sectionId, itemId: row.id });
      }
    },
    [navigableItems, getCurrentIndex, selectItem, selectSection]
  );

  // Opened from the keyboard, the editor still opens beside the ink it edits,
  // as it would for a click — where that ink stands once it is in view
  const handleOpenEditor = useCallback((): void => {
    const { id, sectionId, type } = selection;
    if (!id || !sectionId) return;
    if (type === 'section') {
      selectSection(sectionId, revealRow({ sectionId, itemId: null }));
    } else if (type === 'item') {
      selectItem(id, sectionId, revealRow({ sectionId, itemId: id }));
    }
  }, [selection, selectItem, selectSection]);

  // Folding opens or closes rows mid-sheet: everything below slides to its
  // new place rather than jumping there
  const handleToggleCollapse = useCallback((): void => {
    const { id, sectionId, type } = selection;
    if (!id || !sectionId) return;
    if (type === 'section') {
      commitWithSlide(() => toggleSectionCollapse(sectionId));
      return;
    }
    if (type === 'item') {
      commitWithSlide(() => toggleItemCollapse(sectionId, id));
    }
  }, [selection, toggleSectionCollapse, toggleItemCollapse]);

  const handleDelete = useCallback((): void => {
    const { id, sectionId, type } = selection;
    if (!id || !sectionId) return;
    // Read before the delete: the notice names what went, and offers it back
    const section = sections.find((s) => s.id === sectionId);

    // What was below closes over the gap rather than jumping into it
    if (type === 'section') {
      const result = commitWithSlide(() => deleteSection(sectionId));
      if (result.success && section) showSectionDeletedToast(section);
      else if (result.reason) showToast('warning', result.reason);
    } else if (type === 'item') {
      const item = section ? findItem(section.items, id) : null;
      if (item) showItemDeletedToast(item);
      commitWithSlide(() => deleteItem(sectionId, id));
    }

    closeModal();
  }, [selection, sections, deleteSection, deleteItem, closeModal, showToast]);

  /** Only a bar with children has anything to fold. */
  const canToggleSelection = useMemo((): boolean => {
    if (selection.type === 'section') return true;
    if (selection.type !== 'item' || !selection.sectionId || !selection.id) return false;
    const section = sections.find((s) => s.id === selection.sectionId);
    const item = section ? findItem(section.items, selection.id) : null;
    return item !== null && item.kind === 'bar' && item.children.length > 0;
  }, [selection, sections]);

  // Main keyboard event handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      // A drag in the hand owns the sheet, and Escape is its key: it calls
      // the drag off. Nothing here may act on the same press — not close the
      // editor, not drop a selection, not rewrite the rows the drop is aimed at.
      const isHeldByGesture = keyBelongsToGesture(event);

      // Menu-grade combos route through the command registry — the same
      // handlers a native menu drives. On desktop the menu owns these
      // accelerators, so the DOM handler stands down. Runs before the
      // input-target check on purpose: the editor's fields write through to
      // the sheet, so undo works from inside them. A field holding a draft of
      // its own is the exception, and keeps the browser's text undo.
      if (!isDesktop()) {
        const commandId = commandForKeydown(event);
        if (commandId && HISTORY_COMMANDS.has(commandId) && holdsOwnDraft(event.target)) return;
        if (commandId) {
          // Mid-gesture the combo is swallowed, not handed back: ⌘S left to
          // the browser would open its own Save dialog under the drag.
          if (!isHeldByGesture) executeCommand(commandId);
          event.preventDefault();
          return;
        }
      }

      if (isHeldByGesture) {
        if (CLAIMED_KEYS.has(event.key) && !isTypingTarget(event.target)) event.preventDefault();
        return;
      }

      // Answered already by whatever is closer to the key: a focused row's
      // own Return, a rename field's Escape, a popover closing
      if (event.defaultPrevented) return;

      // A modal or a menu over the sheet answers its own keys, Escape included —
      // even from a text field in it, which must not close the editor beneath
      if (isSheetCovered()) return;

      // Ignore other shortcuts if user is typing in an input or textarea
      if (isTypingTarget(event.target)) {
        // Only allow Escape to close modal when in input
        if (event.key === SHORTCUTS.ESCAPE && isModalOpen) {
          closeModal();
          event.preventDefault();
        }
        return;
      }

      // Focus in the editor, or in a popover it raised, is on their controls:
      // Space on the close button is not a fold, Delete on a swatch not a delete
      const isInLayer = isInsideLayer(event.target);

      switch (event.key) {
        case SHORTCUTS.ESCAPE:
          if (selectedDependencyId) {
            selectDependency(null);
          } else if (isModalOpen) {
            closeModal();
          } else if (selection.type) {
            // Nothing open to close, so Escape lets go of the selection —
            // and a stray Delete later has nothing to take with it
            clearSelection();
          }
          event.preventDefault();
          break;

        case SHORTCUTS.ARROW_UP:
        case SHORTCUTS.ARROW_DOWN:
          if (isInLayer) break;
          handleNavigation(event.key === SHORTCUTS.ARROW_UP ? 'up' : 'down');
          event.preventDefault();
          break;

        case SHORTCUTS.ENTER:
          if (isInLayer || isPressable(event.target)) break;
          if (selection.id && selection.type) {
            handleOpenEditor();
            event.preventDefault();
          }
          break;

        case SHORTCUTS.SPACE:
          if (isInLayer || isPressable(event.target)) break;
          if (canToggleSelection) {
            handleToggleCollapse();
            event.preventDefault();
          }
          break;

        case SHORTCUTS.DELETE:
        case SHORTCUTS.BACKSPACE:
          if (isInLayer) break;
          // A selected link holds the selection slot, so it takes the key
          if (selectedDependencyId) {
            removeDependency(selectedDependencyId);
            selectDependency(null);
            event.preventDefault();
          } else if (selection.id && selection.type) {
            handleDelete();
            event.preventDefault();
          }
          break;
      }
    },
    [
      isModalOpen,
      selection,
      selectedDependencyId,
      selectDependency,
      removeDependency,
      canToggleSelection,
      clearSelection,
      closeModal,
      handleNavigation,
      handleOpenEditor,
      handleToggleCollapse,
      handleDelete,
    ]
  );

  // Asked at the very start of every keydown's dispatch, before any gesture's
  // own Escape handler can end the gesture and make the answer a lie
  useEffect(() => watchGestureKeys(), []);

  // One listener for the life of the app, reading the latest handler. Added
  // once, it stays ahead of every modal and menu that opens later, so it asks
  // whether one is open before that one's own Escape has closed it — and an
  // Escape that dismissed a menu does not go on to drop the selection too.
  const handleKeyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    handleKeyDownRef.current = handleKeyDown;
  }, [handleKeyDown]);

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => handleKeyDownRef.current(event);
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);
}
