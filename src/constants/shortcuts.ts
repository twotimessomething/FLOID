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
  [SHORTCUTS.ESCAPE]: 'Close the editor, or cancel a drag',
  [SHORTCUTS.ARROW_UP]: 'Select the previous row',
  [SHORTCUTS.ARROW_DOWN]: 'Select the next row',
  [SHORTCUTS.ENTER]: 'Expand or collapse a schedule or group',
  [SHORTCUTS.SPACE]: 'Expand or collapse a schedule or group',
  [SHORTCUTS.DELETE]: 'Delete selected item',
  [SHORTCUTS.BACKSPACE]: 'Delete selected item',
  'Cmd/Ctrl+Z': 'Undo',
  'Cmd/Ctrl+Shift+Z': 'Redo',
  'Cmd/Ctrl+Y': 'Redo',
};
