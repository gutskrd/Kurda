/**
 * The deer, everywhere it has to appear.
 *
 * Three drops go in — `Logo/App_Logo.jpg`, `Logo/Logo.png` and sixteen
 * `Profiles/IMG_*.png` — and every avatar and every icon in both apps comes
 * out. Run from the repo root:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * The sources are gitignored, the way sticker and empty-state originals are.
 * What ships is what this writes, and it is committed.
 *
 * ── two logos, which is the whole point ──────────────────────────────────
 *
 * `App_Logo.jpg` is the mobile app icon: the deer on its light card, square,
 * opaque, 1024. It goes where a platform wants a finished icon and will do
 * its own rounding — iOS in particular rejects an icon with an alpha channel,
 * so it stays opaque all the way through.
 *
 * `Logo.png` is the general mark: the same deer, already cut out, with 78% of
 * it transparent. It goes where the animal has to sit on something that is
 * not its own card — the splash, the Android adaptive foreground, the web
 * brand mark, the sticker sheet.
 *
 * An earlier version of this script had 120 lines that took the first and
 * tried to produce the second: a flood fill inward from the border, a crop
 * inside the card's edge stroke, a largest-component pass to drop the
 * vignette's corner arcs. All of it was inference about where the animal
 * ended, and all of it is gone, because the second drop says so directly.
 *
 * ── sizes ────────────────────────────────────────────────────────────────
 *
 * The animal's own bounds inside the cut-out are 286 x 351, so nothing drawn
 * from it goes past 351: the splash takes 34% of a 1024 canvas (348), the
 * general mark 68% of 512 (348), the adaptive foreground 62% of 512 (317).
 * `withoutEnlargement` holds the line if one of those fractions is ever
 * raised — a bigger box gets the animal at its own size rather than a blur.
 *
 * ── the avatars ──────────────────────────────────────────────────────────
 *
 * Written as JPEG bytes at a `.png` path, which is what the forty they
 * replace already were — `avatarAssetUrl` builds `/cosmetics/avatars/<key>.png`
 * and the file it points at has always been a JPEG. The extension lies, and
 * this is not the change that fixes it: the URL comes from the API and the
 * file is served by the web origin, so changing it means the two deploy in
 * lockstep or avatars 404 in between.
 *
 * They are 280 square because the sources are 285–302 and the shortest side
 * of the shortest one is 285. At 280 they cover the phone's 96pt avatar at
 * @3x exactly and the browser's 120px one at @2x with room to spare.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGOS = path.join(ROOT, 'Logo');
const FACES = path.join(ROOT, 'Profiles');

/** The card the deer stands on, sampled from the app icon at 12% in. */
const CARD = '#DFE7FA';

const AVATAR_SIZE = 280;
const AVATAR_COUNT = 16;

const out = (...p) => path.join(ROOT, ...p);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';

async function write(file, buffer) {
  const f = out(...file.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buffer);
  console.log(`  ${file.padEnd(48)} ${kb(f).padStart(6)}`);
}

/**
 * The drop, cropped to the animal.
 *
 * `Logo.png` is 510 x 489 and the deer's own bounds are 286 x 351 inside it,
 * so more than a third of the file is transparent margin. Composited as-is,
 * "the mark at 62% of the canvas" puts the animal at 45% and it reads as an
 * icon somebody forgot to scale up.
 *
 * sharp's `trim()` does not take it off — it compares colours, and every
 * pixel out there has the same colour and differs only in being invisible —
 * so the bounds are measured on the alpha channel and cropped by hand. Done
 * once; every size below composites the result.
 */
