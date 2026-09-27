/**
 * Two drawings in, four files out.
 *
 * The empty-state art is a fawn in silver-blue — one sitting in an open box
 * for a list with nothing in it, one with an unplugged cable for a screen that
 * could not load. Mean ink rgb(195,203,214).
 *
 * Against the dark theme's #0B0D10 that is about 12:1 and looks exactly right.
 * Against the light theme's #F3F3F3 it is 1.4:1 — the outlines survive and the
 * body of the animal does not, which is worse than no picture at all. So each
 * drawing is written twice: once as drawn, and once at 72% brightness, which
 * lands around 3:1 on light. Soft, which is what a background illustration
 * should be, and present, which the original was not.
 *
 * Both are resized to 480 wide. `EmptyState` draws them at 160 points, so 480
 * is exactly @3x and there is nothing to gain from the 544 the sources have.
 * A palette PNG keeps the alpha and roughly quarters the bytes; the art is
 * flat and vector-drawn, so 256 colours costs it nothing visible.
 *
 * Run from the repo root, with the sources present:
 *
 *   node mobile/scripts/generate-empty-art.mjs
 *
 * The sources live in `/empty` at the repo root and are gitignored, the same
 * way sticker originals are — what ships is what this writes. So this is here
 * for provenance and for the next time the art changes, not as part of a
 * build: the four PNGs under `mobile/assets/empty` are committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'empty');
const OUT = path.join(ROOT, 'mobile/assets/empty');

/** Drawn at 160pt; 480 is @3x, the densest screen there is. */
const WIDTH = 480;

/** What the light theme needs to see it at all. Measured, not guessed. */
const LIGHT_BRIGHTNESS = 0.72;

const ART = [
  { from: 'nothing_here.png', to: 'nothing-here' },
  { from: 'no_internet.png', to: 'offline' },
];

/** The average colour of the pixels that are actually drawn. */
async function meanInk(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 200) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return n === 0 ? null : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** WCAG relative luminance, so the report can state a contrast rather than a feeling. */
function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi + 0.05) / (lo + 0.05)).toFixed(2);
}

if (!fs.existsSync(SRC)) {
  console.error(`no sources at ${path.relative(ROOT, SRC)} — they are gitignored; what ships is already committed`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

for (const { from, to } of ART) {
  const src = path.join(SRC, from);
  for (const [theme, brightness] of [
    ['dark', 1],
    ['light', LIGHT_BRIGHTNESS],
  ]) {
    const dest = path.join(OUT, `${to}-${theme}.png`);
    let img = sharp(src).resize({ width: WIDTH, withoutEnlargement: true });
    if (brightness !== 1) img = img.modulate({ brightness });
    await img.png({ palette: true, quality: 90, effort: 10 }).toFile(dest);

    const ink = await meanInk(dest);
    const against = theme === 'dark' ? [11, 13, 16] : [243, 243, 243];
    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(
      `  ${path.basename(dest).padEnd(22)} ${kb.padStart(3)}KB  ink rgb(${ink.join(',')})  ${contrast(ink, against)}:1 on ${theme}`,
    );
  }
}
