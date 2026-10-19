/**
 * The context menu as a native one behaves: grouped rows, a keyboard model of
 * its own that keeps the sheet's keys away from the sheet, a colour strip
 * that opens where it was asked for, and every ordinary way of going away.
 */
import { render, screen, cleanup, fireEvent, act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { ContextMenu } from '../components/timeline/ContextMenu';
import { useMenuDismissal } from '../hooks/useMenuDismissal';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { PHASE_COLORS } from '../constants/colors';
import type { Section, TimelineItem } from '../types';
import type { Project } from '../types/project';

function bar(id: string, children: TimelineItem[] = [], color: string | null = null): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start: '2026-01-01',
    end: '2026-02-01',
    color,
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

const project: Project = {
  id: 'p',
  name: 'Project',
  pinnedSectionId: null,
  projectStartDate: '2026-01-01',
  projectEndDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function openOn(targetId: string, targetType: 'item' | 'section' = 'item'): void {
  act(() => {
    useUIStore.getState().openContextMenu({
      position: { x: 10, y: 10 },
      targetType,
      targetId,
      sectionId: 's1',
      location: 'label',
    });
  });
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

function focusedLabel(): string {
  return document.activeElement?.textContent?.trim() ?? '';
}

function isOpen(): boolean {
  return useUIStore.getState().contextMenu.isOpen;
}

beforeEach(() => {
  // g: a group with a child; c: inherits g's palette ink; b: a plain root bar
  useSectionStore.setState({
    sections: [section('s1', [bar('g', [bar('c')], PHASE_COLORS.teal), bar('b')])],
    dependencies: [],
    _dragSnapshot: null,
    _dragHistoryIndex: null,
  });
  useProjectStore.setState({ project, projects: [], activeProjectId: 'p' });
  useUIStore.getState().closeContextMenu();
  render(<ContextMenu />);
});

afterEach(() => {
  act(() => useUIStore.getState().closeContextMenu());
  cleanup();
  document.body.innerHTML = '';
});

describe('groups', () => {
  it('rules off each group, and never puts Delete flush under a move', () => {
    openOn('g');
    const menu = screen.getByRole('menu');
    const sequence = Array.from(menu.children).map((child) =>
      child.getAttribute('role') === 'separator' ? '—' : (child.textContent?.trim() ?? '')
    );
    expect(sequence).toEqual([
      'Edit↩',
      '—',
      'CollapseSpace',
      '—',
      'Add bar inside',
      'Add milestone inside',
      'Add task inside',
      '—',
      'Color',
      'Lock',
      '—',
      'Move up',
      'Move down',
      '—',
      'Delete⌫',
    ]);
  });

  it('drops a group the target has no rows for rather than doubling a rule', () => {
    openOn('c');
    const separators = screen.getAllByRole('separator');
    const rows = screen.getAllByRole('menuitem');
    // Edit | Add… | Color, Lock | Move out, up, down | Delete — no fold
    expect(rows.map((row) => row.textContent?.trim())).not.toContain('CollapseSpace');
    expect(separators).toHaveLength(4);
  });

  it('marks only keys the sheet answers', () => {
    openOn('g');
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'Backspace Delete'
    );
    expect(screen.getByRole('menuitem', { name: /Lock/ })).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('says a save panel follows on export', () => {
    openOn('s1', 'section');
    expect(screen.getByRole('menuitem', { name: 'Export schedule…' })).toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('takes focus on open with nothing highlighted', () => {
    openOn('g');
    expect(document.activeElement).toBe(screen.getByRole('menu'));
  });

  it('walks the rows with the arrows, from nothing to either end', () => {
    openOn('g');
    press('ArrowDown');
    expect(focusedLabel()).toBe('Edit↩');
    press('ArrowDown');
    expect(focusedLabel()).toBe('CollapseSpace');
    press('End');
    expect(focusedLabel()).toBe('Delete⌫');
    press('ArrowDown');
    expect(focusedLabel()).toBe('Delete⌫');
    press('Home');
    expect(focusedLabel()).toBe('Edit↩');
  });

  it('enters from the bottom with ↑', () => {
    openOn('g');
    press('ArrowUp');
    expect(focusedLabel()).toBe('Delete⌫');
  });

  it('passes over a disabled row', () => {
    openOn('b');
    // b is the last root item: Move down is disabled, Move up is not
    press('End');
    press('ArrowUp');
    expect(focusedLabel()).toBe('Move up');
    press('End');
    expect(focusedLabel()).toBe('Delete⌫');
  });

  it('jumps to the next row a letter starts, and round again', () => {
    openOn('g');
    press('a');
    expect(focusedLabel()).toBe('Add bar inside');
    press('a');
    expect(focusedLabel()).toBe('Add milestone inside');
    press('A');
    expect(focusedLabel()).toBe('Add task inside');
    press('a');
    expect(focusedLabel()).toBe('Add bar inside');
  });

  it('does not read Delete or Tab as letters to seek', () => {
    openOn('g');
    press('ArrowDown');
    press('Delete');
    expect(focusedLabel()).toBe('Edit↩');
    press('Tab');
    expect(focusedLabel()).toBe('Edit↩');
  });

  it('keeps the sheet’s keys from the sheet', () => {
    const sheet = vi.fn();
    document.addEventListener('keydown', sheet);
    openOn('g');
    for (const key of ['ArrowDown', 'ArrowUp', 'Delete', 'Backspace', 'Home', 'x']) press(key);
    document.removeEventListener('keydown', sheet);
    expect(sheet).not.toHaveBeenCalled();
    expect(useSectionStore.getState().sections[0].items).toHaveLength(2);
  });

  it('lets a modified combo go on to the app', () => {
    const app = vi.fn();
    document.addEventListener('keydown', app);
    openOn('g');
    press('z', { metaKey: true });
    document.removeEventListener('keydown', app);
    expect(app).toHaveBeenCalledTimes(1);
  });

  it('leaves Return to the highlighted button itself', () => {
    openOn('g');
    press('ArrowDown');
    // Not cancelled: the browser presses the button, once
    expect(press('Enter').defaultPrevented).toBe(false);
  });

  it('closes on Escape, and marks the press answered', () => {
    openOn('g');
    const event = press('Escape');
    expect(isOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('gives focus back to what had it', () => {
    const row = document.createElement('button');
    document.body.appendChild(row);
    row.focus();
    openOn('g');
    expect(document.activeElement).not.toBe(row);
    press('Escape');
    expect(document.activeElement).toBe(row);
  });

  it('follows the pointer with the same highlight', () => {
    openOn('g');
    const lock = screen.getByRole('menuitem', { name: 'Lock' });
    fireEvent.pointerMove(lock);
    expect(document.activeElement).toBe(lock);
    fireEvent.pointerLeave(screen.getByRole('menu'));
    expect(document.activeElement).toBe(screen.getByRole('menu'));
  });
});

describe('the colour strip', () => {
  it('opens directly under the Color row, and says so', () => {
    openOn('g');
    const color = screen.getByRole('menuitem', { name: 'Color' });
    expect(color).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(color);
    expect(color).toHaveAttribute('aria-expanded', 'true');
    expect(color.nextElementSibling).toBe(screen.getByRole('group', { name: 'Colors' }));
  });

  it('marks the ink an item inherits, as the editor does', () => {
    openOn('c');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Color' }));
    expect(screen.getByRole('menuitemradio', { name: 'Teal' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('is one stop for ↑ and ↓, walked with ← and →', () => {
    openOn('c');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Color' }));
    const color = screen.getByRole('menuitem', { name: 'Color' });
    act(() => color.focus());
    press('ArrowDown');
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Teal' }));
    press('ArrowRight');
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Sky' }));
    press('ArrowDown');
    expect(focusedLabel()).toBe('Lock');
  });

  it('paints and closes on a pick', () => {
    openOn('b');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plum' }));
    const b = useSectionStore.getState().sections[0].items[1];
    expect(b.color).toBe(PHASE_COLORS.plum);
    expect(isOpen()).toBe(false);
  });
});

describe('going away', () => {
  it('closes when the sheet scrolls under it', () => {
    openOn('g');
    act(() => {
      document.body.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    });
    expect(isOpen()).toBe(false);
  });

  it('stays put for a wheel over itself', () => {
    openOn('g');
    act(() => {
      screen.getByRole('menu').dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    });
    expect(isOpen()).toBe(true);
  });

  it('closes when the window resizes or loses focus', () => {
    openOn('g');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(isOpen()).toBe(false);

    openOn('g');
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(isOpen()).toBe(false);
  });
});

describe('useMenuDismissal', () => {
  function Dropdown({ onDismiss }: { readonly onDismiss: () => void }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useMenuDismissal(true, onDismiss, ref);
    return (
      <div ref={ref}>
        <button>Inside</button>
      </div>
    );
  }

  it('dismisses on Escape, but not on an Escape that ends a composition', () => {
    const onDismiss = vi.fn();
    render(<Dropdown onDismiss={onDismiss} />);
    press('Escape', { isComposing: true });
    expect(onDismiss).not.toHaveBeenCalled();
    press('Escape');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on a press outside, not inside', async () => {
    const onDismiss = vi.fn();
    render(<Dropdown onDismiss={onDismiss} />);
    // The listener goes on a tick late, past the press that opened the menu
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape to a popover the menu raised, while it is open', () => {
    function WithPopover({ onDismiss }: { readonly onDismiss: () => void }): JSX.Element {
      const ref = useRef<HTMLDivElement>(null);
      useMenuDismissal(true, onDismiss, ref, '[data-test-popover]');
      return (
        <>
          <div ref={ref} />
          <div data-test-popover="" />
        </>
      );
    }
    const onDismiss = vi.fn();
    const { unmount } = render(<WithPopover onDismiss={onDismiss} />);
    press('Escape');
    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });
});

describe('useInlineEdit', () => {
  it('leaves an IME’s Return to the IME', () => {
    const { result } = renderHook(() => useInlineEdit());
    act(() => result.current.startEditing('x', 'EVT'));
    const save = vi.fn();
    const nativeEvent = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true });
    act(() =>
      result.current.handleKeyDown(
        { key: 'Enter', nativeEvent, preventDefault: vi.fn() } as unknown as React.KeyboardEvent,
        save
      )
    );
    expect(save).not.toHaveBeenCalled();
    expect(result.current.editingId).toBe('x');
  });

  it('hands the field what a name wants: no spelling, no capitals, a draft of its own', () => {
    const { result } = renderHook(() => useInlineEdit());
    expect(result.current.inputProps).toEqual({
      spellCheck: false,
      autoCorrect: 'off',
      autoCapitalize: 'off',
      'data-inline-draft': '',
    });
  });
});
