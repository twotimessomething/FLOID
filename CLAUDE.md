# FLOID

A timeline scheduling tool for industrial designers.

## Brand

**FLOID** — Fluid timelines for product development.

**Design Philosophy:** Less is more. Simple, clean UX. No unnecessary information. Every interaction should feel natural and immediate.

**Styling:** Use CSS variables defined in `index.css` for colors, spacing, and other design tokens. Prefer CSS vars over hardcoded Tailwind values to maintain visual consistency.

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

| Term | Description |
|------|-------------|
| Section | A schedule track on the timeline. Projects have multiple sections. |
| Master Schedule | The section that drives project dates. Locked sections sync to it. |
| Binding Mode | `locked` (syncs with master) or `independent` (own dates). |
| Phase | Top-level timeline block within a section. Has duration. |
| Element | Sub-item within a phase. Has duration. |
| Milestone | Single-point marker. No duration. |
| Relative Position | 0-1 value within parent bounds. Absolute dates computed at render. |
| Revision | Counter incremented on section modification. Used for import conflicts. |

## Architecture

### State (Zustand)

Three stores, one per domain:

- `projectStore` — Project metadata, master section ID
- `sectionStore` — Sections, phases, elements, milestones
- `uiStore` — Selection, zoom, collapse, modals

### Key Patterns

**Relative positioning:** All items store 0-1 positions. Enables cascading on resize.

**Single selection:** One item selected at a time. Opens sidebar editor.

**Master schedule:** One section designated master via `project.masterSectionId`. Drives project date range. Cannot be deleted.

**Binding modes:** Locked sections rescale when master changes. Independent sections maintain own dates.

**Export formats:**
- `.floid` — Single schedule for sharing
- `.floid-project` — Full project backup

---

## Code Guidelines

### TypeScript

Strict mode. No `any` types.

```typescript
// interface for objects
interface Phase {
  id: string;
  name: string;
}

// type for unions
type SelectionType = 'phase' | 'element' | 'milestone' | 'section';
```

Explicit return types for non-trivial functions. Use `readonly` for immutable data.

### Components

Functional components only. Named exports only. One component per file.

```typescript
interface PhaseRowProps {
  readonly phase: Phase;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

export function PhaseRow({ phase, isSelected, onSelect }: PhaseRowProps) {
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
const { phases, zoom, selection } = useSectionStore();

// Correct - only re-renders when phases change
const phases = useSectionStore(state => state.phases);
```

**Memoize expensive work:**

```typescript
const sortedPhases = useMemo(
  () => phases.toSorted((a, b) => a.order - b.order),
  [phases]
);
```

**Stable callbacks for child components:**

```typescript
const handleSelect = useCallback((id: string) => {
  selectPhase(id);
}, [selectPhase]);
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
| Components | PascalCase | `PhaseRow.tsx` |
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
function getPhase(id: string): Phase | null {
  if (!id) return null;
  return phases.find(p => p.id === id) ?? null;
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
│   ├── timeline/        # Timeline, rows, markers
│   ├── panels/          # Editor panels
│   ├── controls/        # Zoom, add buttons
│   └── common/          # Button, Input, etc.
├── stores/              # Zustand stores
├── hooks/               # Custom hooks
├── types/               # TypeScript types
├── utils/               # Pure utilities
├── constants/           # App constants
└── data/                # Templates, defaults
```
