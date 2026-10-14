/**
 * Hevalo the deer — the logo's deer, whole, holding up a wooden board.
 *
 * One drawing for the browser and the phone. It is drawn in the logo's own
 * proportions (a 512-unit box, the size of the app icon) and set into a
 * 200 × 220 frame with room under the head for the board: the same chunky,
 * rounded antlers, the big leaf ears with their cream insides, the wide face
 * narrowing to the muzzle, the large white eyes with dark round irises, the
 * freckles low on the cheeks and the big soft nose.
 *
 * It comes in layers, because the parts move on their own: the ears twitch
 * about their roots, the eyes blink about their middle, the board tips about
 * its top edge. Each layer is plain SVG markup in the same frame, so the web
 * stacks them as groups of one <svg> and the phone stacks one SvgXml per
 * animated view, and they line up either way. Gradient and clip ids carry the
 * caller's prefix so two deer on a page never share one.
 *
 * The board's words are not drawn here: letters like ç ê î ş û and the Soranî
 * ones need the platform's own text, so each app sets them in BOARD_TEXT.
 */

/** The frame every layer is drawn in. */
export const DEER_VIEW = { w: 200, h: 220 } as const;

/** Where each moving part turns or squashes, in the frame's coordinates. */
export const DEER_PIVOTS = {
  earLeft: { x: 64, y: 70 },
  earRight: { x: 136, y: 70 },
  eyes: { x: 100, y: 85 },
  board: { x: 100, y: 150 },
} as const;

/** The box on the board where its words go. */
export const DEER_BOARD_TEXT = { x: 36, y: 146, w: 128, h: 48, baseline: 179 } as const;

/** The ink the board's words are set in. */
export const DEER_INK = '#4a2a1c';

const C = {
  furHi: '#e2a466',
  fur: '#c97f42',
  furLo: '#a9622f',
  furDeep: '#8c4f26',
  muzzleHi: '#f2c690',
  muzzle: '#e3a96c',
  freckle: '#f0c38c',
  antlerHi: '#7b4b34',
  antler: '#57301f',
  antlerLo: '#3f2216',
  earIn: '#f6dcb4',
  earInLo: '#e9bf8c',
  eyeWhite: '#ffffff',
  eyeWhiteLo: '#eadfd6',
  eyeRim: '#9b5a2c',
  iris: '#3e2318',
  irisHi: '#6b3f2b',
  nose: '#3a2018',
  noseHi: '#6a4334',
  mouth: '#4a2a1c',
  tongue: '#ec7f86',
  chest: '#f3d3a6',
  card: '#b874f0',
  wood: '#e2ad6c',
  woodHi: '#f2c98f',
  woodLo: '#c98c4c',
  woodEdge: '#93582c',
  hoof: '#4a2a1c',
  star: '#ffc93d',
  starHi: '#ffe48a',
  starEdge: '#c98f12',
} as const;

/** The logo's 512 box, scaled and set into the frame: face centred, chin above the board. */
const LOGO = 'translate(23.2 -11) scale(0.3)';

function clampStars(stars: number): number {
  return Math.max(0, Math.min(5, Math.round(stars)));
}

/**
 * The board's angle for a number of stars: tipped down and to one side with
 * none chosen, level at three, held up at a jaunty angle at five.
 */
export function deerTiltFor(stars: number): number {
  return [-6, -4, -2, 0, 3, 6][clampStars(stars)]!;
}

/**
 * How far the corners of the mouth lift, by stars: a small kind smile with
 * none, a big open one at five. Never below zero — the deer does not frown.
 */
export function deerSmileFor(stars: number): number {
  return [2.5, 3.5, 5, 6.5, 8, 10][clampStars(stars)]!;
}

const f = (v: number): string => (Math.round(v * 100) / 100).toString();

