import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { MenuIcon, type MenuIconName } from '../../common/MenuIcon';
import { PHASE_COLORS } from '../../../constants/colors';
import { ROW_HEIGHT } from '../../../utils/timelineUtils';
import { WalkthroughFrame } from './WalkthroughFrame';
import { WalkthroughSheet, SheetLabel, SheetRow, SheetBar } from './WalkthroughSheet';
import { SHEET_DAYS, createSheetWindow } from './sheetWindow';

const BAR = { name: 'Research', color: PHASE_COLORS.teal, from: 6 / SHEET_DAYS, to: 46 / SHEET_DAYS };
/** The sheet's own items come named; only what the person made is untitled. */
const TASK_NAME = 'Sign off';
/**
 * How much open paper sits under the bar.
 *
 * Two rows rather than one because the first pass gave the gesture a single
 * 48px band and it was, correctly, reported as too small to find. Open paper
 * below the last item is where a right-click naturally goes, so the lesson
 * gives it the room that makes it look like paper.
 */
const OPEN_ROWS = 2;

/** The three things a right-click on open paper offers, in the menu's order. */
const MENU: readonly { label: string; icon: MenuIconName; isTask: boolean }[] = [
  { label: 'Add bar here', icon: 'bar', isTask: false },
  { label: 'Add milestone here', icon: 'milestone', isTask: false },
  { label: 'Add task here', icon: 'task', isTask: true },
];

type Stage = 'waiting' | 'menu' | 'placed' | 'done';

interface TaskLessonProps {
  readonly onDone: () => void;
}

/**
 * Lesson three: the menu, and the circle that is a checkbox.
 *
 * Two things are hidden here rather than one, which is why they share a screen
 * instead of taking two. Nothing on the sheet says FLOID has a context menu at
 * all — and the menu is the door to most of what the app can add — and nothing
 * says the circle on a task is tickable, because it is also the thing you grab
 * to drag it. Neither announces itself, and both are one gesture deep.
 *
 * So the line walks: right-click, then the entry, then the circle, then the
 * result. Four instructions, never more than one on screen, each arriving at
 * the moment it can be acted on. Picking the wrong entry does not punish
 * anyone — the menu stays open and the line says which one, the same
 * forgiveness the draw and the drop already offer.
 *
 * A right-click has no object to breathe at, so the invitation is the app's own
 * empty-paper idiom instead: `GhostMilestone`'s faint glyph with the gesture
 * named over it, here previewing the task and following the pointer, so the
 * whole region says it is live the moment a cursor crosses it. Like every hover
 * ghost in the app it checks `pointerType` — a finger has no hover.
 *
 * The menu is rebuilt rather than reused: the real one reads and writes three
 * stores, and there is no project yet for it to read. Its markup, its ink and
 * its glyphs are the real ones, and the three entries are the three a
 * right-click on open paper actually offers.
 */
