/**
 * The dictionary's picture before anything is searched: an open book on a kilim runner, with tiles of the letters
 * Kurmancî adds to the Latin alphabet lifting off its pages, a tulip glass of tea and a pomegranate beside it. Painted
 * flat in the valley colours (valley.ts) with one shade and one light per form, on a soft disc that reads on the page
 * in both schemes. The tiles are drawn as layers too, so an app can let them float.
 */
import { CANVAS, Drawing, checkSize, mix, n, prefixFor, type Pt } from './svg.js';
import { VALLEY, dusk, ellipsePath, warm } from './valley.js';
import { letter, letterWidth } from './ink.js';
import { softStar } from './paint.js';

export interface DictionaryArtOptions {
  size?: number;
  /** Drawn for a dark page: colours move toward the evening violet and the disc darkens. */
  dark?: boolean;
  title?: string;
  idPrefix?: string;
}

/** One letter tile: its letter, where its middle is, its turn, and its face colour with the ink written on it. */
export interface DictionaryTile {
  ch: string;
  at: Pt;
  turn: number;
  face: string;
  side: string;
  ink: string;
}

/** The tiles lifting off the book, low to high, in the order they float. */
export function dictionaryTiles(dark = false): readonly DictionaryTile[] {
  const d = (hex: string): string => dusk(hex, dark, 0.18);
  const cream = { face: d(VALLEY.cream), side: d('#e6d8b8'), ink: d(VALLEY.ink) };
  return [
    { ch: 'Ê', at: [36, 52], turn: -14, ...cream },
    { ch: 'Ç', at: [52, 34], turn: 8, face: d(VALLEY.gold), side: d(VALLEY.goldDark), ink: d(VALLEY.ink) },
    { ch: 'Ş', at: [70, 27], turn: -6, ...cream },
    { ch: 'Î', at: [86, 40], turn: 12, face: d('#3f9f93'), side: d('#2b766d'), ink: d(VALLEY.cream) },
    { ch: 'Û', at: [97, 22], turn: -10, face: d(VALLEY.red), side: d(VALLEY.redDark), ink: d(VALLEY.cream) },
  ];
}

/** How big a tile is, side to side. */
export const DICTIONARY_TILE = 13;

/** The picture's canvas, in whose units a tile's place is given. */
export const DICTIONARY_CANVAS = CANVAS;

