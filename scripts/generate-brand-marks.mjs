/**
 * Hevalo's logo, everywhere it appears: the app icon and its Android layers, the splash, the website's marks and
 * social card, and the admin console's mark.
 *
 *   node scripts/generate-brand-marks.mjs
 *
 * Everything is drawn from the cut-outs in scripts/brand, on the app's own green (the accent in shared/src/themes.ts):
 * - `hevalo.png`: the original deer, lifted off the purple card he was first drawn on, with his neck carried on
 *   down so he rises from the bottom edge of any shape instead of ending in a cut;
 * - `hevalo-without-pupils.png`: the same, for the admin mark, whose pupils are drawn by the page to follow the pointer;
 * - `hevalo-christmas.png`: the festive deer the website shows from 1 December to 6 January.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = path.join(ROOT, 'scripts', 'brand');

/** The app's green, read from where the apps take it, so the logo can never drift from the buttons. */
const GREEN = (() => {
  const themes = fs.readFileSync(path.join(ROOT, 'shared', 'src', 'themes.ts'), 'utf8');
  const found = /light:\s*\{\s*fill:\s*'(#[0-9A-Fa-f]{6})'/.exec(themes.slice(themes.indexOf('export const ACCENT')));
  if (!found) throw new Error('the accent green was not found in shared/src/themes.ts');
  return found[1];
})();

/** Rows of `hevalo.png` that are the drawing; below them is the neck carried on. */
const DRAWN = 869;

/**
 * Where the deer sits, as fractions of the canvas: `span` is his width from ear to ear, `top` where his antlers start.
 * The icon fills the square boldly; the Android layer keeps ears and antlers inside the 66dp circle every launcher
 * shows, and lets the neck run out under the mask. The admin mark's eyes (admin/src/brand/mark.css) are measured at ICON.
 */
const ICON = { span: 0.86, top: 0.09 };
const ANDROID = { span: 0.57, top: 0.275 };

/** How a shipped PNG is encoded: a palette costs nothing visible on painted art and saves most of the bytes. */
const PNG = { palette: true, quality: 95, effort: 10, compressionLevel: 9 };

const deer = path.join(BRAND, 'hevalo.png');
const deerNoPupils = path.join(BRAND, 'hevalo-without-pupils.png');
const deerChristmas = path.join(BRAND, 'hevalo-christmas.png');

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';
async function write(file, buffer) {
  const f = path.join(ROOT, ...file.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buffer);
  console.log(`  ${file.padEnd(48)} ${kb(f).padStart(6)}`);
}

/** The deer placed on a transparent canvas, cut by its bottom edge. */
async function bust(source, width, height, span, top) {
  const meta = await sharp(source).metadata();
  const w = Math.round(span * width);
  const h = Math.round((meta.height * w) / meta.width);
  const y = Math.round(top * height);
  const scaled = await sharp(source).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  const shown = await sharp(scaled).extract({ left: 0, top: 0, width: w, height: Math.min(h, height - y) }).toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shown, left: Math.round((width - w) / 2), top: y }])
    .png()
    .toBuffer();
}

/** The green square with the deer rising from its bottom edge: the app icon's art. */
async function iconArt(size, source = deer) {
  return sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
    .composite([{ input: await bust(source, size, size, ICON.span, ICON.top) }])
    .png()
    .toBuffer();
}

