/**
 * The picture a shared win's link shows where it is pasted.
 *
 * A win sent to somebody outside Hevalo is a line and a link
 * (shared/src/win-link.ts), and whatever the link is pasted into draws a card
 * for it. Nothing that unfurls a link draws SVG, so each card there is
 * (shared/src/art/share-card.ts) is written into the website's public folder
 * as an image:
 *
 *   web/public/share/<card>.png   1200 by 630, the size link previews ask for
 *
 * One for each kind of win, one for each length of streak that is offered
 * for sharing, and one for each league. They are the postcard as it is drawn
 * for the page the link opens, so the card in a message is the picture the
 * friend lands on. Nothing is written on them: what a preview says is its
 * title and its line, which the website's edge script writes (web:
 * worker.ts), and the message the link arrives in is in the sender's own
 * words.
 *
 * The pictures are flat colour, so they are saved with a palette: a third of
 * the weight of full colour and nothing to see for it, which matters to a
 * card that is fetched by a phone in the middle of a conversation.
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
