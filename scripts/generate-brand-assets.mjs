/**
 * The deer, everywhere it has to appear.
 *
 * Two drops go in — `Profiles/Logo.png` and sixteen `Profiles/IMG_*.png` — and
 * every avatar and every icon in both apps comes out. Run from the repo root:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * The sources are gitignored, the way sticker and empty-state originals are.
 * What ships is what this writes, and it is committed.
 *
 * ── the cut-out ──────────────────────────────────────────────────────────
 *
 * The logo arrives as a finished app icon: a purple deer on a light
 * periwinkle card, on a near-white surround. Three of the eight icon files
 * need the animal on its own, so it has to come off the card.
 *
 * A luminance threshold nearly works and then does not. The card is at 230
 * and the antlers are at 206 — a 24-point gap, which is enough — but the
 * deer's eyes are white, at 253, and a threshold makes them holes. On the
 * card you cannot tell; on an Android launcher the wallpaper shows through
 * them.
 *
 * So the mask is a flood fill inward from the border rather than a test on
 * each pixel on its own. Light and reachable from the edge is background;
 * light and enclosed is an eye. Same mask, painted black, is the monochrome
 * icon Android's themed mode asks for.
 *
 * ── the avatars ──────────────────────────────────────────────────────────
 *
 * Written as JPEG bytes at a `.png` path, which is what the forty they
 * replace already were — `avatarAssetUrl` builds `/cosmetics/avatars/<key>.png`
 * and the file it points at has always been a JPEG. The extension lies, and
 * this is not the change that fixes it: the URL comes from the API and the
 * file is served by the web origin, so changing it means the two deploy in
 * lockstep or avatars 404 in between. The cost of the lie is nought; the cost
 * of fixing it badly is a broken profile picture for everybody.
 *
 * They are 280 square because the sources are 285–302 and the shortest side
 * of the shortest one is 285. Anything larger would be invented detail. At
 * 280 they cover the phone's 96pt avatar at @3x exactly and the browser's
 * 120px one at @2x with room to spare.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'Profiles');

/** Light enough to be background, if the border can reach it. */
const BACKGROUND_LUMA = 214;

/** The card the deer stands on, sampled from the drop. Used wherever a solid is needed. */
export const CARD = '#DAE7FA';

const AVATAR_SIZE = 280;
const AVATAR_COUNT = 16;

const out = (...p) => path.join(ROOT, ...p);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';

/**
 * Everything the border can reach without crossing the animal.
 *
 * A stack rather than recursion: 932 x 932 is 868k pixels and a recursive
 * fill blows the stack on the first long row.
 */
