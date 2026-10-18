import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  SHEET_DAYS,
  createSheetWindow,
  dayToFraction,
  fractionToDay,
} from '../components/layout/walkthrough/sheetWindow';
import {
  GESTURE_THRESHOLD_PX,
  ghostSpan,
  hasTravelled,
  morphFrames,
  travelledFarEnough,
} from '../components/layout/walkthrough/gestures';
import { GroupLesson } from '../components/layout/walkthrough/GroupLesson';
import { DrawLesson } from '../components/layout/walkthrough/DrawLesson';
import { finishDragMotion } from '../utils/dragCluster';
import { addDaysToKey, dayKeyDiff } from '../utils/dayKeys';

/**
 * The walkthrough's draw gesture turns a pointer into a date and a date back
 * into a position on the paper. If those two disagree, the dates someone reads
 * while drawing are not the dates the bar gets — which is the one promise the
 * first lesson makes.
 */
describe('walkthrough sheet window', () => {
  const sheet = createSheetWindow();

  it('starts on the first of a month and runs twelve weeks', () => {
    expect(sheet.start.endsWith('-01')).toBe(true);
    expect(dayKeyDiff(sheet.start, sheet.end)).toBe(SHEET_DAYS);
  });

  it('pins its two ends to 0 and 1', () => {
    expect(dayToFraction(sheet, sheet.start)).toBe(0);
    expect(dayToFraction(sheet, sheet.end)).toBe(1);
  });

  it('round-trips every day on the sheet', () => {
    for (let day = 0; day <= SHEET_DAYS; day += 1) {
      const key = addDaysToKey(sheet.start, day);
      expect(fractionToDay(sheet, dayToFraction(sheet, key))).toBe(key);
    }
  });

  it('clamps a pointer that leaves the paper to the paper', () => {
    expect(fractionToDay(sheet, -0.5)).toBe(sheet.start);
    expect(fractionToDay(sheet, 1.5)).toBe(sheet.end);
  });
});

/**
 * The lessons teach the app's gestures, so they have to keep the app's
 * numbers: the same four pixels between a click and a drag, and a ghost that
 * is never drawn from anywhere but the press.
 */
describe('walkthrough gesture arithmetic', () => {
  it('holds a press under the threshold to a click, on either axis', () => {
    expect(GESTURE_THRESHOLD_PX).toBe(4);
    expect(hasTravelled(3.9, 3.9)).toBe(false);
    expect(hasTravelled(4, 0)).toBe(true);
    expect(hasTravelled(0, -4)).toBe(true);
    expect(travelledFarEnough(100, 103)).toBe(false);
    expect(travelledFarEnough(100, 96)).toBe(true);
  });

  it('spans a draw from the press, whichever way it went', () => {
    expect(ghostSpan(200, 260)).toEqual({ left: 200, width: 60 });
    expect(ghostSpan(200, 140)).toEqual({ left: 140, width: 60 });
    expect(ghostSpan(200, 200)).toEqual({ left: 200, width: 0 });
  });

  it('morphs between two px spans, never a px and a percentage', () => {
    expect(morphFrames({ left: 205, width: 28 }, { left: 210, width: 20 })).toEqual([
      { left: '205px', width: '28px' },
      { left: '210px', width: '20px' },
    ]);
  });
});

/** The plot is 840px wide in these tests: ten pixels a day across 84 days. */
const PLOT_WIDTH = 840;

