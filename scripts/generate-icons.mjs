/**
 * Generate favicon PNGs, apple-touch-icon, android-chrome icons, favicon.ico, and OG image.
 *
 * Icons come from public/favicon.svg (the mark alone).
 * The OG image uses public/FLOID_logo.svg (the full lockup) on the app's own
 * paper ground — the mark's disc is brand indigo, so it cannot sit on an
 * indigo field without disappearing.
 *
 * Usage: node scripts/generate-icons.mjs
 * Requires: npm install --save-dev sharp
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const faviconSvg = resolve(publicDir, 'favicon.svg');
const lockupSvg = resolve(publicDir, 'FLOID_logo.svg');

const svgBuffer = readFileSync(faviconSvg);

/**
 * Brand tokens mirrored from src/index.css. Keep these in step with the
 * :root block there — the OG image is the one place they are baked into a
 * raster instead of resolved at runtime.
 */
const GROUND = '#f0f0f0';
const INK = '#17171a';
const INK_SECONDARY = '#6a6a70';

/** The lockup's intrinsic aspect ratio, from its viewBox. */
const LOCKUP_ASPECT = 296.49 / 1141.46;

// --- Generate PNG icons at various sizes ---
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateIcons() {
  console.log('Generating PNG icons from favicon.svg...');

  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(resolve(publicDir, name));
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // --- Generate favicon.ico (from 32x32 PNG) ---
  // ICO format: we'll generate a 32x32 PNG and wrap it in ICO container
  const ico32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const icoBuffer = createIco(ico32, 32, 32);
  writeFileSync(resolve(publicDir, 'favicon.ico'), icoBuffer);
  console.log('  ✓ favicon.ico');

  // --- Generate OG image (1200x630) ---
  await generateOgImage();
  console.log('  ✓ og-image.png (1200x630)');

  console.log('\nAll icons generated successfully!');
}

/**
 * Create a minimal ICO file from a single PNG buffer.
 */
function createIco(pngBuffer, width, height) {
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // ICO type
  iconDir.writeUInt16LE(1, 4); // 1 image

  const iconEntry = Buffer.alloc(16);
  iconEntry.writeUInt8(width >= 256 ? 0 : width, 0);
  iconEntry.writeUInt8(height >= 256 ? 0 : height, 1);
  iconEntry.writeUInt8(0, 2);  // color palette
  iconEntry.writeUInt8(0, 3);  // reserved
  iconEntry.writeUInt16LE(1, 4);  // color planes
  iconEntry.writeUInt16LE(32, 6); // bits per pixel
  iconEntry.writeUInt32LE(pngBuffer.length, 8); // image size
  iconEntry.writeUInt32LE(22, 12); // offset (6 + 16)

  return Buffer.concat([iconDir, iconEntry, pngBuffer]);
}

/**
 * Generate the OG image: the FLOID lockup and the brand line — the same one
 * CLAUDE.md and the welcome walkthrough use — set in ink on the paper ground.
 */
async function generateOgImage() {
  const width = 1200;
  const height = 630;

  const lockupWidth = 520;
  const lockupHeight = Math.round(lockupWidth * LOCKUP_ASPECT);
  const lockupTop = 172;

  const lockupPng = await sharp(readFileSync(lockupSvg))
    .resize(lockupWidth, lockupHeight)
    .png()
    .toBuffer();

  // Text is composited as SVG. Inter is not available to the renderer here, so
  // the fallback stack is what actually ships — keep it a real stack.
  const textSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="402" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="600" font-size="42" fill="${INK}">
        Fluid timelines for product development.
      </text>
      <text x="${width / 2}" y="452" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="500" font-size="26" fill="${INK_SECONDARY}">
        Free and browser-based. No account required.
      </text>
    </svg>
  `);

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: GROUND,
    },
  })
    .composite([
      {
        input: lockupPng,
        top: lockupTop,
        left: Math.round(width / 2 - lockupWidth / 2),
      },
      {
        input: textSvg,
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(resolve(publicDir, 'og-image.png'));
}

generateIcons().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
