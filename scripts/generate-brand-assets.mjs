/**
 * The antlered H, everywhere it has to appear.
 *
 * Two drops go in — `Logos/Hevalo_Logo_Dark.png` and `Logos/Hevalo_Logo_Light.png`
 * — plus sixteen `Profiles/IMG_*.png`, and every avatar and every icon in both
 * apps comes out. Run from the repo root:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * The sources are gitignored, the way sticker and empty-state originals are.
 * What ships is what this writes, and it is committed.
 *
 * ── dark and light are the ink, not the background ───────────────────────
 *
 * `Hevalo_Logo_Dark.png` is the mark drawn in black, for light surfaces.
 * `Hevalo_Logo_Light.png` is the same mark in white, for dark ones. Both are
 * cut out, so neither carries a card of its own and the caller supplies the
 * field.
 *
 * Which one goes where follows from the apps rather than from taste. The web
 * app has a single immersive theme on `--app-bg` (#0b0d10, `web/src/styles/
 * tokens.css`), so everything it shows is the light mark. Every icon a platform
 * asks for — the app icon, the favicon, the Android background layer — is that
 * same field with the light mark on it, so launching the app is one unbroken
 * look from the home screen through the splash into the app.
 *
 * The dark mark earns its place on the sticker sheet, where the surface is
 * somebody's photograph and no single colour reads on all of them. That is
 * already why there is a white sun and a black sun.
 *
 * ── this replaces a coloured drawing ─────────────────────────────────────
 *
 * The mark before it was a purple deer, and a purple deer reads on anything.
 * A one-colour mark does not, which is why the splash background moved off its
 * pale blue card: a black-on-pale-blue splash followed by the dark app was two
 * brands, and a white mark on pale blue is nothing at all.
 *
 * ── sizes ────────────────────────────────────────────────────────────────
 *
 * The drop is 451 x 554 with the mark 213 x 266 inside it, so more than half
 * the file is transparent margin and the mark is smaller than most of what is
 * drawn from it. The old script refused to enlarge — the drawing it had was
 * bigger than every target, so scaling up could only have been a mistake. This
 * one has to: a 1024 app icon wants the mark near 560. A flat two-tone
 * silhouette is the one thing that survives it, having no texture to blur, and
 * `lanczos3` keeps the curves clean.
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
 * The field the mark stands on, wherever a platform wants a finished square.
 *
 * `--app-bg` from the web app's tokens: the one colour the brand sits on, so
 * the home-screen icon, the splash and the first painted frame are the same.
 */
const FIELD = '#0b0d10';

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
    .png()
    .toBuffer();
}

/** The cut-out centred on a transparent canvas, at a fraction of it. */
async function onGlass(art, size, fraction) {
  const inner = Math.round(size * fraction);
  const scaled = await sharp(art).resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png()
    .toBuffer();
}

/** The same, on the brand field, opaque — what a platform wants as an icon. */
async function onField(art, size, fraction) {
  const inner = Math.round(size * fraction);
  const scaled = await sharp(art).resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: FIELD } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .flatten({ background: FIELD }) // iOS rejects an app icon carrying alpha
    .png()
    .toBuffer();
}

/**
 * The cut-out as a flat shape, for Android's themed icons.
 *
 * Only the alpha channel matters: everything the artist drew becomes one
 * colour and everything they did not stays clear. The counter inside the H is
 * a hole in the drop, so it is a hole here, which is what a silhouette wants.
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
  const shape = await sharp(black, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shape, gravity: 'centre' }])
    .png()
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
const light = await croppedMark(path.join(LOGOS, 'Hevalo_Logo_Light.png'));
const dark = await croppedMark(path.join(LOGOS, 'Hevalo_Logo_Dark.png'));

// ─────────────────────────────────────────────────────── what the web shows
console.log('web');
// the app is one dark theme, so its own mark is the light one
await write('web/public/logo.png', await onGlass(light, 512, 0.68));

/*
 * The tab and the social card get the field, because neither is ours. A tab
 * strip is light in one browser and dark in the next, and a chat app flattens
 * a transparent PNG onto whatever it likes — usually white, which is where a
 * white mark disappears. A field is the only version that cannot vanish.
 */
await write('web/public/favicon.png', await onField(light, 64, 0.62));
await write('web/public/og.png', await sharp({ create: { width: 1200, height: 630, channels: 4, background: FIELD } })
  .composite([{ input: await sharp(light).resize(340, 340, { fit: 'inside', kernel: 'lanczos3' }).toBuffer(), gravity: 'centre' }])
  .png()
  .toBuffer());

// ───────────────────────────────────────────────────────── the sticker sheet
console.log('stickers');
// both, because the surface is a photograph: the same reason there is a white
// sun and a black sun on the sheet already
await write('web/public/stickers/logo.webp', await sharp(await onGlass(light, 512, 0.68)).webp({ quality: 90 }).toBuffer());
await write('web/public/stickers/logo_dark.webp', await sharp(await onGlass(dark, 512, 0.68)).webp({ quality: 90 }).toBuffer());

// ──────────────────────────────────────────────────────── what the phone ships
console.log('phone');
await write('mobile/assets/icon.png', await onField(light, 1024, 0.56));
await write('mobile/assets/favicon.png', await onField(light, 48, 0.62));

// the splash draws this over `splash.backgroundColor`, which is FIELD
await write('mobile/assets/splash-icon.png', await onGlass(light, 1024, 0.34));

// an adaptive icon is masked to whatever shape the launcher likes, so the mark
// lives inside the safe 66% and the field is a separate layer
await write('mobile/assets/android-icon-foreground.png', await onGlass(light, 512, 0.62));
await write(
  'mobile/assets/android-icon-background.png',
  await sharp({ create: { width: 512, height: 512, channels: 4, background: FIELD } }).png().toBuffer(),
);
await write('mobile/assets/android-icon-monochrome.png', await silhouette(light, 432, 0.62));