function rectAt(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function heading(): string {
  return screen.getByRole('heading').textContent ?? '';
}

function preview(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(':scope > .drag-preview');
}

describe('GroupLesson drag', () => {
  /** Whether the sheet reports the parent bar under the pointer. */
  let overParent = false;
  let parentBar: HTMLElement;
  let childBar: HTMLElement;
  /** The child's row in the label column. */
  let childLabel: HTMLElement;

  beforeEach(() => {
    overParent = false;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: (): Element[] => (overParent ? [parentBar] : []),
    });
    const { container } = render(createElement(GroupLesson, { onDone: () => undefined }));
    const bars = Array.from(container.querySelectorAll<HTMLElement>('.timeline-bar'));
    parentBar = bars.find((bar) => bar.dataset.dropBar === 'parent') as HTMLElement;
    childBar = bars.find((bar) => bar.dataset.dropBar === undefined) as HTMLElement;
    childLabel = Array.from(container.querySelectorAll<HTMLElement>('span.text-body')).find(
      (span) => span.textContent === 'Samples'
    )?.parentElement as HTMLElement;
  });

  afterEach(() => {
    act(() => finishDragMotion());
    cleanup();
    delete (document as unknown as Record<string, unknown>).elementsFromPoint;
  });

  const press = (x = 400, y = 120): void => {
    fireEvent.pointerDown(childBar, { button: 0, pointerId: 1, clientX: x, clientY: y });
  };
  // A held button, as a real drag reports it: a move with none is a release
  // the page never heard
  const move = (x: number, y: number): void => {
    fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientX: x, clientY: y });
  };
  const release = (x: number, y: number): void => {
    fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y });
  };

  it('treats a press that never travels as a click: nothing lifts, nothing is missed', () => {
    press();
    move(402, 122);
    expect(preview()).toBeNull();
    expect(childBar.classList.contains('walkthrough-invite')).toBe(true);
    release(402, 122);
    expect(preview()).toBeNull();
    expect(heading()).toBe('Drag Samples onto Tooling.');
    expect(childBar.classList.contains('timeline-bar--lifted')).toBe(false);
  });

  it('lifts a clone onto the page once the press passes four pixels', () => {
    press();
    move(404, 120);
    const clone = preview();
    expect(clone).not.toBeNull();
    expect(clone?.textContent).toBe('Samples');
    // The source drains rather than vanishing, and the invitation is over
    expect(childBar.classList.contains('timeline-bar--lifted')).toBe(true);
    expect(childBar.classList.contains('walkthrough-invite')).toBe(false);
    // The clone carries no geometry transition to trail its own landing
    expect(clone?.className).not.toMatch(/transition-\[/);
    expect(document.body.classList.contains('dragging-item')).toBe(true);
    expect(heading()).toBe('Onto Tooling.');
  });

  it('flies home on Escape, hidden bar and all, without calling it a miss', () => {
    press();
    move(420, 60);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(heading()).toBe('Drag Samples onto Tooling.');
    expect(childBar.classList.contains('timeline-bar--lifted')).toBe(false);
    // In flight: the clone is still on the page and the bar waits under it
    expect(preview()).not.toBeNull();
    expect(childBar.hasAttribute('data-drag-landing')).toBe(true);
    act(() => finishDragMotion());
    expect(preview()).toBeNull();
    expect(childBar.hasAttribute('data-drag-landing')).toBe(false);
    expect(document.body.classList.contains('dragging-item')).toBe(false);
    // The pointer coming up afterwards belongs to no gesture
    release(420, 60);
    expect(heading()).toBe('Drag Samples onto Tooling.');
  });

  it('flies home on a miss and says where to land', () => {
    press();
    move(420, 60);
    release(420, 60);
    expect(heading()).toBe('Land it on Tooling itself.');
    expect(childBar.hasAttribute('data-drag-landing')).toBe(true);
    act(() => finishDragMotion());
    expect(preview()).toBeNull();
    expect(childBar.hasAttribute('data-drag-landing')).toBe(false);
  });

  it('decides the drop where the pointer comes up, not where it last moved', () => {
    press();
    move(420, 60);
    expect(heading()).toBe('Onto Tooling.');
    overParent = true;
    release(421, 60);
    expect(heading()).toBe('Samples is inside Tooling.');
    // The bar is already in its nested row, unseen until the clone arrives
    expect(childBar.hasAttribute('data-drag-landing')).toBe(true);
    act(() => finishDragMotion());
    expect(preview()).toBeNull();
    expect(childBar.hasAttribute('data-drag-landing')).toBe(false);
  });

  it('does not take a drop the pointer left before letting go', () => {
    press();
    overParent = true;
    move(420, 60);
    expect(heading()).toBe('Let go.');
    expect(parentBar.classList.contains('timeline-bar--receiving')).toBe(true);
    overParent = false;
    release(420, 200);
    expect(heading()).toBe('Land it on Tooling itself.');
    expect(parentBar.classList.contains('timeline-bar--receiving')).toBe(false);
  });

  it('treats a cancelled pointer as an abort, never a drop', () => {
    press();
    overParent = true;
    move(420, 60);
    fireEvent.pointerCancel(document, { pointerId: 1 });
    expect(heading()).toBe('Drag Samples onto Tooling.');
    expect(childBar.hasAttribute('data-drag-landing')).toBe(true);
  });

  it('ignores a second pointer while the first is dragging', () => {
    press();
    move(420, 60);
    fireEvent.pointerUp(document, { pointerId: 2, clientX: 420, clientY: 60 });
    expect(heading()).toBe('Onto Tooling.');
  });

  it('drains the label row with the bar, as the app does, and restores it on landing', () => {
    press();
    move(420, 60);
    expect(childLabel.style.opacity).toBe('0.32');
    release(420, 60);
    expect(childLabel.style.opacity).toBe('');
  });

  it('leaves a control-click to the context menu', () => {
    fireEvent.pointerDown(childBar, {
      button: 0,
      ctrlKey: true,
      pointerId: 1,
      clientX: 400,
      clientY: 120,
    });
    move(440, 60);
    expect(preview()).toBeNull();
    expect(heading()).toBe('Drag Samples onto Tooling.');
  });

  it('flies home when the window loses focus mid-drag, even over the parent', () => {
    press();
    overParent = true;
    move(420, 60);
    fireEvent.blur(window);
    expect(heading()).toBe('Drag Samples onto Tooling.');
    expect(childBar.hasAttribute('data-drag-landing')).toBe(true);
    expect(document.body.classList.contains('dragging-item')).toBe(false);
    release(420, 60);
    expect(heading()).toBe('Drag Samples onto Tooling.');
  });

  it('flies home on a move with no button held: a release the page never heard', () => {
    press();
    move(420, 60);
    fireEvent.pointerMove(document, { pointerId: 1, buttons: 0, clientX: 430, clientY: 60 });
    expect(heading()).toBe('Drag Samples onto Tooling.');
    expect(childBar.hasAttribute('data-drag-landing')).toBe(true);
  });

  it('asks again what is under a still pointer when the lesson scrolls under it', () => {
    press();
    move(420, 60);
    expect(heading()).toBe('Onto Tooling.');
    overParent = true;
    fireEvent.scroll(document.body);
    expect(heading()).toBe('Let go.');
  });

  it('owns the Escape it answers once lifted, so the app behind it does not answer too', () => {
    const behind = vi.fn();
    document.addEventListener('keydown', behind);
    press();
    move(420, 60);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(behind).not.toHaveBeenCalled();
    document.removeEventListener('keydown', behind);
  });

  it('takes its clone with it when the lesson goes away mid-drag', () => {
    press();
    move(420, 60);
    expect(preview()).not.toBeNull();
    cleanup();
    expect(preview()).toBeNull();
    expect(document.body.classList.contains('dragging-item')).toBe(false);
  });
});

