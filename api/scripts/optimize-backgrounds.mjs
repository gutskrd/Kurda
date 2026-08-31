/**
 * Optimize the source profile backgrounds (repo-root mykurda-background/, PNG)
 * into web-static WebP at web/public/cosmetics/backgrounds/. Backgrounds are
 * served like avatars/icons — from the web app's own origin (Cloudflare CDN) —
 * so cosmetics need no R2/object storage and "just work" after deploy.
 *
 *   node api/scripts/optimize-backgrounds.mjs
 *
 * Idempotent: re-running overwrites the outputs. Keep the source PNGs as the
 * canonical art; the committed WebP files are the production assets.
 */
import { readdirSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcDir = join(root, 'mykurda-background');
const outDir = join(root, 'web', 'public', 'cosmetics', 'backgrounds');
const MAX_WIDTH = 1280; // profile background display width; never enlarge
const QUALITY = 78;

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir)
  .filter((f) => /\.(png|jpe?g|gif|webp|mp4|webm)$/i.test(f))
  .sort();

let total = 0;
for (const f of files) {
  const key = f.replace(extname(f), '');
  const ext = extname(f).toLowerCase();
  if (ext === '.mp4' || ext === '.webm') {
    // videos are copied as-is (rendered in a <video>); keep them small at source
    const out = join(outDir, f);
    copyFileSync(join(srcDir, f), out);
    total += statSync(out).size;
    continue;
  }
  // png/jpg → static webp; gif → animated webp (animates in an <img>, much smaller)
  const animated = ext === '.gif';
  const out = join(outDir, `${key}.webp`);
  await sharp(join(srcDir, f), { animated })
    .resize(MAX_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5 })
    .toFile(out);
  total += statSync(out).size;
}
console.log(`optimized ${files.length} backgrounds → ${outDir} (${(total / 1024 / 1024).toFixed(1)} MB total, avg ${Math.round(total / files.length / 1024)} KB)`);
