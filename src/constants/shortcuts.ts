// Keyboard shortcut definitions for FLOID

export const SHORTCUTS = {
  // Navigation
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',

  // Actions
  ESCAPE: 'Escape',
  ENTER: 'Enter',
  SPACE: ' ',
  DELETE: 'Delete',
  BACKSPACE: 'Backspace',

  // Zoom (with modifier)
  ZOOM_IN: '+',
  ZOOM_OUT: '-',

  // Undo/Redo
  UNDO: 'z',
  REDO_SHIFT: 'z', // with shift modifier
  REDO_Y: 'y', // alternative Windows shortcut
} as const;

// Shortcut descriptions for help display
export const SHORTCUT_DESCRIPTIONS: Record<string, string> = {
  [SHORTCUTS.ESCAPE]: 'Close sidebar / Clear selection',
  [SHORTCUTS.ARROW_UP]: 'Move selection up',
  [SHORTCUTS.ARROW_DOWN]: 'Move selection down',
  [SHORTCUTS.ENTER]: 'Toggle collapse/expand',
  [SHORTCUTS.SPACE]: 'Toggle collapse/expand',
  [SHORTCUTS.DELETE]: 'Delete selected item',
  [SHORTCUTS.BACKSPACE]: 'Delete selected item',
  'Cmd/Ctrl+Z': 'Undo',
  'Cmd/Ctrl+Shift+Z': 'Redo',
  'Cmd/Ctrl+Y': 'Redo',
};