/** One tile as markup: a rounded square with a deeper edge under it, and its letter. */
export function dictionaryTileSvg(t: DictionaryTile): string {
  const s = DICTIONARY_TILE;
  const [cx, cy] = t.at;
  const x = cx - s / 2;
  const y = cy - s / 2;
  const h = s * 0.62;
  const w = letterWidth(h);
  return (
    `<g transform="rotate(${n(t.turn)} ${n(cx)} ${n(cy)})">` +
    `<rect x="${n(x)}" y="${n(y + 1.6)}" width="${n(s)}" height="${n(s)}" rx="2.6" fill="${t.side}"/>` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="2.6" fill="${t.face}"/>` +
    letter(t.ch, cx - w / 2, cy - h / 2 + (t.ch === 'Ç' || t.ch === 'Ş' ? -0.9 : 0.9), h, t.ink, 1.5) +
    `</g>`
  );
}

/** The still picture: everything but the tiles, which `dictionarySvg` lays over it. */
function scene(dr: Drawing, dark: boolean): void {
  const d = (hex: string, amount = 0.26): string => dusk(hex, dark, amount);
  const path = (p: string, fill: string, extra = ''): void => dr.add(`<path d="${p}" fill="${fill}"${extra}/>`);

  // The disc the scene sits on, a step off the page, and the floor's soft shade.
  dr.add(`<circle cx="60" cy="58" r="50" fill="${dark ? '#262040' : '#ece6fa'}"/>`);
  path(ellipsePath(60, 101, 50, 7), dark ? '#1d1833' : '#ded6f3');

  // The kilim runner the book lies on: red ground, indigo edges, a row of gold diamonds with cream eyes.
  const runner = 'M14 89L106 89L111 103L9 103Z';
  path(runner, d(VALLEY.red));
  path('M14 89L106 89L107 91.6L13 91.6Z', d(VALLEY.indigo));
  path('M10 100.4L110 100.4L111 103L9 103Z', d(VALLEY.indigo));
  for (let i = 0; i < 9; i++) {
    const cx = 18 + i * 10.5;
    path(`M${n(cx)} 92.8L${n(cx + 3.4)} 96L${n(cx)} 99.2L${n(cx - 3.4)} 96Z`, d(VALLEY.gold));
    path(`M${n(cx)} 94.8L${n(cx + 1.2)} 96L${n(cx)} 97.2L${n(cx - 1.2)} 96Z`, d(VALLEY.cream));
  }

  // The book: an indigo cover under two cream pages bowed from the spine, lines of words, a red ribbon.
  path('M28 74L60 79L92 74V92L60 97L28 92Z', d(VALLEY.indigo));
  path('M28 92L60 97L92 92V94.4L60 99.4L28 94.4Z', d('#24345a'));
  path('M31 70C40 67.5 52 68 60 74V94C52 89 40 88 31 90Z', d(VALLEY.cream));
  path('M89 70C80 67.5 68 68 60 74V94C68 89 80 88 89 90Z', d('#f1e6cf'));
  const words = d('#cdbb96');
  dr.add(
    `<path d="M35 75.3C41 74.4 48 74.9 54 77.4M35 80.3C41 79.4 48 79.9 54 82.4M35 85.3C39 84.7 43 84.9 47 86M66 77.4C72 74.9 79 74.4 85 75.3M66 82.4C72 79.9 79 79.4 85 80.3M73 86C77 84.9 81 84.7 85 85.3" fill="none" stroke="${words}" stroke-width="1.5" stroke-linecap="round"/>`,
  );
  path('M58.6 94L61.4 94L61.4 104L60 102.4L58.6 104Z', d(VALLEY.red));

  // In front of the book: the tea, a tulip glass of red tea on its saucer, steam rising.
  dr.add(`<g transform="translate(-4.8 63.4) scale(0.38)">`);
  path(ellipsePath(60, 99, 37, 7.5), d('#e2dccf'));
  path(ellipsePath(60, 97, 37, 6.5), d('#fbf8f1'));
  path('M41 30H79C79 45 70 51 70 60C70 70 81 74 81 84C81 92 72 97 60 97C48 97 39 92 39 84C39 74 50 70 50 60C50 51 41 45 41 30Z', d('#f3eee6'), ' fill-opacity="0.9"');
  path('M43.5 39H76.5C75 48 67.5 52 67.5 60C67.5 70 78.5 74 78.5 84C78.5 90.5 70.5 94.5 60 94.5C49.5 94.5 41.5 90.5 41.5 84C41.5 74 52.5 70 52.5 60C52.5 52 45 48 43.5 39Z', warm('#b4452a', dark));
  path('M76.5 39C75 48 67.5 52 67.5 60C67.5 70 78.5 74 78.5 84C78.5 90.5 70.5 94.5 62 94.5C69 92 73 88 73 83C73 74 63 70 63 60C63 52 70 47 71 39Z', warm('#8a2f1a', dark));
  path(ellipsePath(60, 39, 16.5, 2.4), warm('#d9683c', dark));
  path('M45 34C46 44 54 50 54 60C54 66 47 72 45 80C44 72 50 66 50 60C50 52 45 46 45 34Z', '#ffffff', ' fill-opacity="0.7"');
  dr.add(`<path d="M53 22C49 17 57 13 53 7M67 22C63 17 71 13 67 7" fill="none" stroke="${d('#cfc8bd')}" stroke-width="3" stroke-linecap="round"/>`);
  dr.add(`</g>`);

  // The pomegranate, with its crown and one light.
  const red = d(VALLEY.red);
  dr.add(`<g transform="translate(97 91) scale(0.84) translate(-98 -82.5)">`);
  path('M98 70C90 70 84 76 84 83C84 90 90 95 98 95C106 95 112 90 112 83C112 76 106 70 98 70Z', red);
  path('M107 74C110 77 112 80 112 83C112 90 106 95 98 95C96 95 94 94.6 92.4 94C99 93 105 88 106 81C106.4 78.6 106.6 76 107 74Z', d(VALLEY.redDark));
  path('M94 71.5L95 66.5L97.2 69.4L98 65.4L99.2 69.4L101.4 66.5L102 71.6C100.6 70.8 99.3 70.5 98 70.5C96.6 70.5 95.3 70.8 94 71.5Z', d(VALLEY.redDark));
  path(ellipsePath(91.5, 78.5, 2.6, 4), mix(red, '#ffffff', 0.35));
  dr.add(`</g>`);

  // A breath of light where the letters leave the pages.
  for (const [x, y, r] of [[24, 34, 3.2], [62, 14, 2.4], [104, 46, 2.6], [44, 18, 1.8]] as const) {
    path(softStar(x, y, r), warm(VALLEY.goldLight, dark));
  }
}

/** The whole picture, tiles and all. */
export function dictionarySvg(opts: DictionaryArtOptions = {}): string {
  const size = checkSize(opts.size, 240);
  const dark = opts.dark ?? false;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'dictionary', dark));
  scene(dr, dark);
  for (const t of dictionaryTiles(dark)) dr.add(dictionaryTileSvg(t));
  return dr.svg(size, opts.title ?? 'An open dictionary with Kurdish letters rising from its pages');
}

/** The picture without its tiles, for an app that draws the tiles itself so they can float. */
export function dictionaryStillSvg(opts: DictionaryArtOptions = {}): string {
  const size = checkSize(opts.size, 240);
  const dark = opts.dark ?? false;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'dictionary-still', dark));
  scene(dr, dark);
  return dr.svg(size, opts.title ?? 'An open dictionary');
}
