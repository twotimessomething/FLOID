# FLOID

A timeline scheduling tool for industrial designers.

## Brand

**FLOID** — Fluid timelines for product development.

**Design Philosophy:** Less is more. Simple, clean UX. No unnecessary information. Every interaction should feel natural and immediate.

**Visual language — flat ink on one sheet of paper.** The app is a printed Gantt
chart, not a dashboard. Five rules carry it:

1. **One ground.** Everything sits on `--color-background`. There are no cards,
   panels, or bordered containers inside the app body. `--color-surface` is
   deliberately identical to it. White (`--color-raised`) is only for things that
   *float*: modals, menus, popovers, tooltips.
2. **Almost no lines.** There are no horizontal row rules anywhere. Separation is
   whitespace. Vertical gridlines are **white** (`--color-gridline`) — lighter
   than the ground, so they read as gaps in the paper rather than rules drawn on
   it. A single `--color-hairline` is allowed between schedules and beside the
   label column; that is the whole budget.
3. **Flat, square bars.** `--radius-bar` is `0`. No shadows, no gradients, no
   hover scaling. Bars carry `mix-blend-mode: multiply` (`screen` in dark) so
   overlaps darken like overprinted ink; their container must have
   `isolation: isolate` via `.timeline-plot`. Selection is an inset ink outline
   (`.timeline-bar--selected`), never a colored ring.
4. **Bars are layered, never a single painted div.** A bar is a plain wrapper
   (`.timeline-bar`) holding a blended `.timeline-bar__fill` and, above it, a
   `.timeline-bar__label` plus any handles or glyphs. The wrapper must stay free
   of `opacity`, `transform`, `filter`, and `z-index` — each of those makes it a
   stacking context and traps the fill's blending inside the bar. `outline` and
   `box-shadow` are safe there, which is why the drop-target ring lives on the
   wrapper and the lifted-source state drains `.timeline-bar__fill` instead. Bar
   text is regular weight and takes its color from `getReadableTextColor`, never
   white.
5. **Affordances hide until hover.** Chevrons, drag grips, add buttons, and empty
   -state hints use `.row-affordance` inside a `.group` row. A populated project
   should look as empty as a blank one.

**Styling:** Use CSS variables defined in `index.css` for colors, spacing, and other design tokens. Prefer CSS vars over hardcoded Tailwind values to maintain visual consistency. Never write white text on a colored bar — call `getReadableTextColor` from `utils/colorUtils.ts`, which picks ink or paper by measured contrast.

## Tech Stack

- React 18 + TypeScript (strict mode)
- Vite
- Zustand (state management)
- TailwindCSS
- date-fns

## Commands

```bash
npm run dev       # Start dev server (localhost:3000)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint
npm run format    # Prettier
npm run typecheck # TypeScript check
```

## Core Concepts

Everything on the timeline is one recursive type. There is no phase type, no task
type, and no separate marker-on-a-bar type — depth in the tree is the only
difference between them, and depth is decided by dragging.

| Term | Description |
|------|-------------|
| Schedule (`Section`) | A track on the timeline. Holds items. A project has several. |
| Item (`TimelineItem`) | Anything on a schedule. Either a **bar** (spans days, holds children) or a **milestone** (a single date). Nests to any depth. |
| Group | A bar with children. Made by dropping an item onto a bar, unmade by dragging it out. |
| Pinned Schedule | Optional (0 or 1). Renders on top; its root milestones draw reference lines through every schedule. Purely visual — never moves or rescales anything. |
| Multicolor | Per-schedule option. Root bars take palette colours instead of a gradient of the schedule colour; children inherit from their parent. |
| Day key | `'yyyy-MM-dd'`. The unit of position. Every item stores absolute `start` and `end` day keys. |
| Schedule window | A schedule's declared `startDate`/`endDate`. Items are not clamped to it; the rendered extent is the union of the two. |
| Revision | Counter incremented on schedule modification. Used for import conflicts. |

## Interaction model

Drag and drop is the whole organising story.

- **Create** — double-click open space for a default-length bar, or press and drag
  to draw an exact span. The new bar joins the group of whatever row it was drawn
  in, directly below that row; drawn on a root row, it stays at the root. Either
  way the editor opens on it.
- **Move** — drag a bar anywhere: sideways changes its dates, up and down changes
  where it sits, and it can cross into another schedule. Moving a bar moves
  everything under it.
- **Group** — drop an item onto a bar and it becomes that bar's child, keeping the
  dates it already had. Dragging is the only way to move something between
  groups; there is no "add task" button.
