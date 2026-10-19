/**
 * The modal mechanics every panel shares: which clicks the backdrop takes,
 * where focus goes and comes back to, and which layer Escape belongs to.
 */
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { useModalLayer, isBlockingModalOpen } from '../hooks/useModalLayer';
import { isImeComposing } from '../utils/keyboard';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { ImportConfirmModal } from '../components/layout/ImportConfirmModal';
import { useUIStore } from '../stores/uiStore';
import type { ImportAnalysis } from '../types';

interface HarnessProps {
  readonly isOpen: boolean;
  readonly onDismiss: () => void;
  readonly isBlocking?: boolean;
  readonly id?: string;
  readonly children?: ReactNode;
}

/** A modal reduced to its mechanics. It stays rendered, as a leaving one does. */
function Harness({ isOpen, onDismiss, isBlocking, id = 'modal', children }: HarnessProps): JSX.Element {
  const { panelRef, backdropProps } = useModalLayer({
    isOpen,
    isMounted: true,
    onDismiss,
    isBlocking,
  });
  return (
    <div data-testid={`${id}-layer`} {...backdropProps}>
      <div className="pointer-events-none" />
      <div ref={panelRef} tabIndex={-1} data-testid={`${id}-panel`}>
        <p>Some text to select</p>
        {children}
      </div>
    </div>
  );
}

function pressAndRelease(down: Element, up: Element, detail = 1): void {
  fireEvent.pointerDown(down);
  fireEvent.pointerUp(up);
  // A press and a release on two things click their common ancestor
  fireEvent.click(down === up ? up : screen.getByTestId('modal-layer'), { detail });
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('isImeComposing', () => {
  it('is true mid-composition', () => {
    expect(isImeComposing(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))).toBe(
      true
    );
  });

  it('is true for the Return WKWebView sends after compositionend', () => {
    expect(isImeComposing(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229 }))).toBe(true);
  });

  it('is false for an ordinary Return', () => {
    expect(isImeComposing(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }))).toBe(false);
  });

  it('reads through a React event to the native one', () => {
    const nativeEvent = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true });
    const reactEvent = { nativeEvent } as unknown as React.KeyboardEvent;
    expect(isImeComposing(reactEvent)).toBe(true);
  });
});