function backgroundMask(data, width, height, channels) {
  const light = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    light[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] >= BACKGROUND_LUMA ? 1 : 0;
  }

  const background = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    const p = y * width + x;
    if (light[p] === 1 && background[p] === 0) {
      background[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  /*
   * And from inside the card, because the border alone does not reach it.
   *
   * The card has a faint darker stroke around its rounded edge, and along the
   * top it runs right to the edge of the drop — so a fill that starts only at
   * the border spreads through the near-white surround, meets that stroke,
   * and stops. The card survives, and what comes out is the whole icon rather
   * than the animal.
   *
   * These four are an eighth of the way in from each corner, which on this
   * drop is card in all four: measured 229, 233, 229, 231. The deer is
   * nowhere near them.
   */
  for (const [fx, fy] of [
    [0.12, 0.12],
    [0.88, 0.12],
    [0.12, 0.88],
    [0.88, 0.88],
  ]) {
    push(Math.round(width * fx), Math.round(height * fy));
  }
  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return background;
}

/** Only the largest connected run of set pixels. */
function largestComponent(mask, width, height) {
  const seen = new Uint8Array(width * height);
  let best = null;
  let bestSize = 0;

  for (let seed = 0; seed < width * height; seed++) {
    if (mask[seed] === 0 || seen[seed] === 1) continue;
    const members = [];
    const stack = [seed];
    seen[seed] = 1;
    while (stack.length > 0) {
      const p = stack.pop();
      members.push(p);
      const x = p % width;
      const y = (p - x) / width;
      const near = [];
      if (x > 0) near.push(p - 1);
      if (x < width - 1) near.push(p + 1);
      if (y > 0) near.push(p - width);
      if (y < height - 1) near.push(p + width);
      for (const q of near) {
        if (mask[q] === 1 && seen[q] === 0) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (members.length > bestSize) {
      bestSize = members.length;
      best = members;
    }
  }

  const out = new Uint8Array(width * height);
  for (const p of best ?? []) out[p] = 1;
  return out;
}

/**
 * The animal, and nothing that was merely touching it.
 *
 * Largest-component on its own is not enough: the card's corner vignette
 * leaves a hairline arc that runs into the deer's shoulder, so the two are
 * one component and the arc is drawn into the icon.
 *
 * Eroding by two loses the arc — it is barely two pixels across — and keeps
 * the animal, whose thinnest part is an antler tine at about twenty. So the
 * biggest component is picked from the *eroded* mask and then grown back out
 * inside the original one, which restores the deer to the pixel and never
 * reaches the arc, because nothing of it survived to seed from.
 */
/**
 * How far inside the card to start, in pixels of the drop.
 *
 * The card has a faint darker stroke around its rounded edge. It is below the
 * background threshold, so a flood fill treats it as part of the animal and
 * the icon comes out with a ghost rectangle drawn on it. Cropping a little
 * way inside it is simpler than trying to erode it afterwards, and it costs
 * nothing: there is only card out there.
 */
const CARD_INSET = 12;

/** The deer alone, on transparency, trimmed to itself. */
async function cutOut(file, { black = false } = {}) {
  // the near-white surround first, then a few pixels more to clear the stroke
  const carded = await sharp(file).trim({ background: '#F4F5F7', threshold: 10 }).toBuffer();
  const box = await sharp(carded).metadata();
  const inset = await sharp(carded)
    .extract({
      left: CARD_INSET,
      top: CARD_INSET,
      width: box.width - CARD_INSET * 2,
      height: box.height - CARD_INSET * 2,
    })
    .toBuffer();

  const { data, info } = await sharp(inset).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const background = backgroundMask(data, width, height, channels);

  /*
   * And then only the biggest thing that is left.
   *
   * The card is not flat — it has a soft vignette that dips darker toward the
   * rounded corners, below the background threshold, so little arcs survive
   * the fill. Counted: four components, the animal at 305,052 pixels and three
   * arcs at about a thousand each. None of them touches it, so the rule that
   * removes them is simply that the logo is the largest thing in the picture
   * and everything else is the picture it was sitting on.
   */
  const foreground = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) foreground[p] = background[p] === 0 ? 1 : 0;
  const keep = largestComponent(foreground, width, height);

  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0, j = 0; p < width * height; p++, j += 4) {
    const i = p * channels;
    const on = keep[p] === 1;
    rgba[j] = black ? 0 : data[i];
    rgba[j + 1] = black ? 0 : data[i + 1];
    rgba[j + 2] = black ? 0 : data[i + 2];
    rgba[j + 3] = on ? 255 : 0;
  }
  // trimmed so "62% of the canvas" means 62% of the animal, not of the drop
  return sharp(rgba, { raw: { width, height, channels: 4 } }).trim().png().toBuffer();
}

/** The art centred on a canvas, at a fraction of it, over `background` or nothing. */
async function place(art, size, fraction, background) {
  const inner = Math.round(size * fraction);
  const scaled = await sharp(art).resize(inner, inner, { fit: 'inside' }).toBuffer();
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return canvas.composite([{ input: scaled, gravity: 'centre' }]).png().toBuffer();
}

async function write(file, buffer) {
  const f = out(...file.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buffer);
  console.log(`  ${file.padEnd(48)} ${kb(f).padStart(6)}`);
}

if (!fs.existsSync(SRC)) {
  console.error(`no sources at ${path.relative(ROOT, SRC)} — they are gitignored; what ships is already committed`);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────── avatars
const faces = fs
  .readdirSync(SRC)
  .filter((f) => /^IMG_.*\.png$/i.test(f))
  .sort();

if (faces.length !== AVATAR_COUNT) {
  console.error(`expected ${AVATAR_COUNT} avatars in ${path.relative(ROOT, SRC)}, found ${faces.length}`);
  process.exit(1);
}

console.log('avatars');
const avatarDir = out('web', 'public', 'cosmetics', 'avatars');
for (const stale of fs.readdirSync(avatarDir)) fs.unlinkSync(path.join(avatarDir, stale));

for (const [i, face] of faces.entries()) {
  const key = `default-${String(i + 1).padStart(2, '0')}`;
  const buf = await sharp(path.join(SRC, face))
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

// ───────────────────────────────────────────────────────────────────── logo
console.log('logo');
const logo = path.join(SRC, 'Logo.png');
const deer = await cutOut(logo);
const silhouette = await cutOut(logo, { black: true });

/** The square icon: the card, edge to edge, with the animal on it. */
const iconAt = (size) => place(deer, size, 0.78, CARD);

await write('logo.png', await iconAt(1024));
await write('web/public/logo.png', await iconAt(1024));
await write('mobile/assets/icon.png', await iconAt(1024));
await write('mobile/assets/favicon.png', await sharp(await iconAt(256)).resize(48, 48).png().toBuffer());

// the splash draws this over `splash.backgroundColor`, so it wants no card
await write('mobile/assets/splash-icon.png', await place(deer, 1024, 0.62, null));

// an adaptive icon is masked to whatever shape the launcher likes, so the
// animal lives inside the safe 66% and the card is a separate layer
await write('mobile/assets/android-icon-foreground.png', await place(deer, 512, 0.62, null));
await write(
  'mobile/assets/android-icon-background.png',
  await sharp({ create: { width: 512, height: 512, channels: 4, background: CARD } }).png().toBuffer(),
);
await write('mobile/assets/android-icon-monochrome.png', await place(silhouette, 432, 0.62, null));

// the photo editor's sticker sheet wants it cut out
await write('web/public/stickers/logo.webp', await sharp(await place(deer, 512, 0.92, null)).webp({ quality: 90 }).toBuffer());