/** What the lesson holds on to of an `Element.animate` result. */
interface FakeAnimation {
  readonly cancel: () => void;
  onfinish: (() => void) | null;
}

describe('DrawLesson draw', () => {
  let row: HTMLElement;
  const animate = vi.fn();

  beforeEach(() => {
    animate.mockReset();
    animate.mockImplementation((): FakeAnimation => ({ cancel: vi.fn(), onfinish: null }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      rectAt(0, 0, PLOT_WIDTH, 48)
    );
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const { container } = render(createElement(DrawLesson, { onDone: () => undefined }));
    row = container.querySelector<HTMLElement>('.cursor-crosshair') as HTMLElement;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (Element.prototype as unknown as Record<string, unknown>).animate;
  });

  const press = (x: number): void => {
    fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: x, clientY: 20 });
  };
  const move = (x: number): void => {
    fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientX: x, clientY: 20 });
  };
  const release = (x: number): void => {
    fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: 20 });
  };
  const ghost = (): HTMLElement | null => row.querySelector<HTMLElement>(':scope > .border-dashed');
  /** The invitation fades rather than unmounting, so ask whether it is showing. */
  const isInviteShown = (): boolean =>
    row.querySelector('[data-walkthrough-invite]')?.getAttribute('data-walkthrough-invite') ===
    'shown';

  /** Every animation the lesson started, on which element, with which frames. */
  const played = (): { element: Element; frames: unknown; animation: FakeAnimation }[] =>
    animate.mock.calls.map((call, i) => ({
      element: animate.mock.contexts[i] as Element,
      frames: call[0],
      animation: animate.mock.results[i]?.value as FakeAnimation,
    }));

  it('keeps the invitation up while a press has not yet become a draw', () => {
    press(205);
    move(207);
    expect(isInviteShown()).toBe(true);
    expect(ghost()).toBeNull();
    expect(heading()).toBe('Drag to draw a bar.');
  });

  it('shows the ghost spanning the distance travelled on its very first frame', () => {
    press(205);
    move(209);
    const drawn = ghost();
    expect(drawn).not.toBeNull();
    expect(drawn?.style.left).toBe('205px');
    expect(drawn?.style.width).toBe('4px');
    // The invitation steps aside with a fade, not a cut
    expect(isInviteShown()).toBe(false);
    expect(row.querySelector('.walkthrough-invite')).not.toBeNull();
    expect(heading()).toBe('Let go to set the end.');
  });

  it('calls a draw off on Escape: the line answers at once, the ghost fades, nothing is made', () => {
    press(205);
    move(233);
    const drawn = ghost();
    fireEvent.keyDown(window, { key: 'Escape' });
    // The person is waiting again the moment they ask to be
    expect(heading()).toBe('Drag to draw a bar.');
    expect(isInviteShown()).toBe(true);
    // ...while the ghost fades rather than blinking out
    const fade = played().find((p) => p.element === drawn);
    expect(fade?.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(ghost()).toBe(drawn);
    act(() => fade?.animation.onfinish?.());
    expect(ghost()).toBeNull();
    release(233);
    expect(row.querySelector('.timeline-bar')).toBeNull();
  });

  it('owns the Escape it answers, so the app behind it does not answer too', () => {
    const behind = vi.fn();
    document.addEventListener('keydown', behind);
    press(205);
    move(233);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(behind).not.toHaveBeenCalled();
    document.removeEventListener('keydown', behind);
  });

  it('comes straight back to the invitation when there is no motion to play', () => {
    delete (Element.prototype as unknown as Record<string, unknown>).animate;
    press(205);
    move(233);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ghost()).toBeNull();
    expect(isInviteShown()).toBe(true);
    expect(heading()).toBe('Drag to draw a bar.');
  });

  it('finishes a fading ghost at once when a new press begins', () => {
    press(205);
    move(233);
    fireEvent.keyDown(window, { key: 'Escape' });
    const fade = played().find((p) => p.element === ghost());
    press(400);
    expect(fade?.animation.cancel).toHaveBeenCalled();
    expect(ghost()).toBeNull();
  });

  it('calls a draw off when the window loses focus, or hears a move with no button held', () => {
    press(205);
    move(233);
    fireEvent.blur(window);
    expect(heading()).toBe('Drag to draw a bar.');
    release(233);
    expect(row.querySelector('.timeline-bar')).toBeNull();

    press(205);
    move(233);
    fireEvent.pointerMove(document, { pointerId: 1, buttons: 0, clientX: 260, clientY: 20 });
    expect(heading()).toBe('Drag to draw a bar.');
    release(260);
    expect(row.querySelector('.timeline-bar')).toBeNull();
  });

  it('sets the ghost into the bar from where it was to the whole days it covers', () => {
    press(205);
    move(233);
    const drawn = ghost();
    release(233);
    const bar = row.querySelector('.timeline-bar');
    expect(bar).not.toBeNull();
    expect(heading()).toBe("2 days. That's a bar.");
    // 20.5 days rounds to 21 and 23.3 to 23: the bar is two days, at 210px.
    // The bar and the ghost under it travel together...
    const morph = [
      { left: '205px', width: '28px' },
      { left: '210px', width: '20px' },
    ];
    expect(played().filter((p) => p.element === bar)[0]?.frames).toEqual(morph);
    expect(played().filter((p) => p.element === drawn)[0]?.frames).toEqual(morph);
    // ...the ink comes up from nothing, over the ghost's own tint...
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      expect.objectContaining({ duration: 120 })
    );
    // ...and the sketch fades from under it, the same element the draw wrote
    // to, and is gone once it has
    const fade = played().filter((p) => p.element === drawn)[1];
    expect(fade?.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(ghost()).toBe(drawn);
    act(() => fade?.animation.onfinish?.());
    expect(ghost()).toBeNull();
    expect(row.querySelector('.timeline-bar')).toBe(bar);
  });

  it('commits without a handoff when motion is reduced', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
    }));
    press(205);
    move(233);
    release(233);
    expect(row.querySelector('.timeline-bar')).not.toBeNull();
    expect(ghost()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('answers a click with the nudge, not a bar', () => {
    press(205);
    release(206);
    expect(row.querySelector('.timeline-bar')).toBeNull();
    expect(heading()).toBe('Press and drag — the distance is the dates.');
  });
});
