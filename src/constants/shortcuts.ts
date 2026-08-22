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