describe('the backdrop', () => {
  it('dismisses a click pressed and released on it', () => {
    const onDismiss = vi.fn();
    render(<Harness isOpen onDismiss={onDismiss} />);
    const layer = screen.getByTestId('modal-layer');
    pressAndRelease(layer, layer);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores a text selection dragged out of the panel', () => {
    const onDismiss = vi.fn();
    render(<Harness isOpen onDismiss={onDismiss} />);
    pressAndRelease(screen.getByText('Some text to select'), screen.getByTestId('modal-layer'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores a press on it that is released in the panel', () => {
    const onDismiss = vi.fn();
    render(<Harness isOpen onDismiss={onDismiss} />);
    pressAndRelease(screen.getByTestId('modal-layer'), screen.getByText('Some text to select'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores the second click of the double-click that opened the panel', () => {
    const onDismiss = vi.fn();
    render(<Harness isOpen onDismiss={onDismiss} />);
    const layer = screen.getByTestId('modal-layer');
    pressAndRelease(layer, layer, 2);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores a click whose press came before the panel opened', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Harness isOpen={false} onDismiss={onDismiss} />);
    const layer = screen.getByTestId('modal-layer');
    fireEvent.pointerDown(layer);
    rerender(<Harness isOpen onDismiss={onDismiss} />);
    fireEvent.pointerUp(layer);
    fireEvent.click(layer, { detail: 1 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps focus where it was when pressed', () => {
    render(<Harness isOpen onDismiss={vi.fn()} />);
    const pressed = fireEvent.mouseDown(screen.getByTestId('modal-layer'));
    expect(pressed).toBe(false);
  });
});

describe('focus', () => {
  const buttons = (
    <>
      <button type="button">One</button>
      <button type="button">Two</button>
    </>
  );

  it('moves in, stays in, and goes back to the opener', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { rerender } = render(
      <Harness isOpen={false} onDismiss={vi.fn()}>
        {buttons}
      </Harness>
    );
    rerender(
      <Harness isOpen onDismiss={vi.fn()}>
        {buttons}
      </Harness>
    );
    const panel = screen.getByTestId('modal-panel');
    expect(document.activeElement).toBe(panel);

    // From the panel itself, Tab enters at the first stop
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('One'));

    // Shift+Tab off the first stop comes round to the last
    fireEvent.keyDown(screen.getByText('One'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Two'));

    // Tab off the last stop comes round to the first
    fireEvent.keyDown(screen.getByText('Two'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('One'));

    // Focus that strayed onto the page behind is brought back in
    opener.focus();
    fireEvent.keyDown(opener, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('One'));

    rerender(
      <Harness isOpen={false} onDismiss={vi.fn()}>
        {buttons}
      </Harness>
    );
    expect(document.activeElement).toBe(opener);
  });

  it('goes to a field that asks for it, with its text selected', () => {
    render(
      <Harness isOpen onDismiss={vi.fn()}>
        <input data-autofocus="" defaultValue="Atlas" />
      </Harness>
    );
    const input = screen.getByDisplayValue('Atlas') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);
  });

  it('leaves an autoFocus field focused when a lazy modal mounts open under StrictMode', () => {
    render(
      <StrictMode>
        <Harness isOpen onDismiss={vi.fn()}>
          <input autoFocus defaultValue="Name" />
        </Harness>
      </StrictMode>
    );
    expect(document.activeElement).toBe(screen.getByDisplayValue('Name'));
  });

  it('is let go, not left in a leaving panel, when there is nowhere to return it', () => {
    const { rerender } = render(
      <Harness isOpen={false} onDismiss={vi.fn()}>
        {buttons}
      </Harness>
    );
    rerender(
      <Harness isOpen onDismiss={vi.fn()}>
        {buttons}
      </Harness>
    );
    screen.getByText('Two').focus();
    rerender(
      <Harness isOpen={false} onDismiss={vi.fn()}>
        {buttons}
      </Harness>
    );
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Escape', () => {
  it('dismisses wherever focus is', () => {
    const onDismiss = vi.fn();
    render(<Harness isOpen onDismiss={onDismiss} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('only drops a candidate mid-composition', () => {
    const onDismiss = vi.fn();
    render(<Harness isOpen onDismiss={onDismiss} />);
    fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('belongs to the topmost layer alone', () => {
    const onDismissLower = vi.fn();
    const onDismissUpper = vi.fn();
    const { rerender } = render(
      <>
        <Harness id="lower" isOpen onDismiss={onDismissLower} />
        <Harness id="upper" isOpen={false} onDismiss={onDismissUpper} />
      </>
    );
    rerender(
      <>
        <Harness id="lower" isOpen onDismiss={onDismissLower} />
        <Harness id="upper" isOpen onDismiss={onDismissUpper} />
      </>
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onDismissUpper).toHaveBeenCalledTimes(1);
    expect(onDismissLower).not.toHaveBeenCalled();
  });
});

describe('isBlockingModalOpen', () => {
  it('counts a modal that covers the sheet, and not the floating editor', () => {
    render(<Harness isOpen isBlocking={false} onDismiss={vi.fn()} />);
    expect(isBlockingModalOpen()).toBe(false);
    cleanup();
    render(<Harness isOpen onDismiss={vi.fn()} />);
    expect(isBlockingModalOpen()).toBe(true);
    cleanup();
    expect(isBlockingModalOpen()).toBe(false);
  });
});

describe('ConfirmDialog', () => {
  afterEach(() => {
    act(() => useUIStore.getState().closeConfirmDialog());
  });

  const open = (variant: 'danger' | 'default', onCancel = vi.fn()): void => {
    useUIStore.getState().openConfirmDialog({
      title: 'Delete project?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant,
      onConfirm: vi.fn(),
      onCancel,
    });
    render(<ConfirmDialog />);
  };

  it('puts focus on Cancel when the action is destructive', () => {
    open('danger');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('puts focus on the action otherwise', () => {
    open('default');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
  });

  it('cancels on Escape even with focus on the page', () => {
    const onCancel = vi.fn();
    open('danger', onCancel);
    act(() => document.body.focus());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ImportConfirmModal', () => {
  const analysisFor = (name: string): ImportAnalysis => ({
    type: 'name-collision',
    dateMismatch: false,
    importData: {
      format: 'floid',
      version: '3.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      sourceProjectId: 'elsewhere',
      sourceProjectName: 'Elsewhere',
      schedule: {
        id: name,
        name,
        revision: 1,
        lastModifiedAt: '2026-01-01T00:00:00.000Z',
        color: '#333333',
      },
      projectDates: { startDate: '2026-01-01', endDate: '2026-12-31' },
      scheduleDates: { startDate: '2026-01-01', endDate: '2026-12-31' },
      items: [],
    },
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => useUIStore.getState().closeImportModal());
  });

  it('focuses and selects the name on every import, and Return imports once', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    act(() => useUIStore.getState().openImportModal('name-collision', analysisFor('Design')));
    render(<ImportConfirmModal onConfirm={onConfirm} />);

    const first = screen.getByDisplayValue('Design (Imported)') as HTMLInputElement;
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ newName: 'Design (Imported)' });

    // Let the first panel finish leaving, then import again
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => useUIStore.getState().openImportModal('name-collision', analysisFor('Build')));

    const second = screen.getByDisplayValue('Build (Imported)') as HTMLInputElement;
    expect(document.activeElement).toBe(second);
    expect([second.selectionStart, second.selectionEnd]).toEqual([0, second.value.length]);
  });

  it('closes on Escape when nothing in it has focus', () => {
    const onConfirm = vi.fn();
    act(() =>
      useUIStore
        .getState()
        .openImportModal('new-schedule', { ...analysisFor('Design'), type: 'new-schedule' })
    );
    render(<ImportConfirmModal onConfirm={onConfirm} />);
    act(() => document.body.focus());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUIStore.getState().importModal.isOpen).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
