# FLOID Brand Guidelines

## Philosophy

**Less is more.** Clean, minimal interfaces that let the content breathe. Every element should earn its place.

---

## Glass Surfaces

Use frosted glass (backdrop blur) for any surface that overlays content:

| Surface Type | Usage |
|--------------|-------|
| **Modals** | Always glass with overlay |
| **Sidebars** | Glass when overlapping timeline |
| **Dropdowns/Popovers** | Glass |
| **Tooltips** | Glass |
| **Floating controls** | Glass (e.g., zoom controls, floating action buttons) |

**Do not use glass for:** Inline content, form inputs, primary workspace areas, or elements that don't overlap other content.

### Implementation

```css
/* Light glass surface */
.glass {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* Glass with subtle border (use for most cases) */
.glass-bordered {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

/* Modal overlay */
.glass-overlay {
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
```

**Tailwind shorthand** (add to `index.css` as utilities):
- `glass` — standard glass surface
- `glass-bordered` — glass with border/shadow
- `glass-overlay` — backdrop for modals

---

## Corner Radius

Three sizes. Use consistently.

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| **sm** | 6px | `rounded-md` | Inputs, buttons, small chips, tags |
| **md** | 10px | `rounded-[10px]` | Cards, dropdowns, popovers, timeline bars |
| **lg** | 16px | `rounded-2xl` | Modals, sidebars, large panels |

**Rules:**
- Nested elements use the same or smaller radius than their parent
- Timeline bars use `md` radius
- Buttons and inputs use `sm` radius
- Full-height sidebars: `lg` radius on the interior corners only (or none if edge-to-edge)

---

## Color

### Base Palette

| Role | Value | Usage |
|------|-------|-------|
| **Background** | `#fafafa` | Main workspace |
| **Surface** | `#ffffff` | Cards, panels (when not glass) |
| **Border** | `#e5e7eb` | Dividers, input borders |
| **Text Primary** | `#111827` | Headings, body text |
| **Text Secondary** | `#6b7280` | Labels, captions |
| **Text Muted** | `#9ca3af` | Placeholders, disabled |

### Accent Colors

Phase and team colors are defined in `src/constants/colors.ts`. Do not introduce new accent colors without adding them there.

### Interactive States

| State | Treatment |
|-------|-----------|
| **Hover** | Subtle background shift or opacity change |
| **Active/Pressed** | Slightly darker than hover |
| **Focus** | 2px blue ring (`ring-2 ring-blue-500`) |
| **Disabled** | 50% opacity |

---

## Typography

**Font:** Inter (with system fallbacks)

| Role | Size | Weight | Tailwind |
|------|------|--------|----------|
| **Heading** | 14px | 600 | `text-sm font-semibold` |
| **Body** | 14px | 400 | `text-sm` |
| **Label** | 12px | 500 | `text-xs font-medium` |
| **Caption** | 12px | 400 | `text-xs` |

Keep text sizes minimal. Avoid anything larger than 14px in the main interface.

---

## Spacing

Use Tailwind's default spacing scale. Prefer `4`, `8`, `12`, `16`, `24` pixel increments.

| Context | Padding |
|---------|---------|
| **Panel/sidebar** | `p-4` (16px) |
| **Card** | `p-3` (12px) |
| **Button** | `px-3 py-1.5` |
| **Input** | `px-2 py-1.5` |

---

## Shadows

Minimal shadows. Glass surfaces rely on blur, not heavy shadows.

| Token | Value | Usage |
|-------|-------|-------|
| **sm** | `0 1px 2px rgba(0,0,0,0.05)` | Buttons, inputs |
| **md** | `0 4px 24px rgba(0,0,0,0.06)` | Glass panels, dropdowns |
| **lg** | `0 8px 32px rgba(0,0,0,0.1)` | Modals |

---

## Animation

- **Duration:** 150ms for micro-interactions, 200ms for panels/modals
- **Easing:** `ease-out` for entrances, `ease-in-out` for state changes
- Respect `prefers-reduced-motion`

---

## Quick Reference

```
Glass surface:     bg-white/72 backdrop-blur-[20px]
Modal overlay:     bg-black/20 backdrop-blur-sm
Radius small:      rounded-md (6px)
Radius medium:     rounded-[10px]
Radius large:      rounded-2xl (16px)
Focus ring:        ring-2 ring-blue-500 ring-offset-1
Transition:        transition-colors duration-150
```
