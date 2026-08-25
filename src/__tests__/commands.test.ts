import { describe, it, expect, beforeEach } from 'vitest';
import { COMMANDS } from '../commands/commands';
import { commandForKeydown, executeCommand } from '../commands/executeCommand';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';

function combo(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, metaKey: true, ...modifiers });
}

beforeEach(() => {
  useUIStore.setState({ isProjectSetupModalOpen: false });
  useSectionStore.setState({ sections: [] });
  useSectionStore.temporal.getState().clear();
});

describe('commandForKeydown', () => {
  it('maps the history and file combos', () => {
    expect(commandForKeydown(combo('z'))).toBe('edit.undo');
    expect(commandForKeydown(combo('z', { shiftKey: true }))).toBe('edit.redo');
    expect(commandForKeydown(combo('y'))).toBe('edit.redo');
    expect(commandForKeydown(combo('s'))).toBe('project.saveBackup');
    expect(commandForKeydown(combo('e'))).toBe('project.export');
    expect(commandForKeydown(combo('o'))).toBe('project.open');
  });

  it('maps the zoom combos', () => {
    expect(commandForKeydown(combo('='))).toBe('view.zoomIn');
    expect(commandForKeydown(combo('-'))).toBe('view.zoomOut');
    expect(commandForKeydown(combo('0'))).toBe('view.zoomToFit');
  });

  it('requires a modifier', () => {
    expect(commandForKeydown(new KeyboardEvent('keydown', { key: 'z' }))).toBeNull();
  });

  it('never claims a combo the browser reserves', () => {
    expect(commandForKeydown(combo('n'))).toBeNull();
    expect(commandForKeydown(combo('t'))).toBeNull();

    for (const command of Object.values(COMMANDS)) {
      if (command.browserReserved) {
        expect(command.accelerator).toBeDefined();
      }
    }
  });
});

describe('executeCommand', () => {
  it('runs an always-enabled command', () => {
    executeCommand('project.new');
    expect(useUIStore.getState().isProjectSetupModalOpen).toBe(true);
  });

  it('gates on isEnabled', () => {
    // Empty history: undo is disabled and running it is a no-op
    expect(COMMANDS['edit.undo'].isEnabled?.()).toBe(false);
    executeCommand('edit.undo');

    useSectionStore.getState().addSection('New Schedule');
    expect(COMMANDS['edit.undo'].isEnabled?.()).toBe(true);

    executeCommand('edit.undo');
    expect(useSectionStore.getState().sections).toHaveLength(0);
    expect(COMMANDS['edit.redo'].isEnabled?.()).toBe(true);
  });
});