- **Un-group** — drag it back out onto open space.
- **Resize** — drag a bar's edge. Only that bar's edge moves; children keep their
  own dates.
- **Milestones** — double-click a schedule's own row to drop one there (those draw
  a reference line down the schedule). Everywhere else they come from the context
  menu and take a row of their own; they are never drawn on top of a bar.

## Architecture

### State (Zustand)

Three stores, one per domain:

- `projectStore` — Project metadata, pinned schedule id
- `sectionStore` — Schedules and their item trees
- `uiStore` — Selection, zoom, modals, live drag state

### Key Patterns

**Absolute positions.** Items store day keys, never positions relative to a
parent. This is what makes drag-and-drop a list operation: re-parenting an item
does not move it, so an item dropped into another bar — or another schedule —
lands on exactly the pixel it left. It also removes every rescale path the
relative model needed.

**One set of item actions.** `addItem` / `updateItem` / `deleteItem` /
`shiftItem` / `setItemDates` / `moveItem` cover every depth. `moveItem` is the
single commit point for a drag: it re-parents, re-orders and shifts in one
undoable step. Joining a different parent also clears the item's explicit
`color`, so a group reads as one block of ink; a plain re-order leaves a
deliberate colour alone.

**Colour is resolved, not stored.** `color: null` means inherit — a root bar
takes the schedule's palette or gradient from its position, a nested bar takes
its parent's. Nothing auto-assigns a colour, so an explicit one always means the
user picked it, and reordering root bars reflows the palette.

**Aim is not intent.** `dayDeltaForDrop` gives a drop onto a bar a delta of zero:
reaching a bar means travelling to wherever on the timeline it sits, so the item
keeps its own dates. A row spans the full width, so the pointer's position along
one really was chosen — dropping there does move the dates.

**Pure tree operations.** `utils/itemTree.ts` holds every structural operation
(`findItem`, `locateItem`, `removeItemFrom`, `insertItemInto`, `shiftItemDays`,
`itemExtent`, …). Store actions compose them rather than hand-writing nested
`.map` chains.

**One flatten drives everything.** `flattenSection` in `utils/timelineUtils.ts`
turns a schedule into the rows it draws. Both columns, keyboard navigation and
the PNG exporter all walk that same list, so they cannot disagree about what is
on screen. Root milestones are deliberately excluded — they belong to the
schedule's own row.

**Gestures are Pointer Events.** Every drag, resize, draw and reorder listens on
`pointerdown`/`pointermove`/`pointerup`, treats `pointercancel` as an abort
rather than a drop, and captures the pointer where the hit area is small enough
to leave on the first frame. `touch-action: none` goes on the *grabbable* things
— `.timeline-bar`, `.drag-handle`, milestone glyphs, the column separators — and
never on the plot, so a finger on open paper still scrolls the sheet. Hover
ghosts and drawing check `pointerType`: a finger has no hover, and a finger on
empty paper means scroll.

**Overscroll moves the scroll container, not its contents.** Transformed boxes
count toward a scroller's scrollable overflow, so sliding the sheet left at the
far end shrinks `scrollWidth`, the browser clamps `scrollLeft` to match, and the
two cancel out — no bounce, and scroll position silently lost. `utils/rubberBand.ts`
supplies the curve; `Timeline.tsx` writes it to `.timeline-scroll-container`
itself, where it touches no geometry at all.

**Live drag without reflow.** `useItemDrag` clones the dragged bar into a
`position: fixed` preview that follows the cursor, and resolves the drop target
by hit-testing `data-drop-*` attributes with `elementsFromPoint`. Nothing is
written to the store until mouseup, so rows never move while the user is still
choosing. Pointer position is written straight to the preview's transform; only
the resolved drop key reaches the store, so a drag re-renders two rows rather
than the timeline.

**Single selection.** One item, or one schedule, at a time. Opens the editor.

**Migration.** `utils/migrateLegacy.ts` reads the old phase/task/bar-milestone
shape and returns item trees. It is reached from `storageUtils.migrateStoredData`
(versioned by `STORAGE_SCHEMA_VERSION`), from the `.floid` parsers, and from the
template factory — templates are still authored with relative positions and
resolved to absolute dates when instantiated.

**Export formats:**
- `.floid` — Single schedule for sharing
- `.floid-project` — Full project backup

---

## Code Guidelines

### TypeScript

Strict mode. No `any` types.

```typescript
// interface for objects
interface TimelineItem {
  id: string;
  name: string;
}

// type for unions
type ItemKind = 'bar' | 'milestone';
```

