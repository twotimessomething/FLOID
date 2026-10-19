import { isBlockingModalOpen } from '../hooks/useModalLayer';
import { useUIStore } from '../stores/uiStore';

/**
 * What a key lands on, for the handlers that have to decide whether it is the
 * sheet's: the web's keydown router (`useKeyboardShortcuts`) and the history
 * commands the Mac's menu runs before the webview ever sees the key.
 */

/**
 * Every modal draws on this layer. With the editor open and nothing over it,
 * a field on it is one of the editor's.
 */
const MODAL_LAYER_SELECTOR = '.modal-layer';
const INLINE_DRAFT_SELECTOR = '[data-inline-draft]';

export function isTypingTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Whether something over the sheet owns the keyboard: a modal, a confirm, the
 * context menu. The selection keys have nothing under them to act on while
 * one is open. The editor floats beside its bar and does not count. Every
 * modal registers on the shared layer once it mounts; the store's flags cover
 * the moment before that, while a modal's lazy chunk is still arriving.
 */
export function isSheetCovered(): boolean {
  const ui = useUIStore.getState();
  return (
    isBlockingModalOpen() ||
    ui.contextMenu.isOpen ||
    ui.confirmDialog.isOpen ||
    ui.isSettingsModalOpen ||
    ui.isExportModalOpen ||
    ui.isAboutModalOpen
  );
}

/**
 * Whether a text field keeps its own undo. The editor's fields write every
 * keystroke through to the sheet, so their history is the sheet's. Every
 * other field — a rename in the labels column, a modal's name — holds a draft
 * until it commits, and ⌘Z there takes back the typing, not the last move.
 */
export function holdsOwnDraft(target: EventTarget | null): boolean {
  if (!isTypingTarget(target)) return false;
  // A rename says so itself (`useInlineEdit`'s `data-inline-draft`)
  if (target.closest(INLINE_DRAFT_SELECTOR) !== null) return true;
  const isEditorField =
    useUIStore.getState().isModalOpen &&
    !isSheetCovered() &&
    target.closest(MODAL_LAYER_SELECTOR) !== null;
  return !isEditorField;
}
