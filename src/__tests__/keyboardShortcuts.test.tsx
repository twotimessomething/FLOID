/**
 * The sheet's own keys: what the arrows, Return, Space, Escape and Delete do
 * to the selection, and when something else on screen has them instead.
 */
import { renderHook, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { findItem } from '../utils/itemTree';
import type { Section, TimelineItem } from '../types';

function bar(id: string, children: TimelineItem[] = []): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start: '2026-01-01',
    end: '2026-02-01',
    color: null,
    isCollapsed: false,
    children,
  };
}

function section(id: string, items: TimelineItem[]): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#333333',
    isCollapsed: false,
  };
}

function press(
  key: string,
  target: EventTarget = document.body,
  init: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/** A store write the hook has rendered with by the time the next key lands. */
function given(write: () => void): void {
  act(write);
}

function item(id: string): TimelineItem | null {
  const s1 = useSectionStore.getState().sections.find((s) => s.id === 's1');
  return s1 ? findItem(s1.items, id) : null;
}

/** Appended to the page, and taken off it again after each test. */
function mount<T extends HTMLElement>(element: T, parent: HTMLElement = document.body): T {
  parent.appendChild(element);
  return element;
}

beforeEach(() => {
  useSectionStore.setState({
    sections: [section('s1', [bar('g', [bar('c')]), bar('b')])],
    dependencies: [],
    _dragSnapshot: null,
    _dragHistoryIndex: null,
  });
  useSectionStore.temporal.getState().clear();
  useUIStore.getState().clearSelection();
  useUIStore.getState().closeContextMenu();
  useUIStore.getState().closeConfirmDialog();
  renderHook(() => useKeyboardShortcuts());
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('arrows', () => {
  it('move the outline without opening the editor', () => {
    press('ArrowDown');
    expect(useUIStore.getState().selection).toMatchObject({ type: 'section', id: 's1' });
    expect(useUIStore.getState().isModalOpen).toBe(false);

    press('ArrowDown');
    expect(useUIStore.getState().selection).toMatchObject({ type: 'item', id: 'g' });
    expect(useUIStore.getState().isModalOpen).toBe(false);
  });

  it('take the keyboard back from whatever control had it', () => {
    const button = mount(document.createElement('button'));
    button.focus();
    press('ArrowDown', button);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Return', () => {
  it('opens the editor on the selection', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    press('Enter');
    expect(useUIStore.getState().isModalOpen).toBe(true);
    expect(useUIStore.getState().selection.id).toBe('b');
  });

  it('presses a focused button rather than opening the editor', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    const event = press('Enter', mount(document.createElement('button')));
    expect(event.defaultPrevented).toBe(false);
    expect(useUIStore.getState().isModalOpen).toBe(false);
  });
});

describe('Space', () => {
  it('folds the selected group', () => {
    given(() => useUIStore.getState().selectItem('g', 's1', undefined, { openEditor: false }));
    press(' ');
    expect(item('g')?.isCollapsed).toBe(true);
  });

  it('does not fold anything from a focused control', () => {
    given(() => useUIStore.getState().selectItem('g', 's1', undefined, { openEditor: false }));
    press(' ', mount(document.createElement('button')));
    const toggle = mount(document.createElement('div'));
    toggle.setAttribute('role', 'switch');
    press(' ', toggle);
    expect(item('g')?.isCollapsed).toBe(false);
  });

  it('leaves a key already answered by the row it was pressed on', () => {
    given(() => useUIStore.getState().selectItem('g', 's1', undefined, { openEditor: false }));
    const row = mount(document.createElement('div'));
    row.addEventListener('keydown', (e) => e.preventDefault());
    press(' ', row);
    expect(item('g')?.isCollapsed).toBe(false);
  });
});

describe('Escape', () => {
  it('lets go of the selection when nothing is open', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    press('Escape');
    expect(useUIStore.getState().selection.type).toBeNull();
  });

  it('leaves the selection alone while the context menu has the key', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    given(() =>
      useUIStore.getState().openContextMenu({
        position: { x: 0, y: 0 },
        targetType: 'item',
        targetId: 'b',
        sectionId: 's1',
      })
    );
    press('Escape');
    expect(useUIStore.getState().selection.id).toBe('b');
  });
});

describe('a layer over the sheet', () => {
  it('leaves Delete to the sheet when focus is on it', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    press('Backspace');
    expect(item('b')).toBeNull();
  });

  it('keeps Delete inside the dialog its focus is in', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    const dialog = mount(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    press('Backspace', mount(document.createElement('button'), dialog));
    expect(item('b')).not.toBeNull();
  });

  it('holds the selection keys while a confirm is open', () => {
    given(() => useUIStore.getState().selectItem('b', 's1', undefined, { openEditor: false }));
    given(() =>
      useUIStore.getState().openConfirmDialog({ title: 'Sure?', message: '', onConfirm: () => {} })
    );
    press('ArrowUp');
    press('Delete');
    expect(useUIStore.getState().selection.id).toBe('b');
    expect(item('b')).not.toBeNull();
  });
});

describe('⌘Z', () => {
  beforeEach(() => {
    given(() => useSectionStore.getState().updateItem('s1', 'b', { name: 'renamed' }));
  });

  it('is the text’s own in a field holding a draft, like a rename', () => {
    const event = press('z', mount(document.createElement('input')), { metaKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(item('b')?.name).toBe('renamed');
  });

  it('is the sheet’s in the editor, whose fields write straight through', () => {
    given(() => useUIStore.getState().selectItem('b', 's1'));
    const layer = mount(document.createElement('div'));
    layer.className = 'modal-layer';
    const event = press('z', mount(document.createElement('input'), layer), { metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(item('b')?.name).toBe('b');
  });

  it('is the sheet’s with nothing focused', () => {
    press('z', document.body, { metaKey: true });
    expect(item('b')?.name).toBe('b');
  });
});
