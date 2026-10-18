import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Section, TimelineItem } from '../types';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import {
  CREATE_PREVIEW_ATTR,
  captureCreateSource,
  handoffFrame,
  handoffOrigin,
  takeCreateSource,
  withCreateSource,
  type CreateSource,
  type HandoffRect,
} from '../utils/createHandoff';
import { createBarAt, createMilestoneAt, createTaskAt } from '../utils/creationUtils';

const box = (left: number, top: number, width: number, height: number): HandoffRect => ({
  left,
  top,
  width,
  height,
});

const source = (overrides: Partial<CreateSource> = {}): CreateSource => ({
  shape: 'span',
  point: { x: 0, y: 0 },
  rect: null,
  preview: null,
  stray: null,
  surface: null,
  ...overrides,
});

describe('the hand from gesture to creation', () => {
  it('is there for the creation the gesture runs, once', () => {
    const recorded = source({ point: { x: 4, y: 8 } });
    const seen: (CreateSource | null)[] = [];
    withCreateSource(recorded, () => {
      seen.push(takeCreateSource());
      seen.push(takeCreateSource());
    });
    expect(seen).toEqual([recorded, null]);
  });

  it('never outlives the call, so a later creation from a menu finds nothing', () => {
    withCreateSource(source(), () => undefined);
    expect(takeCreateSource()).toBeNull();
  });

  it('is cleared even when the creation throws', () => {
    expect(() =>
      withCreateSource(source(), () => {
        throw new Error('no schedule');
      })
    ).toThrow();
    expect(takeCreateSource()).toBeNull();
  });
});

describe('captureCreateSource', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('copies the preview its row is showing, without anything findable on it', () => {
    const row = document.createElement('div');
    row.innerHTML = `<div ${CREATE_PREVIEW_ATTR}="span" class="ghost-enter border-dashed" aria-hidden="true">
        <div data-anything="1" class="ghost-enter"></div>
      </div>`;
    document.body.appendChild(row);

    const captured = captureCreateSource(row, 'span', { x: 10, y: 20 });

    expect(captured.rect).not.toBeNull();
    expect(captured.surface).toBe(row);
    const preview = captured.preview;
    expect(preview).not.toBeNull();
    expect(preview?.isConnected).toBe(false);
    // A copy that kept the mark would be found as the next gesture's ghost
    expect(preview?.hasAttribute(CREATE_PREVIEW_ATTR)).toBe(false);
    expect(preview?.querySelector('[data-anything]')).toBeNull();
    // An entrance replays on a new element; the copy is already there
    expect(preview?.querySelectorAll('.ghost-enter')).toHaveLength(0);
    expect(preview?.classList.contains('ghost-enter')).toBe(false);
    expect(preview?.classList.contains('border-dashed')).toBe(true);
    expect(captured.stray).toBeNull();
  });

  it('flies nothing out of a preview of the other shape, and keeps it only to fade', () => {
    // A bar ghost under a click that made a task: ⌥ was down before the window
    // took focus, so the row went on previewing a bar
    const row = document.createElement('div');
    row.innerHTML = `<div ${CREATE_PREVIEW_ATTR}="span" class="border-dashed"></div>`;
    document.body.appendChild(row);

    const captured = captureCreateSource(row, 'point', { x: 10, y: 20 });

    expect(captured.rect).toBeNull();
    expect(captured.preview).toBeNull();
    expect(captured.stray?.classList.contains('border-dashed')).toBe(true);
    expect(captured.stray?.hasAttribute(CREATE_PREVIEW_ATTR)).toBe(false);
  });

  it('says so when there was no preview on screen', () => {
    const row = document.createElement('div');
    document.body.appendChild(row);
    const captured = captureCreateSource(row, 'point', { x: 10, y: 20 });
    expect(captured.rect).toBeNull();
    expect(captured.preview).toBeNull();
    expect(captured.stray).toBeNull();
    expect(captured.point).toEqual({ x: 10, y: 20 });
  });
});

