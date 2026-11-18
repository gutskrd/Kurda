/**
 * Writes the emails' pictures (shared/src/art/email.ts) as images into the website's public folder, since email
 * programs do not draw SVG: a looping GIF, and a PNG of the resting moment for readers who asked for less motion.
 * Each is 336 pixels square, twice its shown size, on a full tile because a looping image cannot have soft
 * transparent corners; a loop starts on the resting moment, which is all a program that plays no loops shows.
 *
 * Run after a picture is added or changed, and commit what it writes:
 *
 *   npm run email:art --workspace api
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { EMAIL_PICTURES, emailPictureLoopMs, emailPictureStill, emailPictureSvg, emailPictureTone, type EmailPicture } from '@kurda/shared';

const SIZE = 336;
/** How much of the tile the picture takes. */
const FILL = 0.76;
/** A frame every 60 ms: smooth enough for a small, slow motion, and every program keeps to it. */
const FRAME_MS = 60;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'email');
mkdirSync(out, { recursive: true });

/** One moment of a picture on its tile, as an SVG. */
function tile(picture: EmailPicture, at: number): Buffer {
  const inner = SIZE * FILL;
  const offset = (SIZE - inner) / 2;
  const drawn = emailPictureSvg({ picture, size: inner, idPrefix: 'e', at }).replace('<svg ', `<svg x="${offset}" y="${offset}" `);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
      `<rect width="${SIZE}" height="${SIZE}" fill="${emailPictureTone(picture)}"/>${drawn}</svg>`,
  );
}

for (const picture of EMAIL_PICTURES) {
  const still = emailPictureStill(picture);
  const png = await sharp(tile(picture, still)).png({ compressionLevel: 9, palette: true, quality: 92 }).toFile(join(out, `${picture}.png`));

  const frames = Math.round(emailPictureLoopMs(picture) / FRAME_MS);
  const drawn = await Promise.all(Array.from({ length: frames }, (_, i) => sharp(tile(picture, still + i / frames)).png().toBuffer()));
  const gif = await sharp(drawn, { join: { animated: true } })
        // Flat colours need no dither, and without it the still parts of the tile cost nothing from frame to frame.
    .gif({ delay: FRAME_MS, loop: 0, effort: 10, colours: 64, dither: 0, interFrameMaxError: 4, interPaletteMaxError: 3 })
    .toFile(join(out, `${picture}.gif`));

  console.log(`${picture.padEnd(10)} still ${(png.size / 1024).toFixed(1)} kB   loop ${frames} frames, ${(gif.size / 1024).toFixed(0)} kB`);
}
