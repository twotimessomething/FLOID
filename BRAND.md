# FLOID Brand Guidelines

## Philosophy

**Less is more.** FLOID looks like a printed Gantt chart, not a dashboard: flat
ink on one sheet of paper. Every element earns its place, and separation comes
from whitespace rather than from lines and boxes.

The five rules that carry the visual language are documented in `CLAUDE.md`
under **Visual language**. This file covers the brand assets — the mark, the
colours, and the surfaces they appear on.

---

## Logo

The mark is an indigo disc holding four stepped bars — a timeline compressed
into an `F`.

| File | Contents | Used by |
|------|----------|---------|
| `public/FLOID_logo.svg` | Mark + wordmark, dark ink wordmark | Header, walkthrough (light) |
| `public/FLOID_logo_dark.svg` | Mark + wordmark, paper wordmark | Header, walkthrough (dark) |
| `public/favicon.svg` | Mark alone | Favicon, all raster icons, source for the OG image lockup |

The mark itself is identical in light and dark; only the wordmark changes.

### Mark colours

Taken from `src/constants/colors.ts` and mirrored into `src/index.css` as
tokens. The bars alternate mid-tone and tint top to bottom, so adjacent rows
separate on value as well as hue.

| Element | Value | Token |
|---------|-------|-------|
| Disc | `#3a3f76` | `--color-logo-primary` |
| Bar 1 (teal) | `#5bb5a9` | `--color-logo-bar-1` |
| Bar 2 (sky) | `#b1e3f9` | `--color-logo-bar-2` |
| Bar 3 (orange) | `#ea733e` | `--color-logo-bar-3` |
| Bar 4 (pink) | `#f1b5d4` | `--color-logo-bar-4` |

**Never place the mark on a `#3a3f76` field** — the disc disappears and the bars
read as clipped fragments. Put it on the ground (`#f0f0f0`), on paper
(`#ffffff`), or on the dark ground (`#141416`).

In dark mode `--color-logo-primary` resolves to `#9aa0dc`. That lighter indigo
is for UI accents that need to stay readable on the dark ground; the logo
**asset** keeps `#3a3f76` in both themes by design.

### Rasters

Every PNG icon and the OG image are generated, never hand-edited:

```bash
node scripts/generate-icons.mjs
```

Re-run it after any change to `public/favicon.svg` or `public/FLOID_logo.svg`.
It writes `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`,
`android-chrome-192x192.png`, `android-chrome-512x512.png`, `favicon.ico`, and
`og-image.png`.

### The Mac app icon is a different shape, on purpose

```bash
node scripts/generate-mac-icon.mjs --apply
```

Everywhere on the web the mark is the disc. The macOS app icon is **the four
bars on a filled indigo squircle, with no disc at all** — and that divergence
is deliberate, not drift.

macOS reserves a margin around every app icon so that icons of different
shapes read as the same visual size beside each other. Apple's grid on a 1024
canvas gives a rounded shape 824 and a circle only 786, so a disc always sits
smaller than its neighbours in the Dock; a disc drawn full-bleed, as the web
favicon is, sits conspicuously larger instead. Filling the tile also buys the
bars roughly a third more area, which is what keeps all four legible at 32px.

The tile's geometry is measured, not guessed: the corner curve is a
superellipse quadrant fitted to a stock macOS icon's alpha silhouette —
extent 0.246 of the tile side, exponent 2.2 — and it tracks Apple's own
profile within a pixel. Do not swap it for a `<rect rx>`; a circular corner
reads visibly wrong at 512 and above.

The bar geometry itself is lifted verbatim from `public/favicon.svg`, so the
two marks cannot drift apart. `--shape=disc` regenerates the inset-disc
version if the decision is ever revisited.

`src-tauri/icons/icon.ico` is a Windows artefact of the Tauri scaffold and is
still the old disc. Nothing builds for Windows, so it is left alone.

---

## Colour

All colours are CSS variables in `src/index.css`. Use the tokens, not literals.

### Ground and ink (light)

| Role | Value | Token | Usage |
|------|-------|-------|-------|
| **Ground** | `#f0f0f0` | `--color-background` | Everything in the app body |
| **Surface** | `#f0f0f0` | `--color-surface` | Identical to ground on purpose — there are no nested panels |
| **Raised** | `#ffffff` | `--color-raised` | Only things that float: modals, menus, popovers, tooltips |
| **Border** | `#dcdcdc` | `--color-border` | Inputs and floating surfaces |
| **Hairline** | `rgba(23,23,26,0.07)` | `--color-hairline` | Between schedules and beside the label column. That is the whole budget. |
| **Ink** | `#17171a` | `--color-text-primary` | Headings, body |
| **Ink secondary** | `#6a6a70` | `--color-text-secondary` | Labels, captions |
| **Ink muted** | `#9e9ea4` | `--color-text-muted` | Placeholders, disabled |
| **Accent** | `#3a3f76` | `--color-accent` | Focus, selection, toggles |

Dark mode redefines the same tokens under `.dark` — ground `#141416`, raised
`#1d1d20`, ink `#f2f2f3`, accent `#9aa0dc`. Never branch on theme in a
component; read the token.

### Gridlines

Vertical gridlines are **white** (`--color-gridline`), lighter than the ground,
so they read as gaps in the paper rather than rules drawn on it. There are no
horizontal row rules anywhere.

### Schedule and phase colours

Defined in `src/constants/colors.ts`. Do not introduce new accent colours
without adding them there. Colour is resolved, never stored: `color: null`
means inherit.

### Bar text

Never write white text on a coloured bar. Call `getReadableTextColor` from
`src/utils/colorUtils.ts`, which picks ink or paper by measured contrast.

---

## Surfaces and elevation

There are no cards, panels, or bordered containers inside the app body. White
and shadow are reserved for things that genuinely float.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(23,23,26,0.06)` | Inputs, small floating controls |
| `--shadow-md` | `0 6px 20px rgba(23,23,26,0.08)` | Menus, popovers |
| `--shadow-lg` | — | Modals |

Nothing in-page casts a shadow.

---

## Corner radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-bar` | `0` | Timeline bars — always square |
| `--radius-sm` | `3px` | Inputs, buttons, chips |
| `--radius-md` | `6px` | Menus, popovers |
| `--radius-lg` | `10px` | Modals |

Nested elements use the same or smaller radius than their parent.

---

## Typography

**Font:** Inter, with a system fallback stack.

| Role | Size | Weight |
|------|------|--------|
| **Heading** | 14px | 600 |
| **Body** | 14px | 400 |
| **Label** | 12px | 500 |
| **Caption** | 12px | 400 |

Keep text sizes minimal. Avoid anything larger than 14px in the main interface.
Bar labels are regular weight.

---

## Affordances

Chevrons, drag grips, add buttons, and empty-state hints use `.row-affordance`
inside a `.group` row — they are invisible until the row is hovered. A
populated project should look as empty as a blank one.

---

## Motion

Durations and easings are tokens in `src/index.css`. Entrances are `ease-out`,
state changes `ease-in-out`, exits are presence-based. Selection is instant —
never animated. Respect `prefers-reduced-motion`.

---

## Voice

FLOID is **product development scheduling**. That is the phrase every
user-facing surface leads with — page title, meta description, manifest,
`llms.txt`, and the OG image. Industrial design is a supported use case and a
template, not the positioning.

Say what the product does and no more. No superlatives, no invented benefits.
