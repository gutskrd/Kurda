/**
 * Dev tool: build api/content/cosmetics.json from the source asset folders at the
 * repo root (default-avatars/, premium-icons/, mykurda-background/). The manifest
 * is the committed source of truth for the catalog seed (seed-cosmetics) and the
 * web pickers — so the large/gitignored source folders (backgrounds → R2) are not
 * needed at build/seed time. Re-run after adding/removing assets.
 *
 *   node api/scripts/gen-cosmetics-manifest.mjs
 *
 * Default prices (admin-editable afterwards): image 500 / gif 700 / video 1000 Zêr;
 * premium icons 800 Zêr. All cosmetics are premium_only (premium access) AND
 * permanently purchasable for Zêr.
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const list = (dir) => {
  try {
    return readdirSync(join(root, dir)).filter((f) => !f.startsWith('.')).sort();
  } catch {
    return [];
  }
};
const title = (base) => base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const bgPrice = (type) => (type === 'video' ? 1000 : 500);

// default-01 is the universal free fallback; every other default avatar is premium-gated.
const avatars = list('default-avatars')
  .filter((f) => /\.(png|webp|jpg|jpeg|avif)$/i.test(f))
  .map((f) => {
    const key = f.replace(extname(f), '');
    return { key, requiresPremium: key !== 'default-01' };
  });

const icons = list('premium-icons')
  .filter((f) => /\.(png|webp|avif)$/i.test(f))
  .map((f, i) => ({
    sku: `icon-${f.replace(extname(f), '')}`,
    name: title(f.replace(extname(f), '')),
    assetKey: `icons/${f}`,
    price: 800,
    premiumOnly: true,
    displayOrder: i,
  }));

// Backgrounds are optimized to web-static assets (see optimize-backgrounds.mjs):
// png/jpg/gif → .webp (gif animates in an <img>); video copied as-is. So the
// manifest asset keys point at the optimized web-static files, and the render
// type is either 'image' (webp) or 'video' (mp4/webm).
const backgrounds = list('mykurda-background')
  .filter((f) => /\.(png|jpe?g|webp|avif|gif|mp4|webm)$/i.test(f))
  .map((f, i) => {
    const key = f.replace(extname(f), '');
    const ext = extname(f).toLowerCase();
    const isVideo = ext === '.mp4' || ext === '.webm';
    const type = isVideo ? 'video' : 'image';
    return {
      sku: `bg-${key}`,
      name: title(key),
      assetKey: isVideo ? `backgrounds/${f}` : `backgrounds/${key}.webp`,
      type,
      price: bgPrice(type),
      premiumOnly: true,
      displayOrder: i,
    };
  });

const out = join(root, 'api', 'content', 'cosmetics.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ avatars, icons, backgrounds }, null, 2) + '\n');
console.log(`wrote ${out}: ${avatars.length} avatars, ${icons.length} icons, ${backgrounds.length} backgrounds`);
