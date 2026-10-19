import { describe, it, expect, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  type RenderHookResult,
} from '@testing-library/react';
import type { ChangeEvent } from 'react';
import type { Section, TimelineItem } from '../types';
import { useSectionStore, typeInto, endTypingStep } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { useNameDraft } from '../hooks/useNameDraft';
import { ItemEditor } from '../components/panels/ItemEditor';
import { findItem } from '../utils/itemTree';

function bar(id: string, name: string): TimelineItem {
  return {
    id,
    kind: 'bar',
    name,
    description: '',
    start: '2026-01-01',
    end: '2026-02-01',
    color: null,
    isCollapsed: false,
    children: [],
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
    endDate: '2027-01-01',
    items,
    color: '#333333',
    isCollapsed: false,
  };
}

const history = (): ReturnType<typeof useSectionStore.temporal.getState> =>
  useSectionStore.temporal.getState();
const nameOf = (id: string): string | undefined =>
  findItem(useSectionStore.getState().sections[0].items, id)?.name;

/** Type `text` one letter at a time into a's name, as the editor does. */
function typeName(text: string, field = 'a:name'): void {
  for (let i = 1; i <= text.length; i++) {
    typeInto(field, () =>
      useSectionStore.getState().updateItem('s1', 'a', { name: text.slice(0, i) })
    );
  }
}

beforeEach(() => {
  endTypingStep();
  useSectionStore.setState({ sections: [section('s1', [bar('a', 'Draft')])], dependencies: [] });
  history().clear();
  useUIStore.getState().clearSelection();
});

describe('typing is one undo step per field', () => {
  it('gathers a field’s keystrokes into one step', () => {
    typeName('Industrial design');
    expect(history().pastStates).toHaveLength(1);

    history().undo();
    expect(nameOf('a')).toBe('Draft');
  });

  it('leaves the drag made just before it in history', () => {
    useSectionStore.getState().shiftItem('s1', 'a', 7);
    typeName('A sentence long enough to have spent the whole history');
    expect(history().pastStates).toHaveLength(2);

    history().undo();
    expect(nameOf('a')).toBe('Draft');
    history().undo();
    expect(findItem(useSectionStore.getState().sections[0].items, 'a')?.start).toBe('2026-01-01');
  });

  it('closes the step on undo, so the next keystroke opens a fresh one', () => {
    typeName('Alpha');
    history().undo();
    typeName('Beta');

    expect(nameOf('a')).toBe('Beta');
    expect(history().pastStates).toHaveLength(1);
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(nameOf('a')).toBe('Draft');
  });

  it('closes the step when anything else is written in between', () => {
    typeName('Alpha');
    useSectionStore.getState().updateItem('s1', 'a', { color: '#ff0000' });
    typeName('Alphabet');
    expect(history().pastStates).toHaveLength(3);
  });

  it('closes the step when a field takes focus', () => {
    typeName('Alpha');
    endTypingStep();
    typeName('Alphabet');
    expect(history().pastStates).toHaveLength(2);
  });

  it('keeps two fields apart', () => {
    typeName('Alpha');
    typeInto('a:description', () =>
      useSectionStore.getState().updateItem('s1', 'a', { description: 'Notes' })
    );
    expect(history().pastStates).toHaveLength(2);
  });

  it('records nothing for a write that changes nothing', () => {
    useSectionStore.getState().updateItem('s1', 'a', { name: 'Draft' });
    useSectionStore.getState().updateSection('s1', { name: 's1' });
    expect(history().pastStates).toHaveLength(0);
  });
});

describe('the editor closes when what it edits is gone', () => {
  it('drops the selection when undo takes the item away', () => {
    const createdId = useSectionStore.getState().addItem('s1', null, {
      kind: 'bar',
      name: 'New',
      description: '',
      start: '2026-03-01',
      end: '2026-03-08',
      color: null,
      isCollapsed: false,
    });
    expect(createdId).not.toBeNull();
    useUIStore.getState().selectItem(createdId as string, 's1');
    expect(useUIStore.getState().isModalOpen).toBe(true);

    history().undo();
    expect(useUIStore.getState().selection.id).toBeNull();
    expect(useUIStore.getState().isModalOpen).toBe(false);
  });

  it('drops a schedule selection when the schedule goes', () => {
    useSectionStore.setState({
      sections: [section('s1', []), section('s2', [])],
    });
    useUIStore.getState().selectSection('s2');

    useSectionStore.getState().deleteSection('s2');
    expect(useUIStore.getState().selection.id).toBeNull();
    expect(useUIStore.getState().isModalOpen).toBe(false);
  });
});

describe('useNameDraft', () => {
  const change = (value: string): ChangeEvent<HTMLInputElement> =>
    ({ target: { value } }) as ChangeEvent<HTMLInputElement>;

  function setup(initial: string): {
    hook: RenderHookResult<ReturnType<typeof useNameDraft>, { saved: string }>;
    saves: string[];
    type: (text: string) => void;
  } {
    const saves: string[] = [];
    const hook = renderHook(
      ({ saved }) =>
        useNameDraft(saved, (name) => {
          saves.push(name);
        }),
      { initialProps: { saved: initial } }
    );
    // Stands in for the store: a save comes back as the new saved name
    const type = (text: string): void => {
      act(() => hook.result.current.onChange(change(text)));
      if (saves.length > 0) hook.rerender({ saved: saves[saves.length - 1] });
    };
    return { hook, saves, type };
  }

  it('saves the trimmed text and shows what was typed', () => {
    const { hook, saves, type } = setup('Design');
    type('Design ');
    expect(saves).toEqual([]);
    expect(hook.result.current.value).toBe('Design ');

    type(' Design review ');
    expect(saves).toEqual(['Design review']);
    expect(hook.result.current.value).toBe(' Design review ');
  });

  it('never saves an empty name: an empty field stands for the name it started from', () => {
    const { hook, saves, type } = setup('Design');
    type('');
    expect(saves).toEqual([]);
    expect(hook.result.current.value).toBe('');

    type('X');
    type('');
    expect(saves).toEqual(['X', 'Design']);
    expect(hook.result.current.value).toBe('');

    act(() => hook.result.current.onBlur());
    expect(hook.result.current.value).toBe('Design');
  });

  it('shows the saved name when it changes underneath (an undo)', () => {
    const { hook, type } = setup('Design');
    type('Design review');
    hook.rerender({ saved: 'Design' });
    expect(hook.result.current.value).toBe('Design');
  });
});

describe('the item editor', () => {
  function renderEditor(): void {
    useUIStore.getState().selectItem('a', 's1');
    render(<ItemEditor />);
  }

  it('makes a name typed into it one undo step, and a description another', () => {
    renderEditor();
    const name = screen.getByLabelText('Name');
    for (const text of ['D', 'De', 'Des', 'Desk']) fireEvent.change(name, { target: { value: text } });
    expect(nameOf('a')).toBe('Desk');
    expect(history().pastStates).toHaveLength(1);

    const description = screen.getByLabelText('Description');
    fireEvent.focus(description);
    fireEvent.change(description, { target: { value: 'N' } });
    fireEvent.change(description, { target: { value: 'No' } });
    expect(history().pastStates).toHaveLength(2);

    act(() => history().undo());
    act(() => history().undo());
    expect(nameOf('a')).toBe('Draft');
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Draft');
  });

  it('names its delete for what goes', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Delete bar' })).toBeTruthy();
  });
});
