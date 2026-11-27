/**
 * The gifts' pictures (`shared/src/art/gift-art.ts`) as the PNG files the shop serves: 512 pixels square with their
 * transparency, within the size budget the shop's drawn icons keep. A gift with a living round (gift-loops.ts) also
 * gets its parts, each cropped to its box, in a folder of its own under gift-loops, for the apps to stack and move.
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
const { GIFT_ART_IDS, giftArtKey, giftArtSvg, giftLoopParts } = await import(pathToFileURL(path.join(ROOT, 'shared/src/art/gift-art.ts')).href);
const { giftLoopKey, giftLoopOf } = await import(pathToFileURL(path.join(ROOT, 'shared/src/art/gift-loops.ts')).href);

/** As the shop's drawn icons are: 512 pixels square, at most 80 KB. */
export const GIFT_PNG = { size: 512, maxBytes: 80 * 1024 };

/** Where the files go, relative to the repo root; an item's asset key is its path under /cosmetics. */
export const GIFT_DIR = 'web/public/cosmetics/gifts';

/** Where the moving gifts' parts go, and what each may weigh: the base as much as a still, a layer far less. */
export const GIFT_LOOP_DIR = 'web/public/cosmetics/gift-loops';
export const GIFT_LOOP_BYTES = { base: 80 * 1024, layer: 32 * 1024 };

export const giftFile = (id) => `web/public/cosmetics/${giftArtKey(id)}`;

/** A picture as a PNG of at most 256 colours and its transparency: as many colours as fit the budget. */
async function encode(svg, maxBytes, what) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const colours of [256, 192, 128]) {
    const buf = await sharp(data, { raw: info }).png({ palette: true, quality: 100, colours, effort: 10, compressionLevel: 9, dither: 0.4 }).toBuffer();
    if (buf.length <= maxBytes) return buf;
  }
  throw new Error(`${what}: cannot fit under ${maxBytes} bytes`);
}

export const renderGift = (id) => encode(giftArtSvg({ id, size: GIFT_PNG.size }), GIFT_PNG.maxBytes, id);

/** A moving gift's parts as files: [path from the repo root, bytes], the base first when it has its own. */
export async function renderLoop(id) {
  const parts = giftLoopParts(id);
  const out = [];
  if (parts.base) out.push([`web/public/cosmetics/${giftLoopKey(id, 'base')}`, await encode(parts.base, GIFT_LOOP_BYTES.base, `${id} base`)]);
  for (const { name, svg } of parts.layers) out.push([`web/public/cosmetics/${giftLoopKey(id, name)}`, await encode(svg, GIFT_LOOP_BYTES.layer, `${id} ${name}`)]);
  return out;
}

export async function renderAll(outRoot, { only = null, log = () => {} } = {}) {
  const ids = GIFT_ART_IDS.filter((id) => !only || id === only);
  if (!ids.length) throw new Error(`no gift picture ${only}`);
  const written = [];
  let loopBytes = 0;
  const write = (file, bytes) => {
    const abs = path.join(outRoot, ...file.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    written.push(file);
    log(`  ${file.padEnd(64)} ${(bytes.length / 1024).toFixed(1).padStart(6)}KB`);
  };
  for (const id of ids) {
    write(giftFile(id), await renderGift(id));
    if (!giftLoopOf(id)) continue;
    for (const [file, bytes] of await renderLoop(id)) {
      write(file, bytes);
      loopBytes += bytes.length;
    }
  }
  if (loopBytes) log(`  the moving gifts' parts: ${(loopBytes / 1024).toFixed(0)}KB in all`);
  if (!only) {
    for (const dir of [GIFT_DIR, GIFT_LOOP_DIR]) {
      const abs = path.join(outRoot, ...dir.split('/'));
      fs.mkdirSync(abs, { recursive: true });
      for (const f of fs.readdirSync(abs, { recursive: true })) {
        const file = `${dir}/${String(f).split(path.sep).join('/')}`;
        const full = path.join(abs, String(f));
        if (!fs.existsSync(full) || written.includes(file) || written.some((w) => w.startsWith(`${file}/`))) continue;
        fs.rmSync(full, { recursive: true });
        log(`  ${file.padEnd(64)} removed`);
      }
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
