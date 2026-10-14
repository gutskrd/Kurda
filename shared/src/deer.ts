/**
 * Hevalo the deer holding up a wooden board.
 *
 * The deer is the mascot itself — the very picture from the app icon, cut
 * free of its lilac card (`mascot-deer.png` in each app) — so it is exactly
 * the same deer everywhere. What is drawn here is what goes with it: the soft
 * lilac disc it stands on, and the board with the forelegs that hold it, set
 * over the picture in one 200 × 220 frame.
 *
 * The board moves on its own — it tips with the stars about its top edge — so
 * it is its own layer: the web puts it in a group of the same <svg> as the
 * picture, the phone in its own SvgXml in an animated view, and they line up
 * either way. Gradient ids carry the caller's prefix so two deer on a page
 * never share one.
 *
 * The board's words are not drawn here: letters like ç ê î ş û and the Soranî
 * ones need the platform's own text, so each app sets them in BOARD_TEXT.
 */

/** The frame every layer is drawn in. */
export const DEER_VIEW = { w: 200, h: 220 } as const;

/**
 * Where the mascot's picture sits in the frame. The picture is 512 × 480; its
 * chin comes down just above the board, which covers the neck.
 */
export const DEER_PICTURE = { x: 22, y: 0, w: 156, h: 146.25 } as const;

/** Where the board turns as it tips, in the frame's coordinates. */
export const DEER_BOARD_PIVOT = { x: 100, y: 150 } as const;

/** The box on the board where its words go. */
export const DEER_BOARD_TEXT = { x: 36, y: 146, w: 128, h: 48, baseline: 179 } as const;

/** The ink the board's words are set in. */
export const DEER_INK = '#4a2a1c';

const C = {
  // the mascot's own fur, light to dark, for the forelegs
  furHi: '#d9955a',
  fur: '#bf7a43',
  furDeep: '#8c4f26',
  hoof: '#4a2a1c',
  card: '#b874f0',
  wood: '#e2ad6c',
  woodHi: '#f2c98f',
  woodLo: '#c98c4c',
  woodEdge: '#93582c',
  star: '#ffc93d',
  starHi: '#ffe48a',
  starEdge: '#c98f12',
} as const;

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

const f = (v: number): string => (Math.round(v * 100) / 100).toString();

function linear(id: string, stops: [number, string][]): string {
  return (
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
    `</linearGradient>`
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

/** The soft lilac disc behind, the logo's card. It stays put while the deer bobs. */
export function deerCard(): string {
  return (
    `<circle cx="100" cy="112" r="92" fill="${C.card}" opacity="0.18"/>` +
    `<ellipse cx="100" cy="208" rx="62" ry="7" fill="${C.hoof}" opacity="0.14"/>`
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
  const foreleg = (x: number, flip: boolean): string => {
    const s = flip ? -1 : 1;
    // a foreleg in the mascot's fur coming over the board's top edge, ending in a split dark hoof
    return (
      `<path d="M${f(x - 7 * s)} 134 C${f(x - 8 * s)} 140 ${f(x - 7 * s)} 146 ${f(x)} 148 C${f(x + 7 * s)} 146 ${f(x + 8 * s)} 140 ${f(x + 7 * s)} 134 Z" fill="url(#${id}-leg)" stroke="${C.furDeep}" stroke-width="1.4" stroke-linejoin="round"/>` +
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
    foreleg(62, false) +
    foreleg(138, true)
  );
}
