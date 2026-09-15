import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { PHASE_COLORS } from '../../../constants/colors';
import { getReadableTextColor } from '../../../utils/colorUtils';
import { NESTED_ROW_HEIGHT } from '../../../utils/timelineUtils';
import { WalkthroughFrame } from './WalkthroughFrame';
import { WalkthroughSheet, SheetLabel, SheetRow, SheetBar } from './WalkthroughSheet';
import { SHEET_DAYS, createSheetWindow } from './sheetWindow';

const PARENT = { name: 'Tooling', color: PHASE_COLORS.orange, from: 8 / SHEET_DAYS, to: 58 / SHEET_DAYS };
const CHILD = { name: 'Samples', color: PHASE_COLORS.ochre, from: 34 / SHEET_DAYS, to: 68 / SHEET_DAYS };

/** How long the row takes to settle before its ink changes hands. */
const INK_BEAT_MS = 260;

type Stage = 'waiting' | 'dragging' | 'grouped';

interface GroupLessonProps {
  readonly onDone: () => void;
}

/**
 * Lesson two: a bar dropped on a bar joins it.
 *
 * The second and last gesture with no affordance. There is deliberately no
 * "add child" button anywhere in FLOID, so nothing on the sheet says a bar
 * will take one — which makes this the only thing a person could use the app
 * for months without finding.
 *
 * The drop is where the rule is taught, and it is taught by movement rather
 * than by a sentence: the row settles in under its new parent, indented and
 * shorter, and only then does its ink change hands. Two beats, never
 * overlapping — overlapping beats read as a figure playing at you, sequenced
 * ones read as things happening. Losing the colour is the whole point, since
 * joining a parent is what clears an item's own colour in the store too; the
 * name survives it, because a bar is layers and only the fill changed.
 *
 * Everything else about grouping is true and cut. Carrying the parent carries
 * its children; dragging back out un-groups. Both are a third idea on a
 * two-idea screen, and both are one gesture away from being found.
 */
export function GroupLesson({ onDone }: GroupLessonProps): ReactElement {
  const sheet = useMemo(createSheetWindow, []);
  const rowRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const inkTimer = useRef<number>();

  const [stage, setStage] = useState<Stage>('waiting');
  const [isOver, setIsOver] = useState(false);
  const [wasNudged, setWasNudged] = useState(false);
  /** Beat two: the ink changes hands once the row has finished moving. */
  const [hasParentInk, setHasParentInk] = useState(false);
  const [clone, setClone] = useState<{ width: number; height: number } | null>(null);

  const grabRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => () => window.clearTimeout(inkTimer.current), []);

  const moveClone = useCallback((clientX: number, clientY: number): void => {
    const grab = grabRef.current;
    const node = cloneRef.current;
    if (!grab || !node) return;
    node.style.transform = `translate(${clientX - grab.dx}px, ${clientY - grab.dy}px)`;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    grabRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setClone({ width: rect.width, height: rect.height });
    // Captured on the row rather than on the bar. A captured element is given
    // `:hover`, and `.timeline-bar:hover .timeline-bar__fill` is one class
    // heavier than `.timeline-bar--lifted .timeline-bar__fill` — so a bar that
    // captures its own drag stays at hover opacity and never drains.
    rowRef.current?.setPointerCapture(e.pointerId);
    setStage('dragging');
    // The clone mounts this frame; place it before it can be seen at the origin.
    const { clientX, clientY } = e;
    requestAnimationFrame(() => moveClone(clientX, clientY));
  }, [moveClone]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (!grabRef.current) return;
      moveClone(e.clientX, e.clientY);
      // The target is resolved by hit-testing the sheet, as the real drag does
      // — the clone is `pointer-events: none`, so it never hides what is under
      // it. Only the resolved answer reaches React.
      const over = document
        .elementsFromPoint(e.clientX, e.clientY)
        .some((el) => el.getAttribute('data-drop-bar') === 'parent');
      setIsOver((was) => (was === over ? was : over));
    },
    [moveClone]
  );

  const handlePointerUp = useCallback((): void => {
    if (!grabRef.current) return;
    grabRef.current = null;
    setClone(null);
    if (!isOver) {
      setWasNudged(true);
      setStage('waiting');
      return;
    }
    setStage('grouped');
    setIsOver(false);
    inkTimer.current = window.setTimeout(() => setHasParentInk(true), INK_BEAT_MS);
  }, [isOver]);

  const handlePointerCancel = useCallback((): void => {
    grabRef.current = null;
    setClone(null);
    setIsOver(false);
    setStage('waiting');
  }, []);

  const isGrouped = stage === 'grouped';
  const childColor = hasParentInk ? PARENT.color : CHILD.color;

  const line = isGrouped
    ? `${CHILD.name} is inside ${PARENT.name}.`
    : stage === 'dragging'
      ? isOver
        ? 'Let go.'
        : `Onto ${PARENT.name}.`
      : wasNudged
        ? `Land it on ${PARENT.name} itself.`
        : `Drag ${CHILD.name} onto ${PARENT.name}.`;

  return (
    <WalkthroughFrame line={line} onContinue={isGrouped ? onDone : undefined}>
      <WalkthroughSheet
        sheet={sheet}
        labels={
          <>
            <SheetLabel name="Engineering" isSchedule />
            <SheetLabel name={PARENT.name} hasChildren={isGrouped} />
            <SheetLabel name={CHILD.name} depth={isGrouped ? 1 : 0} />
          </>
        }
      >
        <SheetRow />
        <SheetRow>
          <SheetBar
            dropId="parent"
            from={PARENT.from}
            to={PARENT.to}
            color={PARENT.color}
            name={PARENT.name}
            isReceiving={isOver}
          />
        </SheetRow>
        <SheetRow depth={isGrouped ? 1 : 0}>
          <div
            ref={rowRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className="absolute inset-0"
          >
            <SheetBar
              from={CHILD.from}
              to={CHILD.to}
              color={childColor}
              name={CHILD.name}
              depth={isGrouped ? 1 : 0}
              isInviting={stage === 'waiting' && !wasNudged}
              isLifted={stage === 'dragging'}
              onPointerDown={stage === 'waiting' ? handlePointerDown : undefined}
            />
          </div>
        </SheetRow>
      </WalkthroughSheet>

      {/* The bar in flight. It floats above the sheet, so unlike a placed bar
          it is allowed a shadow. Its position is written straight to the
          transform: a drag reports sixty times a second and none of those
          frames should re-render a row. */}
      {clone && (
        <div
          ref={cloneRef}
          className="fixed left-0 top-0 z-[80] pointer-events-none will-change-transform"
          style={{ width: clone.width, height: Math.max(clone.height, NESTED_ROW_HEIGHT) }}
          aria-hidden="true"
        >
          <div className="timeline-bar relative w-full h-full shadow-md">
            <div className="timeline-bar__fill" style={{ backgroundColor: CHILD.color }} />
            <span className="timeline-bar__label">
              <span className="truncate" style={{ color: getReadableTextColor(CHILD.color) }}>
                {CHILD.name}
              </span>
            </span>
          </div>
        </div>
      )}
    </WalkthroughFrame>
  );
}
