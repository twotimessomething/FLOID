import { useEffect, useRef } from 'react';
import { MAX_FIT_PIXELS_PER_DAY, MIN_FIT_PIXELS_PER_DAY } from '../utils/timelineUtils';

/**
 * How hard a pinch pulls: the sheet scales by e^(−deltaY · rate). A trackpad
 * pinch reports a few pixels a frame, which makes this a smooth, continuous
 * zoom rather than a series of steps.
 */
const WHEEL_ZOOM_RATE = 0.01;
/** A mouse wheel notch is ~100px. Held to half that, ⌃-scrolling steps rather than leaps. */
const MAX_WHEEL_DELTA = 50;
/** Firefox reports a mouse wheel in lines, and the odd device in pages. */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/** The scale factor one zooming wheel event asks for. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px =
    deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaMode === 2 ? deltaY * PAGE_HEIGHT_PX : deltaY;
  const clamped = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, px));
  return Math.exp(-clamped * WHEEL_ZOOM_RATE);
}

/** A pinch is free of the named levels, but kept within the bounds a fit keeps. */
export function pinchedPixelsPerDay(pixelsPerDay: number, factor: number): number {
  return Math.min(MAX_FIT_PIXELS_PER_DAY, Math.max(MIN_FIT_PIXELS_PER_DAY, pixelsPerDay * factor));
}

/** WebKit's trackpad pinch. Not in the DOM typings: no other engine has it. */
interface WebKitGestureEvent extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
}

interface UsePinchZoomOptions {
  /** Where a pinch is heard. Null until it mounts. */
  readonly element: HTMLElement | null;
  /** Scale the sheet by `factor`, holding still the day under `clientX`. */
  readonly onZoom: (factor: number, clientX: number) => void;
}

/**
 * Pinching the sheet, which would otherwise zoom the page around it.
 *
 * Chrome and Firefox report a trackpad pinch as a wheel with `ctrlKey` set —
 * the same event a ⌃-held mouse wheel sends, which zooms here too. Safari and
 * the Mac app's WKWebView report it as WebKit gesture events instead, carrying
 * the pinch's running scale. Both arrive as one factor per frame, so a fast
 * pinch re-lays the sheet once a frame rather than once an event.
 *
 * The listener is non-passive — it has to be to keep the page from zooming —
 * which is why it binds to the element and not the document: a non-passive
 * wheel listener up there would hold every scroll on the page to the main
 * thread.
 */
export function usePinchZoom({ element, onZoom }: UsePinchZoomOptions): void {
  // Latest handler for the listeners, which outlive any one render
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useEffect(() => {
    if (!element) return;

    let pendingFactor = 1;
    let pendingX = 0;
    let frame: number | null = null;
    /** The last gesture event's `scale`, while WebKit is reporting a pinch. */
    let gestureScale: number | null = null;

    const queue = (factor: number, clientX: number): void => {
      pendingFactor *= factor;
      pendingX = clientX;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const factorThisFrame = pendingFactor;
        pendingFactor = 1;
        if (factorThisFrame !== 1) onZoomRef.current(factorThisFrame, pendingX);
      });
    };

    const handleWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // WebKit already reports this pinch as a gesture; counting it twice would double it
      if (gestureScale !== null) return;
      queue(wheelZoomFactor(e.deltaY, e.deltaMode), e.clientX);
    };

    const handleGestureStart = (e: Event): void => {
      e.preventDefault();
      gestureScale = 1;
    };

    const handleGestureChange = (e: Event): void => {
      e.preventDefault();
      const { scale, clientX } = e as WebKitGestureEvent;
      if (gestureScale === null || !(scale > 0)) return;
      // `scale` runs from the start of the pinch; the sheet wants this event's share of it
      queue(scale / gestureScale, clientX);
      gestureScale = scale;
    };

    const handleGestureEnd = (e: Event): void => {
      e.preventDefault();
      gestureScale = null;
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('gesturestart', handleGestureStart);
    element.addEventListener('gesturechange', handleGestureChange);
    element.addEventListener('gestureend', handleGestureEnd);
    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('gesturestart', handleGestureStart);
      element.removeEventListener('gesturechange', handleGestureChange);
      element.removeEventListener('gestureend', handleGestureEnd);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [element]);
}
