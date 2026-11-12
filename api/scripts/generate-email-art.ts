/**
 * The emails' pictures as images.
 *
 * Email programs do not draw SVG, so each picture the emails use
 * (shared/src/art/email.ts, where they are drawn) is written out here as a
 * PNG on its tile, into the website's public folder: an email points at
 * `https://hevalo.app/email/<picture>.png` (email/layout.ts). Run after a
 * picture is added or changed, and commit what it writes:
 *
 *   npm run email:art --workspace api
 *
 * Each is 336 pixels square, twice the 168 it is shown at, so it is sharp on
 * a phone's screen; the tile's rounded corners are cut out of the image, so
 * they are round in a program that does not round an image itself.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { EMAIL_PICTURES, emailPictureSvg, emailPictureTone } from '@kurda/shared';

const SIZE = 336;
/** The tile's corner, as a share of its side: 40 of the 168 it is shown at. */
const CORNER = (40 / 168) * SIZE;
/** How much of the tile the picture takes. */
const FILL = 0.74;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'email');
mkdirSync(out, { recursive: true });

for (const picture of EMAIL_PICTURES) {
  const inner = SIZE * FILL;
  const at = (SIZE - inner) / 2;
  const drawn = emailPictureSvg({ picture, size: inner, idPrefix: 'e' }).replace('<svg ', `<svg x="${at}" y="${at}" `);
  const tile =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" rx="${CORNER}" fill="${emailPictureTone(picture)}"/>${drawn}</svg>`;
  const file = join(out, `${picture}.png`);
  const info = await sharp(Buffer.from(tile)).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(file);
  console.log(`${picture}.png  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(1)} kB`);
}