Explicit return types for non-trivial functions. Use `readonly` for immutable data.

### Components

Functional components only. Named exports only. One component per file.

```typescript
interface ItemRowProps {
  readonly item: TimelineItem;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

export function ItemRow({ item, isSelected, onSelect }: ItemRowProps) {
  // ...
}
```

Extract logic over ~20 lines to custom hooks.

### Performance

**Eliminate waterfalls.** Parallelize independent async operations:

```typescript
// Wrong - sequential
const user = await getUser();
const posts = await getPosts();

// Correct - parallel
const [user, posts] = await Promise.all([getUser(), getPosts()]);
```

**Minimize re-renders.** Use granular selectors:

```typescript
// Wrong - re-renders on any store change
const { sections, zoom, selection } = useSectionStore();

// Correct - only re-renders when sections change
const sections = useSectionStore(state => state.sections);
```

**Memoize expensive work:**

```typescript
const rows = useMemo(() => flattenSection(section), [section]);
```

**Stable callbacks for child components:**

```typescript
const handleSelect = useCallback((id: string) => {
  selectItem(id, sectionId);
}, [selectItem, sectionId]);
```

**Avoid inline object/array creation in JSX:**

```typescript
// Wrong - new array every render
<List items={items.filter(i => i.active)} />

// Correct
const activeItems = useMemo(() => items.filter(i => i.active), [items]);
<List items={activeItems} />
```

**Hoist default non-primitive props:**

```typescript
// Wrong - new object every render
function Component({ config = {} }) { ... }

// Correct
const DEFAULT_CONFIG = {};
function Component({ config = DEFAULT_CONFIG }) { ... }
```

**Derive state during render, not in effects:**

```typescript
// Wrong
const [isValid, setIsValid] = useState(false);
useEffect(() => {
  setIsValid(value.length > 0);
}, [value]);

// Correct
const isValid = value.length > 0;
```

**Use functional setState for stable callbacks:**

```typescript
// Wrong - needs count in deps
const increment = useCallback(() => setCount(count + 1), [count]);

// Correct - no external deps
const increment = useCallback(() => setCount(c => c + 1), []);
```

**Move interaction logic to event handlers, not effects:**

```typescript
// Wrong
useEffect(() => {
  if (submitted) saveData();
}, [submitted]);

// Correct
const handleSubmit = () => {
  setSubmitted(true);
  saveData();
};
```

### Bundle Size

**Direct imports, no barrel files:**

```typescript
// Wrong
import { Button } from '@/components';

// Correct
import { Button } from '@/components/common/Button';
```

**Dynamic imports for heavy components:**

```typescript
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton />
});
```

### Styling

Tailwind classes only. Inline styles only for computed values:

```typescript
<div
  className="absolute top-0 bg-blue-500 rounded"
  style={{ left: `${position}px`, width: `${width}px` }}
/>
```

Use Tailwind tokens. Avoid arbitrary values:

```typescript
// Prefer
className="p-4 text-gray-600"

// Avoid
className="p-[17px] text-[#666]"
```

### Naming

| Item | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ItemRow.tsx` |
| Hooks | `use` prefix | `useDragResize.ts` |
| Constants | SCREAMING_SNAKE | `MIN_PHASE_DURATION` |
| Booleans | `is/has/can/should` | `isCollapsed` |
| Handlers | `handle` prefix | `handleClick` |

### File Organization

Group by feature. Every directory has `index.ts` with re-exports.

```
components/
  timeline/
    Timeline.tsx
    PhaseRow.tsx
    index.ts
```

Import order: React → external → internal → relative → types.

### Error Handling

Early returns for guards. Handle loading/error states explicitly.

```typescript
function getItem(id: string): TimelineItem | null {
  if (!id) return null;
  return findItem(section.items, id);
}
```

---

## File Structure

```
src/
├── main.tsx
├── App.tsx
├── index.css
├── components/
│   ├── layout/          # Header, sidebars, modals
│   ├── timeline/        # Timeline, SectionRow, ItemRow, markers
│   ├── panels/          # SectionEditor, ItemEditor
│   ├── controls/        # Zoom, add schedule
│   └── common/          # Button, Input, etc.
├── stores/              # Zustand stores
├── hooks/               # Custom hooks (useItemDrag, useCreateGhost, …)
├── types/               # timeline.ts (the model), legacy.ts (what it replaced)
├── utils/               # itemTree, dayKeys, timelineUtils, migrateLegacy, …
├── constants/           # App constants
└── data/                # Templates, defaults
```