export function TaskLesson({ onDone }: TaskLessonProps): ReactElement {
  const sheet = useMemo(createSheetWindow, []);
  const paperRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  const [stage, setStage] = useState<Stage>('waiting');
  const [wasNudged, setWasNudged] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  /** Where the task landed: which open row, and how far across the sheet. */
  const [placed, setPlaced] = useState({ row: 0, fraction: 0.5 });

  /** Paper-relative pointer → the row it is over and the fraction across. */
  const resolve = useCallback(
    (clientX: number, clientY: number): { row: number; fraction: number } | null => {
      const rect = paperRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      return {
        row: Math.min(Math.floor((clientY - rect.top) / ROW_HEIGHT), OPEN_ROWS - 1),
        fraction: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
      };
    },
    []
  );

  // The ghost follows the pointer through the DOM rather than through React:
  // the only thing changing is two offsets on one element.
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.pointerType === 'touch' || stage !== 'waiting') return;
      const at = resolve(e.clientX, e.clientY);
      const node = ghostRef.current;
      if (!at || !node) return;
      node.style.left = `${at.fraction * 100}%`;
      node.style.top = `${at.row * ROW_HEIGHT}px`;
      if (!isHovering) setIsHovering(true);
    },
    [resolve, stage, isHovering]
  );

  const handlePointerLeave = useCallback((): void => setIsHovering(false), []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      // The app preventDefaults context menus globally and closes the real one
      // on the way past; this paper settles its own, so it stops here.
      e.preventDefault();
      e.stopPropagation();
      if (stage === 'done' || stage === 'placed') return;
      const at = resolve(e.clientX, e.clientY);
      if (!at) return;
      setPlaced(at);
      setMenuAt({ x: e.clientX, y: e.clientY });
      setIsHovering(false);
      setStage('menu');
    },
    [stage, resolve]
  );

  // A press anywhere else puts the menu away, as the real one does. Closing it
  // empty-handed returns the line to the gesture that opens it.
  useEffect(() => {
    if (stage !== 'menu') return;
    const dismiss = (e: PointerEvent): void => {
      if ((e.target as HTMLElement | null)?.closest('[data-walkthrough-menu]')) return;
      setMenuAt(null);
      setStage('waiting');
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [stage]);

  const handleMenuClick = useCallback((isTask: boolean): void => {
    if (!isTask) {
      setWasNudged(true);
      return;
    }
    setMenuAt(null);
    setStage('placed');
  }, []);

  const handleCheck = useCallback((): void => setStage('done'), []);

  const hasTask = stage === 'placed' || stage === 'done';
  const isDone = stage === 'done';

  const line = isDone
    ? `${TASK_NAME} — done.`
    : stage === 'placed'
      ? 'Click the circle.'
      : stage === 'menu'
        ? wasNudged
          ? 'Task, this time.'
          : 'Add a task.'
        : 'Right-click the paper.';

  return (
    <WalkthroughFrame line={line} onContinue={isDone ? onDone : undefined}>
      <WalkthroughSheet
        sheet={sheet}
        labels={
          <>
            <SheetLabel name="Design" isSchedule />
            <SheetLabel name={BAR.name} />
            {Array.from({ length: OPEN_ROWS }, (_, row) => (
              <SheetLabel key={row} name={hasTask && placed.row === row ? TASK_NAME : ''} />
            ))}
          </>
        }
      >
        <SheetRow />
        <SheetRow>
          <SheetBar from={BAR.from} to={BAR.to} color={BAR.color} name={BAR.name} />
        </SheetRow>

        {/* Open paper. One target, two rows deep and the full width of the
            sheet, because "the paper" has to look like paper to be found. */}
        <div
          ref={paperRef}
          className="relative cursor-context-menu"
          style={{ height: ROW_HEIGHT * OPEN_ROWS }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
        >
          {/* The hint: the task this paper would take, at a quarter strength,
              with the gesture printed over it — GhostMilestone's idiom. */}
          <div
            ref={ghostRef}
            className={`absolute pointer-events-none transition-opacity duration-fast ${
              isHovering && stage === 'waiting' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ height: ROW_HEIGHT }}
            aria-hidden="true"
          >
            <span className="task-check absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 opacity-25" />
            <span className="absolute top-1 left-0 -translate-x-1/2 text-meta leading-none text-[var(--color-text-muted)] whitespace-nowrap">
              Right-click
            </span>
          </div>

          {hasTask && (
            <div
              className="absolute timeline-task walkthrough-appear"
              style={{ left: `${placed.fraction * 100}%`, top: placed.row * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isDone}
                aria-label={`${isDone ? 'Uncheck' : 'Check'} ${TASK_NAME}`}
                onClick={handleCheck}
                className={`task-check absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 focus-ring ${
                  isDone ? 'task-check--done' : 'walkthrough-invite'
                }`}
              />
              <span
                className={`absolute top-1/2 left-3 -translate-y-1/2 text-meta text-[var(--color-text-secondary)] whitespace-nowrap ${
                  isDone ? 'task-name--done' : ''
                }`}
              >
                {TASK_NAME}
              </span>
            </div>
          )}
        </div>
      </WalkthroughSheet>

      {/* The context menu, in the app's own ink. It floats, so it is one of the
          few things allowed a shadow. */}
      {menuAt && (
        <div
          data-walkthrough-menu=""
          className="fixed z-[100] min-w-[160px] py-1 bg-[var(--color-raised)] rounded-[var(--radius-md)] shadow-md border border-[var(--color-border)] popover-enter"
          style={{ left: menuAt.x, top: menuAt.y }}
          role="menu"
          aria-label="Context menu"
        >
          {MENU.map((entry) => (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              onClick={() => handleMenuClick(entry.isTask)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-fast text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
            >
              <MenuIcon name={entry.icon} />
              <span className="flex-1 truncate">{entry.label}</span>
            </button>
          ))}
        </div>
      )}
    </WalkthroughFrame>
  );
}
