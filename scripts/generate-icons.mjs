/**
 * Generate favicon PNGs, apple-touch-icon, android-chrome icons, favicon.ico, and OG image
 * from the source favicon.svg.
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

const svgBuffer = readFileSync(faviconSvg);

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
 * Generate the OG image: brand-colored background with the FLOID logo and tagline.
 */
async function generateOgImage() {
  const width = 1200;
  const height = 630;
  const brandColor = '#6466f1';

  // Render the favicon SVG at a reasonable size for the OG image
  const logoSize = 160;
  const logoPng = await sharp(svgBuffer)
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();

  // Create tagline as SVG text
  const taglineSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600');
      </style>
      <text x="${width / 2}" y="420" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="42" fill="white">
        Design Process Scheduling
      </text>
      <text x="${width / 2}" y="475" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="28" fill="rgba(255,255,255,0.75)">
        Timeline tool for industrial designers
      </text>
    </svg>
  `);

  // Composite: background + logo + tagline text
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: brandColor,
    },
  })
    .composite([
      {
        input: logoPng,
        top: Math.round((height / 2) - logoSize / 2 - 60),
        left: Math.round((width / 2) - logoSize / 2),
      },
      {
        input: taglineSvg,
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
