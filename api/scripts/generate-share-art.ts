/**
 * Writes the cards a shared win's link shows when pasted (web/public/share/<card>.png, 1200 by 630), since nothing
 * that previews a link draws SVG: one per kind of win, shareable streak length and league, drawn as the postcard on
 * the page the link opens (shared/src/art/share-card.ts). They carry no words; the website's edge script writes the
 * preview's title and line. Saved with a palette, a third of the weight of full colour with no visible loss.
 *
 * Run after a card's drawing is changed, and commit what it writes:
 *
 *   npm run share:art --workspace api
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SHARE_CARD, shareCardSvg, winCardName, winCards, type ShareCardOptions, type WinLink } from '@kurda/shared';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'web', 'public', 'share');
mkdirSync(out, { recursive: true });

/** A win as its card is asked for: the kind, and the one detail its stamp prints. */
function cardOf(win: WinLink): ShareCardOptions {
  if (win.kind === 'streak') return win.days === null ? { kind: 'streak' } : { kind: 'streak', days: win.days };
  if (win.kind === 'league') return win.tier === null ? { kind: 'league' } : { kind: 'league', tier: win.tier };
  return { kind: win.kind };
}

let total = 0;
for (const win of winCards()) {
  const name = winCardName(win);
  const png = await sharp(Buffer.from(shareCardSvg(cardOf(win))))
    .resize(SHARE_CARD.width, SHARE_CARD.height)
    .png({ palette: true, colours: 256, quality: 100, effort: 10, compressionLevel: 9 })
    .toFile(join(out, `${name}.png`));
  total += png.size;
  console.log(`${name.padEnd(14)} ${(png.size / 1024).toFixed(0)} kB`);
}
console.log(`${'all'.padEnd(14)} ${(total / 1024).toFixed(0)} kB`);
