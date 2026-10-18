import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { COMMANDS } from '../commands/commands';
import { commandForKeydown, executeCommand } from '../commands/executeCommand';
import { isGestureInFlight, keyBelongsToGesture, watchGestureKeys } from '../commands/gesture';
import { commitWithSlide, wipeKeyframes } from '../commands/slideCommit';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';

function combo(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, metaKey: true, ...modifiers });
}

beforeEach(() => {
  useUIStore.setState({ isProjectSetupModalOpen: false, isDragging: false, dragType: null });
  useSectionStore.setState({ sections: [], _dragSnapshot: null, _dragHistoryIndex: null });
  useSectionStore.temporal.getState().clear();
  document.body.classList.remove('dependency-drawing', 'layout-settling');
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

describe('a gesture in flight', () => {
  it('is any drag, an open drag transaction, or the link pen', () => {
    expect(isGestureInFlight()).toBe(false);

    useUIStore.getState().setDragging(true, 'move');
    expect(isGestureInFlight()).toBe(true);
    useUIStore.getState().setDragging(false);

    useSectionStore.getState().beginDragTransaction();
    expect(isGestureInFlight()).toBe(true);
    useSectionStore.getState().rollbackDragTransaction();

    document.body.classList.add('dependency-drawing');
    expect(isGestureInFlight()).toBe(true);
    document.body.classList.remove('dependency-drawing');

    expect(isGestureInFlight()).toBe(false);
  });

  it('greys history out, so a menu built from the registry can show it', () => {
    useSectionStore.getState().addSection('New Schedule');
    expect(COMMANDS['edit.undo'].isEnabled?.()).toBe(true);

    useUIStore.getState().setDragging(true, 'move');
    expect(COMMANDS['edit.undo'].isEnabled?.()).toBe(false);

    useUIStore.getState().setDragging(false);
    executeCommand('edit.undo');
    expect(COMMANDS['edit.redo'].isEnabled?.()).toBe(true);

    useUIStore.getState().setDragging(true, 'resize-end');
    expect(COMMANDS['edit.redo'].isEnabled?.()).toBe(false);
  });

  it('holds every command back, not just history', () => {
    useSectionStore.getState().addSection('New Schedule');
    useUIStore.getState().setDragging(true, 'move');

    executeCommand('edit.undo');
    expect(useSectionStore.getState().sections).toHaveLength(1);

    executeCommand('project.new');
    expect(useUIStore.getState().isProjectSetupModalOpen).toBe(false);

    // Once the hand lets go, the same key works
    useUIStore.getState().setDragging(false);
    executeCommand('edit.undo');
    expect(useSectionStore.getState().sections).toHaveLength(0);
  });
});

describe('keyBelongsToGesture', () => {
  let unwatch: () => void = () => undefined;
  const listeners: Array<(event: KeyboardEvent) => void> = [];

  const listen = (listener: (event: KeyboardEvent) => void): void => {
    listeners.push(listener);
    document.addEventListener('keydown', listener);
  };

  beforeEach(() => {
    unwatch = watchGestureKeys();
  });

  afterEach(() => {
    unwatch();
    listeners.splice(0).forEach((listener) => document.removeEventListener('keydown', listener));
  });

  it("remembers an Escape the drag's own handler already spent", () => {
    useUIStore.getState().setDragging(true, 'move');

    // The drag listens first and calls itself off, as a real one does
    listen((event) => {
      if (event.key === 'Escape') useUIStore.getState().setDragging(false);
    });
    let seen: boolean | null = null;
    listen((event) => {
      seen = keyBelongsToGesture(event);
    });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(useUIStore.getState().isDragging).toBe(false);
    expect(seen).toBe(true);
  });

  it('leaves a key pressed at rest alone', () => {
    let seen: boolean | null = null;
    listen((event) => {
      seen = keyBelongsToGesture(event);
    });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(seen).toBe(false);
  });
});

describe('commitWithSlide', () => {
  it('commits synchronously and hands back what the write returned, with no sheet on screen', () => {
    const result = commitWithSlide(() => {
      useSectionStore.getState().addSection('New Schedule');
      return 'written';
    });

    expect(result).toBe('written');
    expect(useSectionStore.getState().sections).toHaveLength(1);
    // Nothing moved, so nothing claims the sheet is settling
    expect(document.body.classList.contains('layout-settling')).toBe(false);
  });

  it("passes a failed write's error through untouched", () => {
    expect(() =>
      commitWithSlide(() => {
        throw new Error('refused');
      })
    ).toThrow('refused');
  });

  it('runs a commit made inside another as part of it, not as a second slide', () => {
    const result = commitWithSlide(() => commitWithSlide(() => 'inner'));
    expect(result).toBe('inner');
  });
});

describe('wipeKeyframes', () => {
  const last = (frames: Keyframe[]): Keyframe => frames[frames.length - 1];

  it('cuts a lone row away exactly as the row below closes over it', () => {
    const frames = wipeKeyframes({ offset: 0, runHeight: 30, closing: 30, lift: 0 }, 30);

    expect(frames.map((frame) => frame.offset)).toEqual([0, 1]);
    expect(frames[0].clipPath).toBe('inset(0px 0px 0px 0px)');
    expect(last(frames).clipPath).toBe('inset(0px 0px 30px 0px)');
    expect(last(frames).opacity).toBe(0);
  });

  it('keeps a row high in a run whole until the closing edge reaches it', () => {
    // Three 30px rows, closed over by the 138px of rows and open space below
    const frames = wipeKeyframes({ offset: 0, runHeight: 90, closing: 138, lift: 0 }, 30);

    expect(frames.map((frame) => frame.offset)).toEqual([0, 60 / 138, 90 / 138, 1]);
    expect(frames[1].clipPath).toBe('inset(0px 0px 0px 0px)');
    expect(frames[2].clipPath).toBe('inset(0px 0px 30px 0px)');
    expect(last(frames).clipPath).toBe('inset(0px 0px 30px 0px)');
  });

  it('rides up with the paper above it', () => {
    const frames = wipeKeyframes({ offset: 0, runHeight: 30, closing: 30, lift: 60 }, 30);
    expect(frames[0].translate).toBe('0px 0px');
    expect(last(frames).translate).toBe('0px -60px');
  });

  it('never cuts what nothing closes over', () => {
    const frames = wipeKeyframes({ offset: 0, runHeight: 30, closing: 0, lift: 0 }, 30);
    expect(frames.every((frame) => frame.clipPath === 'inset(0px 0px 0px 0px)')).toBe(true);
  });
});
