/**
 * Menu-grade commands: actions that make sense from a menu bar, a keyboard
 * combo, or a script — no selection context required. Selection-dependent keys
 * (arrows, delete, collapse) stay in `useKeyboardShortcuts`, where the
 * navigation context lives.
 */

export type CommandId =
  | 'project.new'
  | 'project.open'
  | 'project.saveBackup'
  | 'project.export'
  | 'schedule.add'
  | 'edit.undo'
  | 'edit.redo'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.zoomToFit'
  | 'view.today'
  | 'view.toggleLeftSidebar'
  | 'view.toggleInfoSidebar'
  | 'app.settings'
  | 'help.shortcuts'
  | 'help.about';

export interface Command {
  readonly id: CommandId;
  /** Menu item text; also the description in the keyboard-help modal. */
  readonly label: string;
  /** Display keys for the help modal, e.g. ['⌘', 'Z']. */
  readonly shortcutKeys?: readonly string[];
  /** Tauri accelerator form, e.g. 'CmdOrCtrl+Z'. Drives the native menu. */
  readonly accelerator?: string;
  /**
   * The browser claims this combo before the page sees it (⌘N, ⌘T, ⌘1…), so
   * the web keydown handler must not map it and the help modal must not
   * promise it. The native menu still may — macOS hands menus first refusal.
   */
  readonly browserReserved?: boolean;
  readonly isEnabled?: () => boolean;
  readonly run: () => void | Promise<void>;
}
