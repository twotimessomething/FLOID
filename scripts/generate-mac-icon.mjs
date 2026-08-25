/**
 * Generate a macOS-correct app icon from public/favicon.svg.
 *
 * Why this exists: the web favicon is a full-bleed disc — it touches all four
 * edges of its canvas. macOS reserves a margin around every app icon so that
 * icons of different shapes read as the same visual size in the Dock, in
 * Launchpad and in the App Store. A full-bleed disc breaks that grid: it
 * renders noticeably larger than its neighbours, and the macOS App Store
 * listing icon is taken straight from the .icns inside the bundle, so the
 * store page inherits the same problem.
 *
 * Apple's icon grid, expressed on a 1024pt canvas:
 *   rounded square  824 × 824   (radius 185.4)
 *   circle          786 × 786
 *   square          744 × 744
 *
 * FLOID's mark is a circle, so it is drawn at 786 and centred. The mark keeps
 * its brand geometry; only the margin changes.
 *
 * Two shapes are available:
 *
 *   tile (default) — the F bars on a filled indigo squircle at 824/1024. The
 *     native macOS treatment: it fills the grid, so it carries more weight in
 *     the Dock than a circle can, and it sits square with the system apps
 *     beside it. The disc is dropped; the bars keep their brand geometry and
 *     the indigo they always sat on.
 *   disc — the web mark unchanged, inset to the circular grid at 786/1024.
 *
 * Usage:
 *   node scripts/generate-mac-icon.mjs                    # tile → docs/mac-app-store/icon/
 *   node scripts/generate-mac-icon.mjs --shape=disc
 *   node scripts/generate-mac-icon.mjs --apply            # …and install into src-tauri/icons/
 *   node scripts/generate-mac-icon.mjs --out=<dir>
 */

import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, copyFileSync, readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const source = resolve(root, 'public', 'favicon.svg');

const SHAPE = (process.argv.find((a) => a.startsWith('--shape=')) ?? '').split('=')[1] || 'tile';
const OUT_ARG = (process.argv.find((a) => a.startsWith('--out=')) ?? '').split('=')[1];

const outDir = OUT_ARG
  ? resolve(root, OUT_ARG)
  : resolve(root, 'docs', 'mac-app-store', 'icon');
const iconsetDir = join(outDir, 'FLOID.iconset');
const icnsPath = join(outDir, 'icon.icns');

/** Each shape's share of the canvas, per Apple's icon grid. */
const CIRCLE_RATIO = 786 / 1024;
const TILE_RATIO = 824 / 1024;

/** How tall the F block stands inside the tile, as a share of the tile. */
const GLYPH_RATIO = 520 / 824;

/** Brand indigo — the field the bars have always sat on. */
const INDIGO = '#3a3f76';

/**
 * The four bars, lifted verbatim from public/favicon.svg's 296.49 viewBox so
 * the geometry cannot drift from the web mark. Their bounding box is what the
 * tile layout centres.
 */
const BARS = [
  '<polygon fill="#5bb5a9" points="215.41 100.52 82.08 100.52 82.08 67.4 224.4 67.4 215.41 100.52"/>',
  '<rect fill="#b1e3f9" x="82.08" y="110.25" width="57.69" height="33.12"/>',
  '<polygon fill="#f1b5d4" points="116.58 229.09 82.08 229.09 82.08 195.96 125.57 195.96 116.58 229.09"/>',
  '<polygon fill="#ea733e" points="197.37 186.23 128.15 186.23 128.15 153.11 206.36 153.11 197.37 186.23"/>',
  '<rect fill="#ea733e" x="82.08" y="153.11" width="36.23" height="33.12"/>',
].join('');
const BARS_BOX = { x: 82.08, y: 67.4, w: 224.4 - 82.08, h: 229.09 - 67.4 };

/**
 * Apple's tile has straight edges and *continuous* corners — the curvature
 * eases in rather than starting abruptly, which is why an `rx` on a <rect>
 * reads subtly wrong at 512 and above, and why a full superellipse (which
 * curves the edges too) reads much too round.
 *
 * So: straight edges, and each corner traced from a superellipse quadrant
 * confined to an r × r box.
 *
 * Both constants below were fitted to a stock macOS icon rather than guessed.
 * Measuring the alpha silhouette of Notes.app gives a tile at 0.80 of the
 * canvas (Apple's documented 824/1024) and a corner whose curve meets the
 * straight edge 0.246 of the way along it — not the 0.225 nominal radius,
 * because a continuous corner spreads past its radius. Solving the quadrant
 * for the measured inset at each depth lands on n ≈ 2.2: a hair softer than a
 * circular arc, which is exactly what "continuous" buys you.
 */