function linear(id: string, stops: [number, string][], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
  return (
    `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
    `</linearGradient>`
  );
}

function radial(id: string, stops: [number, string][], cx = 0.5, cy = 0.4, r = 0.65): string {
  return (
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
    `</radialGradient>`
  );
}

/** A five-pointed star centred on (cx, cy). */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.47;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** The left antler in the 512 box: a thick main beam sweeping up and out, a tine up from its middle, one out low. */
const ANTLER_BEAM = 'M190 204 C178 166 156 128 116 100 C104 92 98 80 98 68';
const ANTLER_TINE_UP = 'M142 118 C138 98 144 82 156 72';
const ANTLER_TINE_OUT = 'M172 158 C186 142 200 130 216 122';

function antler(id: string, mirror: boolean): string {
  const tf = mirror ? ' transform="translate(512 0) scale(-1 1)"' : '';
  const stroke = (d: string, w: number, c: string): string =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return (
    `<g${tf}>` +
    // a dark rim first, then the antler, then a lighter ridge along its top edge
    stroke(ANTLER_BEAM, 50, C.antlerLo) +
    stroke(ANTLER_TINE_UP, 44, C.antlerLo) +
    stroke(ANTLER_TINE_OUT, 42, C.antlerLo) +
    stroke(ANTLER_BEAM, 42, `url(#${id}-ant)`) +
    stroke(ANTLER_TINE_UP, 36, `url(#${id}-ant)`) +
    stroke(ANTLER_TINE_OUT, 34, `url(#${id}-ant)`) +
    `<path d="M174 176 C164 150 146 126 118 108 C110 102 104 92 103 82" fill="none" stroke="${C.antlerHi}" stroke-width="9" stroke-linecap="round" opacity="0.55"/>` +
    `</g>`
  );
}

function ear(id: string, mirror: boolean): string {
  const tf = mirror ? ' transform="translate(512 0) scale(-1 1)"' : '';
  return (
    `<g${tf}>` +
    `<path d="M160 222 C118 180 56 160 6 176 C14 232 64 280 136 292 Z" fill="url(#${id}-ear)" stroke="${C.furDeep}" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M142 238 C110 206 70 192 34 196 C44 234 80 264 128 274 Z" fill="url(#${id}-earin)"/>` +
    `</g>`
  );
}

/** The soft lilac disc behind, the logo's card. It stays put while the deer bobs. */
export function deerCard(): string {
  return (
    `<circle cx="100" cy="112" r="92" fill="${C.card}" opacity="0.18"/>` +
    `<ellipse cx="100" cy="208" rx="62" ry="7" fill="${C.nose}" opacity="0.14"/>`
  );
}

export function deerAntlers(id: string): string {
  return `<defs>${linear(`${id}-ant`, [[0, C.antlerHi], [1, C.antler]])}</defs><g transform="${LOGO}">${antler(id, false)}${antler(id, true)}</g>`;
}

function earDefs(id: string): string {
  return (
    `<defs>` +
    linear(`${id}-ear`, [[0, C.furHi], [1, C.fur]], 0, 0, 1, 1) +
    linear(`${id}-earin`, [[0, C.earIn], [1, C.earInLo]], 0, 0, 1, 1) +
    `</defs>`
  );
}

export function deerEarLeft(id: string): string {
  return `${earDefs(`${id}-l`)}<g transform="${LOGO}">${ear(`${id}-l`, false)}</g>`;
}

export function deerEarRight(id: string): string {
  return `${earDefs(`${id}-r`)}<g transform="${LOGO}">${ear(`${id}-r`, true)}</g>`;
}

/** The body, the head, the muzzle, the nose and the smile — everything that does not move on its own. */
export function deerFace(id: string, stars: number): string {
  const k = deerSmileFor(stars) * 3;
  const open = clampStars(stars) >= 4;
  const half = 18 + k * 0.9;
  const mouth = open
    ? `<clipPath id="${id}-mouth"><path d="M${f(256 - half)} 452 Q256 ${f(454 + k * 2.4)} ${f(256 + half)} 452 Q256 ${f(458 + k * 0.5)} ${f(256 - half)} 452 Z"/></clipPath>` +
      `<path d="M${f(256 - half)} 452 Q256 ${f(454 + k * 2.4)} ${f(256 + half)} 452 Q256 ${f(458 + k * 0.5)} ${f(256 - half)} 452 Z" fill="${C.mouth}"/>` +
      `<ellipse cx="256" cy="${f(456 + k * 1.75)}" rx="${f(k * 1.05)}" ry="${f(k * 0.7)}" fill="${C.tongue}" clip-path="url(#${id}-mouth)"/>`
    : `<path d="M${f(256 - half)} 452 Q256 ${f(452 + k * 1.6)} ${f(256 + half)} 452" fill="none" stroke="${C.mouth}" stroke-width="7" stroke-linecap="round"/>`;
  return (
    `<defs>` +
    radial(`${id}-head`, [[0, C.furHi], [0.6, C.fur], [1, C.furLo]], 0.5, 0.32, 0.72) +
    radial(`${id}-muz`, [[0, C.muzzleHi], [1, C.muzzle]], 0.5, 0.3, 0.7) +
    linear(`${id}-body`, [[0, C.fur], [1, C.furLo]]) +
    radial(`${id}-nose`, [[0, C.noseHi], [1, C.nose]], 0.4, 0.3, 0.75) +
    `</defs>` +
    `<g transform="${LOGO}">` +
    // the body, mostly behind the board, with a pale chest
    `<path d="M176 432 C152 500 140 560 140 640 L372 640 C372 560 360 500 336 432 Z" fill="url(#${id}-body)" stroke="${C.furDeep}" stroke-width="6"/>` +
    `<path d="M216 470 C206 530 204 580 206 640 L306 640 C308 580 306 530 296 470 Z" fill="${C.chest}" opacity="0.9"/>` +
    // the head: a wide brow and full cheeks, narrowing to the muzzle
    `<path d="M256 180 C334 180 396 214 408 290 C418 352 388 402 348 432 C322 456 292 472 256 472 C220 472 190 456 164 432 C124 402 94 352 104 290 C116 214 178 180 256 180 Z" fill="url(#${id}-head)" stroke="${C.furDeep}" stroke-width="6"/>` +
    // the lighter muzzle round the nose and mouth
    `<path d="M256 352 C312 352 350 384 346 424 C342 452 302 470 256 470 C210 470 170 452 166 424 C162 384 200 352 256 352 Z" fill="url(#${id}-muz)"/>` +
    // freckles low on the cheeks, like the logo's
    `<g fill="${C.freckle}">` +
    `<circle cx="150" cy="372" r="7"/><circle cx="136" cy="392" r="5.5"/><circle cx="164" cy="394" r="5"/>` +
    `<circle cx="362" cy="372" r="7"/><circle cx="376" cy="392" r="5.5"/><circle cx="348" cy="394" r="5"/>` +
    `</g>` +
    // the nose: big, soft, rounded, with a shine
    `<path d="M214 398 C214 378 298 378 298 398 C298 424 272 442 256 442 C240 442 214 424 214 398 Z" fill="url(#${id}-nose)"/>` +
    `<ellipse cx="238" cy="394" rx="13" ry="7" fill="#ffffff" opacity="0.35"/>` +
    `<path d="M256 442 V452" stroke="${C.mouth}" stroke-width="6" stroke-linecap="round"/>` +
    mouth +
    `</g>`
  );
}

/** The eyes: big whites, dark round irises looking out, two catchlights each. */
export function deerEyes(id: string): string {
  const eye = (cx: number, ix: number): string =>
    `<ellipse cx="${cx}" cy="306" rx="56" ry="60" fill="url(#${id}-white)" stroke="${C.eyeRim}" stroke-width="5"/>` +
    `<ellipse cx="${ix}" cy="314" rx="29" ry="33" fill="url(#${id}-iris)"/>` +
    `<circle cx="${ix + 10}" cy="300" r="10" fill="#ffffff"/>` +
    `<circle cx="${ix - 9}" cy="330" r="4.5" fill="#ffffff" opacity="0.85"/>`;
  return (
    `<defs>` +
    linear(`${id}-white`, [[0, C.eyeWhite], [0.7, C.eyeWhite], [1, C.eyeWhiteLo]]) +
    radial(`${id}-iris`, [[0, C.irisHi], [1, C.iris]], 0.4, 0.35, 0.7) +
    `</defs>` +
    `<g transform="${LOGO}">${eye(190, 198)}${eye(322, 314)}</g>`
  );
}

export type DeerBoardKind = { kind: 'stars'; stars: number } | { kind: 'letters' };

/**
 * The wooden board and the forelegs that hold it, drawn in the frame. With
 * stars it carries five, as many lit as chosen; a star carries `deer-star`
 * (and `is-on` when lit) for the web's pop when it lights.
 */
export function deerBoard(id: string, board: DeerBoardKind): string {
  const stars = board.kind === 'stars' ? clampStars(board.stars) : 0;
  const starMarks =
    board.kind === 'stars'
      ? [0, 1, 2, 3, 4]
          .map((i) => {
            const on = i < stars;
            return `<path class="deer-star${on ? ' is-on' : ''}" d="${starPath(56 + i * 22, 171, 9.5)}" fill="${on ? `url(#${id}-star)` : 'none'}" stroke="${on ? C.starEdge : C.woodEdge}" stroke-width="1.8" stroke-linejoin="round"${on ? '' : ' stroke-opacity="0.55"'}/>`;
          })
          .join('')
      : '';
  const hoof = (x: number, flip: boolean): string => {
    const s = flip ? -1 : 1;
    // a fur-coloured foreleg over the board's top edge, ending in a split dark hoof
    return (
      `<path d="M${f(x - 7 * s)} 136 C${f(x - 8 * s)} 141 ${f(x - 7 * s)} 146 ${f(x)} 148 C${f(x + 7 * s)} 146 ${f(x + 8 * s)} 141 ${f(x + 7 * s)} 136 Z" fill="url(#${id}-leg)" stroke="${C.furDeep}" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M${f(x - 6.6)} 145 C${f(x - 6.6)} 151 ${f(x - 0.6)} 153 ${f(x - 0.6)} 148.4 Z M${f(x + 6.6)} 145 C${f(x + 6.6)} 151 ${f(x + 0.6)} 153 ${f(x + 0.6)} 148.4 Z" fill="${C.hoof}"/>`
    );
  };
  return (
    `<defs>` +
    linear(`${id}-wood`, [[0, C.woodHi], [0.5, C.wood], [1, C.woodLo]]) +
    linear(`${id}-star`, [[0, C.starHi], [1, C.star]]) +
    linear(`${id}-leg`, [[0, C.fur], [1, C.furHi]]) +
    `</defs>` +
    // the board's shadow on the chest, then the board
    `<rect x="34" y="143" width="132" height="58" rx="14" fill="${C.furDeep}" opacity="0.25"/>` +
    `<rect x="32" y="139" width="136" height="58" rx="14" fill="url(#${id}-wood)" stroke="${C.woodEdge}" stroke-width="2.6"/>` +
    `<rect x="38" y="143.5" width="124" height="5" rx="2.5" fill="#ffffff" opacity="0.28"/>` +
    // a little grain
    `<path d="M46 160 C70 157 96 162 124 158" stroke="${C.woodEdge}" stroke-width="1.1" opacity="0.22" fill="none"/>` +
    `<path d="M74 189 C98 186 128 191 156 187" stroke="${C.woodEdge}" stroke-width="1.1" opacity="0.22" fill="none"/>` +
    starMarks +
    hoof(62, false) +
    hoof(138, true)
  );
}
