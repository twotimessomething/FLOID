import { COMMANDS } from './commands';
import type { CommandId } from './types';

export function executeCommand(id: CommandId): void {
  const command = COMMANDS[id];
  if (command.isEnabled && !command.isEnabled()) return;
  void command.run();
}

/**
 * The web half of the accelerator story: maps a modifier keydown to the
 * command it fires. Browser-reserved combos are left alone — claiming a key
 * the browser will not surrender only breaks the help modal's word.
 */
export function commandForKeydown(event: KeyboardEvent): CommandId | null {
  if (!event.metaKey && !event.ctrlKey) return null;

  const key = event.key.toLowerCase();
  let id: CommandId | null = null;

  if (key === 'z') id = event.shiftKey ? 'edit.redo' : 'edit.undo';
  else if (key === 'y') id = 'edit.redo';
  else if (key === 's') id = 'project.saveBackup';
  else if (key === 'e') id = 'project.export';
  else if (key === 'o') id = 'project.open';
  else if (key === '=' || key === '+') id = 'view.zoomIn';
  else if (key === '-') id = 'view.zoomOut';
  else if (key === '0') id = 'view.zoomToFit';

  if (id === null) return null;
  return COMMANDS[id].browserReserved ? null : id;
}
