/**
 * Hevalo's logo, everywhere it appears: the app icon and its Android layers, the splash, the website's marks and
 * social card, and the admin console's mark.
 *
 *   node scripts/generate-brand-marks.mjs
 *
 * The deer is the cut-out drawing the apps already show as their mascot (mobile/assets/mascot-deer.png), kept in
 * scripts/brand with its soft edge coloured from the drawing beside it, so no halo shows on green. He sits on the
 * apps' two accent greens (shared/src/themes.ts), his neck ending at the bottom edge exactly as it is drawn.
 * `hevalo-without-pupils.png` is the same drawing for the admin mark, whose pupils the page draws to follow the pointer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = path.join(ROOT, 'scripts', 'brand');

/** The bright green of the dark theme over the deep green of the light one, read from where the apps take them. */
const [BRIGHT, DEEP] = (() => {
  const themes = fs.readFileSync(path.join(ROOT, 'shared', 'src', 'themes.ts'), 'utf8');
  const accent = themes.slice(themes.indexOf('export const ACCENT'));
  const fill = (scheme) => new RegExp(`${scheme}:\\s*\\{\\s*fill:\\s*'(#[0-9A-Fa-f]{6})'`).exec(accent)?.[1];
  const greens = [fill('dark'), fill('light')];
  if (!greens[0] || !greens[1]) throw new Error('the accent greens were not found in shared/src/themes.ts');
  return greens;
})();

/**
 * How big the deer is, as his width ear to ear over the canvas, and where his neck ends, as a share of its height.
 * The icon ends him at its bottom edge. The Android layer keeps ears and antlers inside the 66dp circle every
 * launcher shows and ends him just under it, so every mask cuts the neck rather than shows its end.
 */
const ICON = { span: 0.9, bottom: 1 };
const ANDROID = { span: 0.56, bottom: 0.87 };

/** How a shipped PNG is encoded: a palette costs nothing visible on painted art and saves most of the bytes. */
const PNG = { palette: true, quality: 95, effort: 10, compressionLevel: 9 };

const deer = path.join(BRAND, 'hevalo.png');
const deerNoPupils = path.join(BRAND, 'hevalo-without-pupils.png');

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';
async function write(file, buffer) {
  const f = path.join(ROOT, ...file.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buffer);
  console.log(`  ${file.padEnd(48)} ${kb(f).padStart(6)}`);
}

/** The green ground: bright above, deep below, a soft light where the face is. */
function field(width, height) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      '<defs>' +
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRIGHT}"/><stop offset="1" stop-color="${DEEP}"/></linearGradient>` +
      '<radialGradient id="l" cx="0.5" cy="0.42" r="0.55">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.04"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      `<rect width="${width}" height="${height}" fill="url(#g)"/><rect width="${width}" height="${height}" fill="url(#l)"/>` +
      '</svg>',
  );
}

/** The deer on a transparent canvas, his width a share of it, his neck ending at `bottom`; what falls below is cut. */
async function placed(source, width, height, span, bottom) {
  const meta = await sharp(source).metadata();
  const w = Math.round(span * Math.min(width, height));
  const h = Math.round((meta.height * w) / meta.width);
  // two pixels past the edge, so the neck runs out of the frame rather than stopping on it
  const top = Math.round(bottom * height) - h + (bottom >= 1 ? 2 : 0);
  const scaled = await sharp(source).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  const shown = await sharp(scaled).extract({ left: 0, top: 0, width: w, height: Math.min(h, height - top) }).toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shown, left: Math.round((width - w) / 2), top }])
    .png()
    .toBuffer();
}

/** The icon's art: the deer on the green, square. */
async function iconArt(size, source = deer) {
  return sharp(field(size, size))
    .composite([{ input: await placed(source, size, size, ICON.span, ICON.bottom) }])
    .png()
    .toBuffer();
}

/** A continuous-corner tile, the shape a phone gives an app icon, as an SVG mask. */
function squircle(size) {
  const n = 5;
  const r = size / 2;
  const points = [];
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    points.push(`${(r + r * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(2)},${(r + r * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(2)}`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><polygon points="${points.join(' ')}"/></svg>`);
}

/** Art cut to the tile, transparent outside it. */
async function tile(art, size) {
  const scaled = await sharp(art).resize(size, size, { kernel: 'lanczos3' }).toBuffer();
  return sharp(scaled).composite([{ input: squircle(size), blend: 'dest-in' }]).png().toBuffer();
}

/** Square and opaque, at a size: what a platform wants for an icon it rounds itself. */
async function square(art, size) {
  return sharp(art).resize(size, size, { kernel: 'lanczos3' }).flatten({ background: DEEP }).png(PNG).toBuffer();
}

const icon = await iconArt(1024);

console.log('phone');
// iOS rejects an app icon with an alpha channel, and rounds the square itself
await write('mobile/assets/icon.png', await square(icon, 1024));
await write('mobile/assets/favicon.png', await square(icon, 48));
{
  // the splash opens on the icon itself, small enough that Android's round splash mask never reaches its corners
  const inner = Math.round(1024 * 0.46);
  const splash = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await tile(icon, inner), gravity: 'centre' }])
    .png(PNG)
    .toBuffer();
  await write('mobile/assets/splash-icon.png', splash);
}
// an adaptive icon is masked to whatever shape the launcher likes: the green is its own layer, the deer the other
const foreground = await placed(deer, 512, 512, ANDROID.span, ANDROID.bottom);
await write('mobile/assets/android-icon-foreground.png', await sharp(foreground).png(PNG).toBuffer());
await write('mobile/assets/android-icon-background.png', await sharp(field(512, 512)).png(PNG).toBuffer());
{
  // themed icons tint one shape: everything drawn becomes one colour, everything else stays clear
  const { data, info } = await sharp(await placed(deer, 432, 432, ANDROID.span, ANDROID.bottom)).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 0;
  await write('mobile/assets/android-icon-monochrome.png', await sharp(data, { raw: info }).png(PNG).toBuffer());
}

console.log('web');
await write('web/public/logo.png', await sharp(await tile(icon, 512)).png(PNG).toBuffer());
// the header's mark is square: the page rounds it to its own corner
await write('web/public/logo-mark.png', await square(icon, 128));
await write('web/public/favicon.png', await sharp(await tile(icon, 64)).png(PNG).toBuffer());
await write('web/public/apple-touch-icon.png', await square(icon, 180));
{
  // a link's preview: the deer rising from the bottom of the green, nothing else
  const card = await sharp(field(1200, 630))
    .composite([{ input: await placed(deer, 1200, 630, 0.8, 1) }])
    .flatten({ background: DEEP })
    .png(PNG)
    .toBuffer();
  await write('web/public/og.png', card);
}

console.log('admin');
{
  // the pupils are drawn by the page (admin/src/brand/mark.css), placed where this drawing's own pupils are in the icon
  const art = await iconArt(1024, deerNoPupils);
  for (const size of [96, 192, 288]) {
    await write(`admin/public/brand/hevalo-${size}.webp`, await sharp(await tile(art, size)).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer());
  }
}
