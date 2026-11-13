/**
 * The picture a game's invite link shows where it is pasted.
 *
 * A link shared out of a lobby (shared/src/join-link.ts) is unfurled by
 * whatever it was pasted into, and nothing that unfurls a link draws SVG. So
 * each game that can be joined by a code gets a card here, written into the
 * website's public folder as an image:
 *
 *   web/public/invite/<game>.png   1200 by 630, the size link previews ask for
 *
 * It is the game's own cover (shared/src/art/games.ts), large, on the night
 * the games are played on, under the lamp: the same picture the game has on
 * the Games page and at its start, so the card in a message is the game the
 * friend will open. Nothing on it is in a reader's own language: what a cover
 * writes is Kurdish, by hand, and what a preview says is its title and its
 * line, which the website's edge script writes (web: worker.ts) — a picture
 * with English painted on it would read wrongly in eight of the nine
 * languages the invite is sent in.
 *
 * Run after a cover is changed, and commit what it writes:
 *
 *   npm run invite:art --workspace api
 *
 * A story game has no emblem of its own; its link shows the site's card.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { gameEmblemSvg, gameEmblemTone, type GameEmblem, type JoinLinkGame } from '@kurda/shared';

const WIDTH = 1200;
const HEIGHT = 630;
/** The cover's side, and how round its corners are: the same share of its size as in the apps. */
const COVER = 430;
const ROUND = Math.round(COVER * 0.22);

/** The emblem each game's invite wears. */
export const INVITE_EMBLEMS: Partial<Record<JoinLinkGame, GameEmblem>> = {
  'wordle-battle': 'peyvok',
  'rhyme-match': 'rhyme',
  'last-letter': 'last-letter',
  impostor: 'impostor',
  'who-am-i': 'who-am-i',
};

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'web', 'public', 'invite');
mkdirSync(out, { recursive: true });

/** One game's card, as an SVG: the night, the lamp, and the game's cover standing on its own edge. */
function card(emblem: GameEmblem): Buffer {
  const tone = gameEmblemTone(emblem);
  const x = (WIDTH - COVER) / 2;
  const y = (HEIGHT - COVER) / 2 - 6;
  const drawn = gameEmblemSvg({ game: emblem, size: COVER, idPrefix: 'inv' }).replace('<svg ', `<svg x="${x}" y="${y}" `);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
      `<defs>` +
      `<radialGradient id="night" cx="50%" cy="0%" r="110%"><stop offset="0" stop-color="#4a3a8c"/><stop offset="0.55" stop-color="#2a2150"/><stop offset="1" stop-color="#171231"/></radialGradient>` +
      `<radialGradient id="lamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f2b632" stop-opacity="0.3"/><stop offset="1" stop-color="#f2b632" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="tone" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${tone}" stop-opacity="0.42"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></radialGradient>` +
      `<clipPath id="cut"><rect x="${x}" y="${y}" width="${COVER}" height="${COVER}" rx="${ROUND}"/></clipPath>` +
      `</defs>` +
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#night)"/>` +
      // the lamp over the table, and the game's own colour pooled under its cover
      `<ellipse cx="${WIDTH / 2}" cy="40" rx="520" ry="300" fill="url(#lamp)"/>` +
      `<ellipse cx="${WIDTH / 2}" cy="${HEIGHT / 2 + 40}" rx="460" ry="330" fill="url(#tone)"/>` +
      // the cover stands on its own edge, like everything a player picks up
      `<rect x="${x}" y="${y + 14}" width="${COVER}" height="${COVER}" rx="${ROUND}" fill="#120d2a"/>` +
      `<g clip-path="url(#cut)">${drawn}</g>` +
      `</svg>`,
  );
}

for (const [game, emblem] of Object.entries(INVITE_EMBLEMS) as Array<[JoinLinkGame, GameEmblem]>) {
  const png = await sharp(card(emblem)).png({ compressionLevel: 9 }).toFile(join(out, `${game}.png`));
  console.log(`${game.padEnd(14)} ${(png.size / 1024).toFixed(0)} kB`);
}