describe('handoffOrigin', () => {
  const target = box(200, 140, 300, 20);

  it('starts a span as the ghost box itself', () => {
    const ghost = box(190, 112, 310, 20);
    expect(handoffOrigin({ shape: 'span', point: { x: 0, y: 0 }, rect: ghost }, target)).toEqual(
      ghost
    );
  });

  it('grows a span out of the gesture point when no ghost was showing', () => {
    expect(handoffOrigin({ shape: 'span', point: { x: 205, y: 120 }, rect: null }, target)).toEqual(
      box(205, 110, 0, 20)
    );
  });

  it('moves a point at its own size, centre to centre', () => {
    // A task circle's box is a zero-width row-high strip; the ghost's too, in
    // a taller row
    const glyph = box(400, 140, 0, 28);
    const ghost = box(407, 100, 0, 36);
    expect(handoffOrigin({ shape: 'point', point: { x: 0, y: 0 }, rect: ghost }, glyph)).toEqual(
      box(407, 104, 0, 28)
    );
  });

  it('moves a point from the click when no ghost was showing', () => {
    const glyph = box(400, 140, 0, 28);
    expect(handoffOrigin({ shape: 'point', point: { x: 395, y: 90 }, rect: null }, glyph)).toEqual(
      box(395, 76, 0, 28)
    );
  });
});

describe('handoffFrame', () => {
  const origin = box(190, 112, 310, 20);
  const start = box(200, 140, 300, 20);

  it('starts on the ghost', () => {
    expect(handoffFrame(origin, start, start, 0)).toEqual(origin);
  });

  it('ends exactly on the target', () => {
    expect(handoffFrame(origin, start, start, 1)).toEqual(start);
    // and stays there if a late frame overshoots the clock
    expect(handoffFrame(origin, start, start, 1.4)).toEqual(start);
  });

  it('moves monotonically, most of the way early', () => {
    const tops = [0, 0.1, 0.25, 0.5, 0.75, 1].map((t) => handoffFrame(origin, start, start, t).top);
    for (let i = 1; i < tops.length; i += 1) expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1]);
    // The app's ease-out: well past halfway by a quarter of the way through
    expect((tops[2] - origin.top) / (start.top - origin.top)).toBeGreaterThan(0.6);
  });

  it('chases a target that is itself still moving', () => {
    // The schedule around the new row slid 12px down mid-flight
    const live = box(200, 152, 300, 20);
    expect(handoffFrame(origin, start, live, 1)).toEqual(live);
    expect(handoffFrame(origin, start, live, 0).top).toBe(origin.top + 12);
  });
});

// -- creation still commits, selects and spends the source -------------------

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

function section(items: TimelineItem[]): Section {
  return {
    id: 's',
    name: 'S',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#3a3f76',
    isCollapsed: false,
  };
}

describe('creating through the handoff', () => {
  beforeEach(() => {
    useSectionStore.setState({ sections: [section([bar('a'), bar('b')])], dependencies: [] });
    useUIStore.getState().clearSelection();
  });

  it('inserts a drawn bar directly below the row it was drawn in, and selects it', () => {
    const id = withCreateSource(source(), () =>
      createBarAt(
        's',
        { span: { start: '2026-03-01', end: '2026-03-10' }, parentId: null, index: 1 },
        { x: 0, y: 0 }
      )
    );
    const { items } = useSectionStore.getState().sections[0];
    expect(items.map((item) => item.id)).toEqual(['a', id, 'b']);
    expect(items[1]).toMatchObject({ start: '2026-03-01', end: '2026-03-10', kind: 'bar' });
    const { selection, isModalOpen } = useUIStore.getState();
    expect(selection).toMatchObject({ type: 'item', id, sectionId: 's' });
    expect(isModalOpen).toBe(true);
    // The gesture's preview went to this bar and nowhere else
    expect(takeCreateSource()).toBeNull();
  });

  it('makes tasks and milestones the same way', () => {
    const task = createTaskAt('s', { day: '2026-01-05', index: 0 }, { x: 0, y: 0 });
    const milestone = createMilestoneAt('s', { day: '2026-01-06' }, { x: 0, y: 0 });
    const ids = useSectionStore.getState().sections[0].items.map((item) => item.id);
    expect(ids).toEqual([task, 'a', 'b', milestone]);
    expect(useUIStore.getState().selection).toMatchObject({ id: milestone });
  });

  it('makes nothing for a schedule that is not there', () => {
    expect(createTaskAt('missing', { day: '2026-01-05' }, { x: 0, y: 0 })).toBeNull();
    expect(useSectionStore.getState().sections[0].items).toHaveLength(2);
  });
});
