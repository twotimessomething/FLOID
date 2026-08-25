/**
 * Compose Mac App Store screenshots from raw window captures.
 *
 * The App Store accepts 1280×800, 1440×900, 2560×1600 or 2880×1800 for macOS.
 * Raw captures are whatever size the display gave them, so this script places
 * each one on a fixed canvas at the app's own ground colour, with a caption
 * above it — flat ink on one sheet of paper, the same rule the app follows.
 *
 * Input:  docs/mac-app-store/screenshots/raw/<file>.png   (see captions.json)
 * Output: docs/mac-app-store/screenshots/out/<n>-<file>.png
 *
 * Usage:
 *   node scripts/generate-store-screenshots.mjs
 *   node scripts/generate-store-screenshots.mjs --plain    # no captions
 *   node scripts/generate-store-screenshots.mjs --shadow   # draw a uniform shadow
 *
 * Raw captures are normalised before anything else: each is trimmed to its
 * opaque window box, so it no longer matters whether Option was held during
 * ⌘⇧4-Space. A capture that kept macOS's own shadow carries ~56pt of
 * translucent padding per side; one that dropped it carries none, and feeding
 * both to `fit: cover` scales them differently — which is how a set ends up
 * with the same app rendered at two sizes. Trimming first removes the
 * variable. --shadow then draws one consistent shadow for every shot.
 */

import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const shotsDir = resolve(root, 'docs', 'mac-app-store', 'screenshots');
const rawDir = join(shotsDir, 'raw');
const outDir = join(shotsDir, 'out');

const config = JSON.parse(readFileSync(join(shotsDir, 'captions.json'), 'utf8'));
const PLAIN = process.argv.includes('--plain');
/** Show the whole window instead of letting it run off the bottom edge. */
const CONTAIN = process.argv.includes('--contain');
/** Draw one uniform drop shadow behind every window, whatever the raw had. */
const SHADOW = process.argv.includes('--shadow');

/** Shadow geometry in canvas pixels, sized to read at 2880 wide. */
const SH = { blur: 34, dy: 18, spread: 8, alpha: 0.26, pad: 90 };

/** Brand tokens, mirrored from src/index.css. */
const THEME = {
  light: { ground: '#f0f0f0', ink: '#17171a', inkSecondary: '#6a6a70' },
  dark: { ground: '#141416', ink: '#f2f2f3', inkSecondary: '#9e9ea4' },
};

const { width: W, height: H } = config.size;

/** Caption band geometry, in canvas pixels. */
const MARGIN = Math.round(W * 0.062);
const TITLE_SIZE = Math.round(W * 0.0295);
const SUB_SIZE = Math.round(W * 0.0163);
const BAND = PLAIN ? 0 : Math.round(H * 0.19);

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function captionSvg({ title, sub }, theme) {
  const t = THEME[theme];
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAND}">` +
      `<style>text{font-family:Inter,-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif}</style>` +
      `<text x="${MARGIN}" y="${Math.round(BAND * 0.46)}" font-size="${TITLE_SIZE}" font-weight="600" ` +
      `fill="${t.ink}" letter-spacing="-1.2">${escape(title)}</text>` +
      (sub
        ? `<text x="${MARGIN}" y="${Math.round(BAND * 0.68)}" font-size="${SUB_SIZE}" font-weight="400" ` +
          `fill="${t.inkSecondary}">${escape(sub)}</text>`
        : '') +
      `</svg>`
  );
}

/**
 * The bounding box of everything fully opaque — i.e. the window itself,
 * without whatever translucent shadow the capture may or may not carry.
 */
async function opaqueBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const opaque = (x, y) => data[(y * width + x) * channels + 3] === 255;
  let left = 0, right = width - 1, top = 0, bottom = height - 1;
  const midY = height >> 1, midX = width >> 1;
  while (left < right && !opaque(left, midY)) left += 1;
  while (right > left && !opaque(right, midY)) right -= 1;
  while (top < bottom && !opaque(midX, top)) top += 1;
  while (bottom > top && !opaque(midX, bottom)) bottom -= 1;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** A rounded-rectangle shadow, drawn rather than inherited from the capture. */
function shadowSvg(w, h, radius) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + SH.pad * 2}" height="${h + SH.pad * 2}">` +
      `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%">` +
      `<feGaussianBlur stdDeviation="${SH.blur}"/></filter></defs>` +
      `<rect x="${SH.pad - SH.spread}" y="${SH.pad - SH.spread + SH.dy}" ` +
      `width="${w + SH.spread * 2}" height="${h + SH.spread * 2}" rx="${radius}" ` +
      `fill="rgba(0,0,0,${SH.alpha})" filter="url(#b)"/></svg>`
  );
}

if (!existsSync(rawDir) || readdirSync(rawDir).filter((f) => f.endsWith('.png')).length === 0) {
  console.error(`No captures in ${rawDir}. See docs/mac-app-store/RELEASE-GUIDE.md, Part 5.`);
  process.exit(1);
}

// Clear only what this script produces. Wiping the whole directory also took
// out/README.md with it — the generated PNGs are not the only thing that
// lives here.
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.png')) rmSync(join(outDir, f), { force: true });
}

let index = 0;
for (const shot of config.shots) {
  const src = join(rawDir, shot.file);
  if (!existsSync(src)) {
    console.warn(`  ⚠ skipped ${shot.file} — not in raw/`);
    continue;
  }
  index += 1;
  const theme = shot.theme === 'dark' ? 'dark' : 'light';
  const ground = THEME[theme].ground;

  // Under the caption the capture runs the full width and off the bottom
  // edge, so the timeline reads as a sheet that continues rather than a
  // window floating in a gutter. --contain fits the whole window instead,
  // which is the honest choice for a shot whose point is a dialog or menu.
  const plotH = H - BAND;

  // Trim to the window itself before any scaling, so a capture that kept
  // macOS's shadow and one that dropped it produce the same geometry.
  const box = await opaqueBox(src);
  let normalised = await sharp(src).extract(box).png().toBuffer();

  if (SHADOW) {
    const scale = (CONTAIN ? W - MARGIN * 2 : W) / box.width;
    const target = Math.round(box.width * scale);
    const targetH = Math.round(box.height * scale);
    const win = await sharp(normalised).resize(target, targetH).toBuffer();
    normalised = await sharp(shadowSvg(target, targetH, Math.round(12 * scale)))
      .composite([{ input: win, top: SH.pad, left: SH.pad }])
      .png()
      .toBuffer();
  }

  const capture = await sharp(normalised)
    .flatten({ background: ground })
    .resize(
      CONTAIN ? W - MARGIN * 2 : W,
      CONTAIN ? plotH - MARGIN : plotH,
      CONTAIN ? { fit: 'inside' } : { fit: 'cover', position: 'top' }
    )
    .toBuffer();
  const meta = await sharp(capture).metadata();

  const layers = [
    {
      input: capture,
      top: BAND + (CONTAIN ? Math.round((plotH - meta.height) / 2) : 0),
      left: Math.round((W - meta.width) / 2),
    },
  ];
  if (!PLAIN) layers.unshift({ input: captionSvg(shot, theme), top: 0, left: 0 });

  const name = `${String(index).padStart(2, '0')}-${shot.file.replace(/^\d+-/, '')}`;
  await sharp({ create: { width: W, height: H, channels: 4, background: ground } })
    .composite(layers)
    .png()
    .toFile(join(outDir, name));

  console.log(`  ${name.padEnd(24)} ${W}×${H}  ${theme}`);
}

console.log(`\n  ${index} screenshot(s) → docs/mac-app-store/screenshots/out/`);
