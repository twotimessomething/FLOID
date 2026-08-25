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

if (!existsSync(rawDir) || readdirSync(rawDir).filter((f) => f.endsWith('.png')).length === 0) {
  console.error(`No captures in ${rawDir}. See docs/mac-app-store/RELEASE-GUIDE.md, Part 5.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

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
  const capture = await sharp(src)
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
