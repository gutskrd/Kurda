/**
 * The deer, everywhere it has to appear.
 *
 * Two drops go in — `Logos/Hevalo_Logo.png` and `Logos/Hevalo_Christmas_Logo.png`
 * — plus sixteen `Profiles/IMG_*.png`, and every avatar and every icon in both
 * apps comes out. Run from the repo root:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * The sources are gitignored, the way sticker and empty-state originals are.
 * What ships is what this writes, and it is committed.
 *
 * ── one drawing, two things to take from it ──────────────────────────────
 *
 * Each drop is a finished icon: the deer on a rounded purple card, breaking the
 * frame at the antlers and the chest. That is exactly right where a platform
 * asks for a square it will round itself — the app icon, the tab icon, the
 * social card — and exactly wrong everywhere the art is composited onto
 * something else or masked to a shape, because a card inside a launcher's
 * circle is an icon inside an icon.
 *
 * So the card is used as drawn, and `deerOf` lifts the animal off it for the
 * rest. The card is a purple gradient and the deer is brown and cream, so the
 * two separate on colour alone; what the colour test leaves behind is the
 * card's antialiased rim as a hairline ring, and on the Christmas drop the
 * snowflakes painted on the card. Both are components of their own, so keeping
 * only the largest one drops both and takes the animal — bow, lights, scarf and
 * bells included, because those touch it.
 *
 * This is inference about where the drawing ends, which a previous version of
 * this file deleted 120 lines of, on the grounds that a second cut-out drop
 * said it directly. That is still the better answer: a transparent deer with no
 * card would make `deerOf` unnecessary. It is not available, the separation is
 * clean, and every output was looked at.
 *
 * ── Christmas ───────────────────────────────────────────────────────────
 *
 * The second drop is the same deer in lights and a scarf. It ships as one more
 * file, `web/public/logo-christmas.png`, and `web/src/brand/season.ts` decides
 * which of the two the browser shows. Nothing on a phone changes: an app icon
 * is chosen at build time and swapping it is a store release, not a date.
 *
 * ── the field ───────────────────────────────────────────────────────────
 *
 * `FIELD` is the card's own purple, averaged off the drop rather than guessed.
 * It backs the splash, the Android layer under the deer and the social card, so
 * launching the app is the icon opening out rather than three different
 * backgrounds in a row. The web app keeps its own dark theme — that belongs to
 * the app, not to the logo.
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
const LOGOS = path.join(ROOT, 'Logos');
const FACES = path.join(ROOT, 'Profiles');

/**
 * The card's own purple, averaged off the drop rather than picked by eye.
 *
 * Backs the splash, the Android layer under the deer, and the social card, so
 * the icon opening into the app is one colour rather than three.
 */
const FIELD = '#b874f0';

/**
 * How a PNG that ships is encoded.
 *
 * The drawing is a soft gradient, which is the worst case for PNG: straight
 * out of sharp the app icon was 1.1 MB and the 512px brand mark 291 KB, for a
 * mark the browser draws at 30. Quantising to a palette costs nothing visible
 * on flat-shaded art and takes both down by roughly an order of magnitude.
 */
const PNG = { palette: true, quality: 92, effort: 9, compressionLevel: 9 };
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
 * The drop, cropped to the mark.
 *
 * sharp's `trim()` does not take the margin off — it compares colours, and
 * every pixel out there has the same colour and differs only in being
 * invisible — so the bounds are measured on the alpha channel and cropped by
 * hand. Done once per drop; every size below composites the result.
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
    .png(PNG)
    .toBuffer();
}

/** The cut-out centred on a transparent canvas, at a fraction of it. */
async function onGlass(art, size, fraction) {
  const inner = Math.round(size * fraction);
  const scaled = await sharp(art).resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png(PNG)
    .toBuffer();
}

/** The same, on the brand field, opaque — what a platform wants as an icon. */
async function onField(art, size, fraction) {
  const inner = Math.round(size * fraction);
  const scaled = await sharp(art).resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: FIELD } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .flatten({ background: FIELD }) // iOS rejects an app icon carrying alpha
    .png(PNG)
    .toBuffer();
}

/**
 * The animal, lifted off its card.
 *
 * The card is a purple gradient and the deer is brown and cream, so a pixel
 * belongs to the card when blue leads red and red leads green by a margin.
 * That alone leaves two things behind: the card's antialiased rim, as a
 * hairline ring tracing the rounded rectangle, and — on the Christmas drop —
 * the snowflakes painted on the card. Neither touches the animal, so keeping
 * only the largest connected run of kept pixels removes both.
 *
 * The bow, the lights, the scarf and the bells all survive, because all of them
 * touch the deer. Verified by looking at both results, which is the only way to
 * verify a thing like this.
 */
