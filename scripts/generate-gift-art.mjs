/**
 * The gifts' pictures (`shared/src/art/gift-art.ts`) as the PNG files the shop serves: 512 pixels square with their
 * transparency, within the size budget the shop's drawn icons keep.
 *
 *   node scripts/generate-gift-art.mjs              write into web/public/cosmetics/gifts
 *   node scripts/generate-gift-art.mjs --out <dir>  write the same tree under <dir>
 *   node scripts/generate-gift-art.mjs --only <id>  draw one gift
 *
 * The drawings are the exact strings the apps can inline, only turned into pixels here, so the same script writes the
 * same files on every run, and shared/src/art/gift-art.test.ts draws one again and holds it to what is committed. The
 * folder belongs to this script: a file in it that it did not write is removed when it runs against the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { register } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
register();
const { GIFT_ART_IDS, giftArtKey, giftArtSvg } = await import(pathToFileURL(path.join(ROOT, 'shared/src/art/gift-art.ts')).href);

/** As the shop's drawn icons are: 512 pixels square, at most 80 KB. */
export const GIFT_PNG = { size: 512, maxBytes: 80 * 1024 };

/** Where the files go, relative to the repo root; an item's asset key is its path under /cosmetics. */
export const GIFT_DIR = 'web/public/cosmetics/gifts';

export const giftFile = (id) => `web/public/cosmetics/${giftArtKey(id)}`;

/** A gift as a PNG of at most 256 colours and its transparency: as many colours as fit the budget. */
export async function renderGift(id) {
  const { data, info } = await sharp(Buffer.from(giftArtSvg({ id, size: GIFT_PNG.size })), { density: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const colours of [256, 192, 128]) {
    const buf = await sharp(data, { raw: info }).png({ palette: true, quality: 100, colours, effort: 10, compressionLevel: 9, dither: 0.4 }).toBuffer();
    if (buf.length <= GIFT_PNG.maxBytes) return buf;
  }
  throw new Error(`${id}: cannot fit under ${GIFT_PNG.maxBytes} bytes`);
}

export async function renderAll(outRoot, { only = null, log = () => {} } = {}) {
  const ids = GIFT_ART_IDS.filter((id) => !only || id === only);
  if (!ids.length) throw new Error(`no gift picture ${only}`);
  const written = [];
  for (const id of ids) {
    const file = giftFile(id);
    const bytes = await renderGift(id);
    const abs = path.join(outRoot, ...file.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    written.push(file);
    log(`  ${file.padEnd(48)} ${(bytes.length / 1024).toFixed(0).padStart(4)}KB`);
  }
  if (!only) {
    const dir = path.join(outRoot, ...GIFT_DIR.split('/'));
    for (const f of fs.readdirSync(dir)) {
      if (written.includes(`${GIFT_DIR}/${f}`)) continue;
      fs.rmSync(path.join(dir, f), { recursive: true });
      log(`  ${`${GIFT_DIR}/${f}`.padEnd(48)} removed`);
    }
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : ROOT;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  await renderAll(out, { only, log: console.log });
}
