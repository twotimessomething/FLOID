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

  // Modifier combos (undo/redo, zoom, save…) live in the command registry:
  // src/commands/commands.ts
} as const;
