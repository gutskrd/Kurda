/**
 * The Android letter widget's picture in the phone's list of widgets.
 *
 * Android shows a widget's preview image while somebody chooses one to add;
 * without it the list shows an empty box. This draws what the widget looks
 * like with a letter on it — lined cream paper, the top of a page, and a
 * pigeon standing in the lower right corner facing back into it — from the
 * same art the server draws the widget's own picture with
 * (api/src/letters/widget-image.ts), at a medium widget's shape. No words:
 * the widget's words are set by the phone, in whatever language it is in,
 * and a picture cannot be in all nine.
 *
 * Run from the repo root after the art changes:
 *
 *   npx tsx mobile/scripts/generate-widget-preview.ts
 *
 * The PNG under mobile/assets/widget is committed; app.json names it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { DEFAULT_PAPER, letterBirdSvg, letterPaperSvg } from '../../shared/src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'mobile/assets/widget/letter-preview.png');

/** A medium widget's shape at 3×, rounded as a launcher rounds a widget. */
const [WIDTH, HEIGHT, CORNER] = [1014, 474, 66];
/** How much of its square a standing pigeon reaches (api/src/letters/widget-image.ts `REACH`). */
const REACH = { x0: 0.24, y1: 0.86 };

function placed(svg: string, x: number, y: number, width: number, height: number): string {
  return svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[^"]*" height="[^"]*"/, `<svg x="${x}" y="${y}" width="${width}" height="${height}"`);
}

const paper = letterPaperSvg({ paper: DEFAULT_PAPER, width: WIDTH, height: HEIGHT, idPrefix: 'pp' });
const side = HEIGHT * 0.5;
const margin = HEIGHT * 0.035;
const bird = letterBirdSvg({ bird: 3, facingLeft: true, letter: true, size: side, idPrefix: 'pb' });
const left = WIDTH - margin - (1 - REACH.x0) * side;
const top = HEIGHT - margin - REACH.y1 * side;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
  `<defs><clipPath id="round"><rect width="${WIDTH}" height="${HEIGHT}" rx="${CORNER}"/></clipPath></defs>` +
  `<g clip-path="url(#round)">${placed(paper, 0, 0, WIDTH, HEIGHT)}${placed(bird, left, top, side, side)}</g></svg>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(OUT);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