async function croppedMark(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 16 rather than 0: the edges are antialiased, and a pixel at alpha 3 is
      // margin that happens to be rounded, not part of the drawing
      if (data[(y * width + x) * 4 + 3] <= 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return sharp(file)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

/** The cut-out centred on a transparent canvas, at a fraction of it. */
async function onGlass(art, size, fraction) {
  const inner = Math.round(size * fraction);
  // never enlarged: the animal is 351 tall and drawing it bigger is invention
  const scaled = await sharp(art).resize(inner, inner, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png()
    .toBuffer();
}

/**
 * The cut-out as a flat black shape, for Android's themed icons.
 *
 * Only the alpha channel matters: everything the artist drew becomes one
 * colour and everything they did not stays clear. The eyes are holes in the
 * drop, so they are holes here, which is what a silhouette of a face wants.
 */
async function silhouette(art, size, fraction) {
  const inner = Math.round(size * fraction);
  const { data, info } = await sharp(art)
    .resize(inner, inner, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const black = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < black.length; i += 4) black[i + 3] = data[i + 3];
  const shape = await sharp(black, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shape, gravity: 'centre' }])
    .png()
    .toBuffer();
}

for (const [dir, what] of [
  [LOGOS, 'Logo'],
  [FACES, 'Profiles'],
]) {
  if (!fs.existsSync(dir)) {
    console.error(`no sources at ${what}/ — they are gitignored; what ships is already committed`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────── avatars
const faces = fs
  .readdirSync(FACES)
  .filter((f) => /^IMG_.*\.png$/i.test(f))
  .sort();

if (faces.length !== AVATAR_COUNT) {
  console.error(`expected ${AVATAR_COUNT} avatars in Profiles/, found ${faces.length}`);
  process.exit(1);
}

console.log('avatars');
const avatarDir = out('web', 'public', 'cosmetics', 'avatars');
for (const stale of fs.readdirSync(avatarDir)) fs.unlinkSync(path.join(avatarDir, stale));

for (const [i, face] of faces.entries()) {
  const key = `default-${String(i + 1).padStart(2, '0')}`;
  const buf = await sharp(path.join(FACES, face))
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  await write(`web/public/cosmetics/avatars/${key}.png`, buf);
}

// the registry is the one source of truth for which avatars exist
const manifestPath = out('api', 'content', 'cosmetics.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.avatars = faces.map((_, i) => ({
  key: `default-${String(i + 1).padStart(2, '0')}`,
  requiresPremium: false,
}));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`  api/content/cosmetics.json                        ${manifest.avatars.length} avatars`);

// ─────────────────────────────────────────────────────────────── the app icon
console.log('app icon');
const appIcon = path.join(LOGOS, 'App_Logo.jpg');

/** Opaque on purpose: iOS rejects an app icon that carries an alpha channel. */
const squareIcon = (size) =>
  sharp(appIcon).resize(size, size, { fit: 'cover' }).flatten({ background: CARD }).png().toBuffer();

await write('mobile/assets/icon.png', await squareIcon(1024));
await write('mobile/assets/favicon.png', await squareIcon(48));

// ─────────────────────────────────────────────────────────── the general mark
console.log('general mark');
const mark = await croppedMark(path.join(LOGOS, 'Logo.png'));

await write('logo.png', await onGlass(mark, 512, 0.68));
await write('web/public/logo.png', await onGlass(mark, 512, 0.68));
await write(
  'web/public/stickers/logo.webp',
  await sharp(await onGlass(mark, 512, 0.68)).webp({ quality: 90 }).toBuffer(),
);

// the splash draws this over `splash.backgroundColor`, so it wants no card
await write('mobile/assets/splash-icon.png', await onGlass(mark, 1024, 0.34));

// an adaptive icon is masked to whatever shape the launcher likes, so the
// animal lives inside the safe 66% and the card is a separate layer
await write('mobile/assets/android-icon-foreground.png', await onGlass(mark, 512, 0.62));
await write(
  'mobile/assets/android-icon-background.png',
  await sharp({ create: { width: 512, height: 512, channels: 4, background: CARD } }).png().toBuffer(),
);
await write('mobile/assets/android-icon-monochrome.png', await silhouette(mark, 432, 0.62));