const CORNER_RATIO = 0.246;
const CORNER_EXPONENT = 2.2;

function cornerArc(cx, cy, r, sx, sy) {
  // Sweeps from (cx + r·sx, cy) round to (cx, cy + r·sy).
  const steps = 48;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * (Math.PI / 2);
    const x = cx + sx * r * Math.cos(t) ** (2 / CORNER_EXPONENT);
    const y = cy + sy * r * Math.sin(t) ** (2 / CORNER_EXPONENT);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join('L');
}

function squirclePath(size) {
  const r = size * CORNER_RATIO;
  const e = size - r;
  return [
    `M${r.toFixed(2)},0`,
    `L${e.toFixed(2)},0`,
    `L${cornerArc(e, r, r, 1, -1).split('L').reverse().join('L')}`,
    `L${size.toFixed(2)},${e.toFixed(2)}`,
    `L${cornerArc(e, e, r, 1, 1)}`,
    `L${r.toFixed(2)},${size.toFixed(2)}`,
    `L${cornerArc(r, e, r, -1, 1).split('L').reverse().join('L')}`,
    `L0,${r.toFixed(2)}`,
    `L${cornerArc(r, r, r, -1, -1)}`,
    'Z',
  ].join('');
}

/** The F bars on a filled squircle, sized to Apple's rounded-shape grid. */
function tileSvg(canvas) {
  const tile = canvas * TILE_RATIO;
  const inset = (canvas - tile) / 2;
  const scale = (tile * GLYPH_RATIO) / BARS_BOX.h;
  const tx = (canvas - BARS_BOX.w * scale) / 2 - BARS_BOX.x * scale;
  const ty = (canvas - BARS_BOX.h * scale) / 2 - BARS_BOX.y * scale;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
      `<g transform="translate(${inset},${inset})">` +
      `<path d="${squirclePath(tile)}" fill="${INDIGO}"/>` +
      `</g>` +
      `<g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${scale.toFixed(6)})">${BARS}</g>` +
      `</svg>`
  );
}

/** Every slot an .icns must carry for the Mac App Store. */
const SLOTS = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

const svg = readFileSync(source);

/**
 * Render the mark inset into Apple's grid at `canvas` pixels square. The
 * result keeps a transparent margin — macOS composites its own shadow and,
 * on macOS 26, its own shape treatment.
 */
async function renderIcon(canvas) {
  if (SHAPE === 'tile') {
    // No `density` here: tileSvg already carries pixel width/height, so a DPI
    // override would rasterise it ~17× oversized and blow sharp's pixel limit.
    return sharp(tileSvg(canvas)).png().toBuffer();
  }

  const mark = Math.round(canvas * CIRCLE_RATIO);
  const offset = Math.round((canvas - mark) / 2);
  const rendered = await sharp(svg, { density: 1200 })
    .resize(mark, mark, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: rendered, top: offset, left: offset }])
    .png()
    .toBuffer();
}

console.log(`  shape: ${SHAPE}\n`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

for (const [name, size] of SLOTS) {
  const buffer = await renderIcon(size);
  await sharp(buffer).toFile(join(iconsetDir, name));
  console.log(`  ${name.padEnd(22)} ${size}×${size}`);
}

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath]);
console.log(`\n  icon.icns              ${(readFileSync(icnsPath).length / 1024).toFixed(0)} KB`);

// The PNGs Tauri lists in bundle.icon alongside the .icns. macOS only reads
// the .icns, but keeping the set in step avoids a mismatched Dock icon if the
// bundle configuration ever changes.
const flat = [
  ['32x32.png', 32],
  ['64x64.png', 64],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
];
for (const [name, size] of flat) {
  await sharp(await renderIcon(size)).toFile(join(outDir, name));
}
console.log(`  ${flat.map(([n]) => n).join(', ')}`);

if (process.argv.includes('--apply')) {
  const target = resolve(root, 'src-tauri', 'icons');
  copyFileSync(icnsPath, join(target, 'icon.icns'));
  for (const [name] of flat) copyFileSync(join(outDir, name), join(target, name));
  console.log(`\n  applied → src-tauri/icons/`);
} else {
  console.log(`\n  written → docs/mac-app-store/icon/  (re-run with --apply to install)`);
}
