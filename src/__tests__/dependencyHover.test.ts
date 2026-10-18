import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DependencyEdge } from '../types';
import {
  LINK_EXIT_MS,
  NO_DEPARTURES,
  expireDepartures,
  finishHeldDependency,
  getHeldDependency,
  holdDependencyHover,
  isEdgeRevealed,
  releaseHeldDependency,
  reportDependencyLeave,
  reportDependencyHover,
  setHeldDependency,
  trackDepartures,
} from '../utils/dependencyHover';
import { useUIStore } from '../stores/uiStore';

const EDGE: DependencyEdge = {
  id: 'e1',
  from: 'a',
  fromAnchor: 'end',
  to: 'b',
  toAnchor: 'start',
};

const NOTHING = { hoverItemId: null, selectedItemId: null, selectedDependencyId: null };

describe('isEdgeRevealed', () => {
  it('hides a quiet link', () => {
    expect(isEdgeRevealed(EDGE, false, NOTHING)).toBe(false);
  });

  it('shows a violated link whatever else is going on', () => {
    expect(isEdgeRevealed(EDGE, true, NOTHING)).toBe(true);
  });

  it('shows a link when either end is hovered or selected, or it is selected itself', () => {
    expect(isEdgeRevealed(EDGE, false, { ...NOTHING, hoverItemId: 'b' })).toBe(true);
    expect(isEdgeRevealed(EDGE, false, { ...NOTHING, selectedItemId: 'a' })).toBe(true);
    expect(isEdgeRevealed(EDGE, false, { ...NOTHING, selectedDependencyId: 'e1' })).toBe(true);
    expect(isEdgeRevealed(EDGE, false, { ...NOTHING, hoverItemId: 'c' })).toBe(false);
  });
});

describe('held dependency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    finishHeldDependency();
  });
  afterEach(() => {
    finishHeldDependency();
    vi.useRealTimers();
  });

  it('only lets go of the link it is asked about', () => {
    setHeldDependency({ edgeId: 'e1', end: 'to', ink: 'drained' });
    releaseHeldDependency('other');
    expect(getHeldDependency()?.edgeId).toBe('e1');
    releaseHeldDependency('e1');
    expect(getHeldDependency()).toBeNull();
  });

  it('lets go of everything when a new gesture finishes the last one', () => {
    setHeldDependency({ edgeId: 'e1', end: null, ink: 'inked' });
    finishHeldDependency();
    expect(getHeldDependency()).toBeNull();
  });
});

describe('departures', () => {
  const set = (...ids: string[]): ReadonlySet<string> => new Set(ids);

  it('starts a fade for every link that stopped being revealed', () => {
    const leaving = trackDepartures(set('a', 'b'), set('b'), NO_DEPARTURES, 1000);
    expect([...leaving]).toEqual([['a', 1000]]);
  });

  it('keeps the original start for a link already on its way out', () => {
    const first = trackDepartures(set('a'), set(), NO_DEPARTURES, 1000);
    expect(trackDepartures(set(), set(), first, 1050).get('a')).toBe(1000);
  });

  it('cancels the fade of a link revealed again', () => {
    const leaving = trackDepartures(set('a'), set(), NO_DEPARTURES, 1000);
    expect(trackDepartures(set(), set('a'), leaving, 1050).has('a')).toBe(false);
  });

  it('returns the same map when nothing changed, so the layer does not re-render', () => {
    const leaving = trackDepartures(set('a'), set(), NO_DEPARTURES, 1000);
    expect(trackDepartures(set('b'), set('b'), leaving, 1010)).toBe(leaving);
    expect(expireDepartures(leaving, 1000 + LINK_EXIT_MS - 1)).toBe(leaving);
  });

  it('lets a link go once its fade is over', () => {
    const leaving = trackDepartures(set('a'), set(), NO_DEPARTURES, 1000);
    expect(expireDepartures(leaving, 1000 + LINK_EXIT_MS).size).toBe(0);
  });
});

describe('holdDependencyHover', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useUIStore.getState().setDependencyHover(null);
    vi.useRealTimers();
  });

  it('keeps a lingering hover from running out mid-gesture', () => {
    reportDependencyHover('a');
    reportDependencyLeave('a');
    holdDependencyHover();
    vi.advanceTimersByTime(1000);
    expect(useUIStore.getState().dependencyHoverItemId).toBe('a');
  });
});