async function deerOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const count = width * height;

  const keep = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * channels;
    const [r, g, b, a] = [data[o], data[o + 1], data[o + 2], data[o + 3]];
    if (a > 16 && !(b > r + 12 && r > g + 30)) keep[i] = 1;
  }

  // flood fill, iterative: 250,000 pixels is deeper than the call stack goes
  const label = new Int32Array(count).fill(-1);
  const stack = [];
  let best = -1;
  let bestSize = 0;
  let next = 0;
  for (let seed = 0; seed < count; seed++) {
    if (!keep[seed] || label[seed] !== -1) continue;
    let size = 0;
    label[seed] = next;
    stack.push(seed);
    while (stack.length > 0) {
      const p = stack.pop();
      size += 1;
      const x = p % width;
      const y = (p / width) | 0;
      if (x > 0 && keep[p - 1] && label[p - 1] === -1) { label[p - 1] = next; stack.push(p - 1); }
      if (x < width - 1 && keep[p + 1] && label[p + 1] === -1) { label[p + 1] = next; stack.push(p + 1); }
      if (y > 0 && keep[p - width] && label[p - width] === -1) { label[p - width] = next; stack.push(p - width); }
      if (y < height - 1 && keep[p + width] && label[p + width] === -1) { label[p + width] = next; stack.push(p + width); }
    }
    if (size > bestSize) { bestSize = size; best = next; }
    next += 1;
  }

  const cut = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) {
    if (label[i] !== best) continue;
    const o = i * channels;
    cut[i * 4] = data[o];
    cut[i * 4 + 1] = data[o + 1];
    cut[i * 4 + 2] = data[o + 2];
    cut[i * 4 + 3] = data[o + 3];
  }
  return sharp(cut, { raw: { width, height, channels: 4 } }).png(PNG).toBuffer();
}

/**
 * The cut-out as a flat shape, for Android's themed icons.
 *
 * Only the alpha channel matters: everything the artist drew becomes one
 * colour and everything they did not stays clear.
 */
async function silhouette(art, size, fraction) {
  const inner = Math.round(size * fraction);
  const { data, info } = await sharp(art)
    .resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const black = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < black.length; i += 4) black[i + 3] = data[i + 3];
  const shape = await sharp(black, { raw: { width: info.width, height: info.height, channels: 4 } }).png(PNG).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shape, gravity: 'centre' }])
    .png(PNG)
    .toBuffer();
}

for (const [dir, what] of [
  [LOGOS, 'Logos'],
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

// ───────────────────────────────────────────────────────────────── the marks
const card = await croppedMark(path.join(LOGOS, 'Hevalo_Logo.png'));
const deer = await croppedMark(await deerOf(path.join(LOGOS, 'Hevalo_Logo.png')));
const deerXmas = await croppedMark(await deerOf(path.join(LOGOS, 'Hevalo_Christmas_Logo.png')));

// ─────────────────────────────────────────────────────── what the web shows
console.log('web');
/*
 * The animal, not the card. The brand mark is 30px beside the wordmark on a
 * dark bar, and a rounded purple tile at that size reads as somebody's app
 * icon dropped into the navigation rather than as a logo.
 */
await write('web/public/logo.png', await onGlass(deer, 512, 0.92));
await write('web/public/logo-christmas.png', await onGlass(deerXmas, 512, 0.92));

/*
 * The tab and the social card get the card as drawn. Neither surface is ours —
 * a tab strip is light in one browser and dark in the next, and whatever
 * unfurls a link flattens a transparent PNG onto a background of its choosing
 * — and the card is the one version that carries its own.
 */
await write('web/public/favicon.png', await sharp(card).resize(64, 64, { fit: 'inside', kernel: 'lanczos3' }).png(PNG).toBuffer());
await write('web/public/og.png', await sharp({ create: { width: 1200, height: 630, channels: 4, background: FIELD } })
  .composite([{ input: await sharp(deer).resize(420, 420, { fit: 'inside', kernel: 'lanczos3' }).toBuffer(), gravity: 'centre' }])
  .png(PNG)
  .toBuffer());

// ───────────────────────────────────────────────────────── the sticker sheet
console.log('stickers');
// one again: a brown deer reads on any photograph, which is what the two
// one-colour versions before it could not do
await write('web/public/stickers/logo.webp', await sharp(await onGlass(deer, 512, 0.92)).webp({ quality: 90 }).toBuffer());

// ──────────────────────────────────────────────────────── what the phone ships
console.log('phone');
// the card, as drawn, is what an app icon is; the platform does its own rounding
await write('mobile/assets/icon.png', await onField(card, 1024, 0.92));
await write('mobile/assets/favicon.png', await onField(card, 48, 0.92));

// the splash draws this over `splash.backgroundColor`, which is FIELD — so the
// animal alone, and the card's own colour behind it
await write('mobile/assets/splash-icon.png', await onGlass(deer, 1024, 0.42));

// an adaptive icon is masked to whatever shape the launcher likes, so the
// animal lives inside the safe 66% and the card's colour is a separate layer
await write('mobile/assets/android-icon-foreground.png', await onGlass(deer, 512, 0.62));
await write(
  'mobile/assets/android-icon-background.png',
  await sharp({ create: { width: 512, height: 512, channels: 4, background: FIELD } }).png(PNG).toBuffer(),
);
await write('mobile/assets/android-icon-monochrome.png', await silhouette(deer, 432, 0.62));
