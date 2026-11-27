/**
 * The sixteen default avatars, from the gitignored drop in `Profiles/IMG_*.png`. Run from the repo root:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * The logo in every size is drawn by scripts/generate-brand-marks.mjs from the committed cut-outs in scripts/brand.
 *
 * The avatars are written as JPEG bytes at a `.png` path, which is what the files they replaced already were:
 * `avatarAssetUrl` builds `/cosmetics/avatars/<key>.png`, the URL comes from the API and the file from the web
 * origin, so changing the extension means the two deploy in lockstep or avatars 404 in between.
 *
 * They are 280 square because the shortest side of the shortest source is 285: at 280 they cover the phone's 96pt
 * avatar at @3x and the browser's 120px one at @2x.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACES = path.join(ROOT, 'Profiles');

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

if (!fs.existsSync(FACES)) {
  console.error('no sources at Profiles/ — they are gitignored; what ships is already committed');
  process.exit(1);
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