/** The festive deer, scarf and all, standing in the green square: the scarf ends him, so no neck is needed. */
async function christmasArt(size) {
  const meta = await sharp(deerChristmas).metadata();
  const h = Math.round(size * 0.86);
  const w = Math.round((meta.width * h) / meta.height);
  const scaled = await sharp(deerChristmas).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
    .composite([{ input: scaled, left: Math.round((size - w) / 2), top: Math.round(size * 0.1) }])
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
    const x = r + r * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = r + r * Math.sign(s) * Math.abs(s) ** (2 / n);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><polygon points="${points.join(' ')}"/></svg>`);
}

/** Art cut to the tile, transparent outside it. */
async function tile(art, size) {
  const scaled = await sharp(art).resize(size, size, { kernel: 'lanczos3' }).toBuffer();
  return sharp(scaled)
    .composite([{ input: squircle(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** A tile centred on a transparent canvas, at a fraction of it. */
async function tileOnGlass(art, size, fraction) {
  const inner = Math.round(size * fraction);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await tile(art, inner), gravity: 'centre' }])
    .png(PNG)
    .toBuffer();
}

/** Square and opaque, at a size: what a platform wants for an icon it rounds itself. */
async function square(art, size) {
  return sharp(art).resize(size, size, { kernel: 'lanczos3' }).flatten({ background: GREEN }).png(PNG).toBuffer();
}

const icon = await iconArt(1024);
const christmas = await christmasArt(1024);

console.log('phone');
// iOS rejects an app icon with an alpha channel, and rounds the square itself
await write('mobile/assets/icon.png', await square(icon, 1024));
await write('mobile/assets/favicon.png', await square(icon, 48));
// the splash opens on the icon itself; within a third of the image either side of centre, so Android's round
// splash mask never reaches its corners
await write('mobile/assets/splash-icon.png', await tileOnGlass(icon, 1024, 0.46));
// an adaptive icon is masked to whatever shape the launcher likes: the green is its own layer, the deer the other
await write('mobile/assets/android-icon-foreground.png', await sharp(await bust(deer, 512, 512, ANDROID.span, ANDROID.top)).png(PNG).toBuffer());
await write('mobile/assets/android-icon-background.png', await sharp({ create: { width: 512, height: 512, channels: 4, background: GREEN } }).png(PNG).toBuffer());
{
  // themed icons tint one shape: everything drawn becomes one colour, everything else stays clear
  const { data, info } = await sharp(await bust(deer, 432, 432, ANDROID.span, ANDROID.top)).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 0;
  await write('mobile/assets/android-icon-monochrome.png', await sharp(data, { raw: info }).png(PNG).toBuffer());
}

/*
 * The mascot picture in both apps (a notice, a maintenance page, feedback) is the drawing alone, as it always was,
 * now with edges free of the old card's purple.
 */
{
  const meta = await sharp(deer).metadata();
  const drawing = await sharp(deer).extract({ left: 0, top: 0, width: meta.width, height: DRAWN }).toBuffer();
  const h = Math.round((DRAWN * 512) / meta.width);
  const scaled = await sharp(drawing).resize(512, h, { kernel: 'lanczos3' }).toBuffer();
  const mascot = await sharp({ create: { width: 512, height: 480, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, left: 0, top: 480 - h }])
    .png(PNG)
    .toBuffer();
  await write('mobile/assets/mascot-deer.png', mascot);
  await write('web/public/mascot-deer.png', mascot);
}

console.log('web');
await write('web/public/logo.png', await sharp(await tile(icon, 512)).png(PNG).toBuffer());
await write('web/public/logo-christmas.png', await sharp(await tile(christmas, 512)).png(PNG).toBuffer());
// the header's mark is square: the page rounds it to its own corner
await write('web/public/logo-mark.png', await square(icon, 128));
await write('web/public/logo-mark-christmas.png', await square(christmas, 128));
await write('web/public/favicon.png', await sharp(await tile(icon, 64)).png(PNG).toBuffer());
await write('web/public/apple-touch-icon.png', await square(icon, 180));
{
  // a link's preview: the deer rising from the bottom of a green card, nothing else
  const card = await sharp({ create: { width: 1200, height: 630, channels: 4, background: GREEN } })
    .composite([{ input: await bust(deer, 1200, 630, 0.4, 0.1) }])
    .flatten({ background: GREEN })
    .png(PNG)
    .toBuffer();
  await write('web/public/og.png', card);
}

console.log('admin');
{
  // the pupils are drawn by the page (admin/src/brand/mark.css), placed where this drawing's own pupils were
  const art = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: GREEN } })
    .composite([{ input: await bust(deerNoPupils, 1024, 1024, ICON.span, ICON.top) }])
    .png()
    .toBuffer();
  for (const size of [96, 192, 288]) {
    await write(`admin/public/brand/hevalo-${size}.webp`, await sharp(await tile(art, size)).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer());
  }
}
