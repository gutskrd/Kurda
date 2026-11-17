/**
 * What happens round your window on the letters page (letters.ts draws the window and birds): where birds stand on the
 * sill and fly from (`LETTER_SILL_SPOTS`), the letter-carrying birds circling far off (`LETTER_SKY`), what the air
 * carries past by season and hour (`letterDrifts`), and the birdsong when two people become pen pals (`LETTER_NOTES`).
 * Each is a still sprite (`letterSpriteSvg`) whose motion is written out here as positions over time, so it moves the
 * same on both apps; only position, rotation and opacity change.
 */
import type { TreeSeason } from '../tree.js';
import { LETTER_BIRD_FEET, LETTER_FLIGHT, LETTER_PLAY, LETTER_SILL, type LetterPlay } from './letters.js';
import { Drawing, checkSize, prefixFor, radialBox, seeded } from './svg.js';
import type { TreeSky } from './tree-scene.js';

// ───────────────────────────────────────────────────────────── the sill

export type LetterSpot = 'alone' | 'own' | 'visitor';

/**
 * Where a bird stands on the sill (`x`, on the window's 120-unit square) and its square's width (`share` of the
 * window): alone in the middle, or with a visitor, yours on the left and the visitor on the right facing each other,
 * both smaller so they fit between the frame and the pot with clear space between their beaks.
 */
export const LETTER_SILL_SPOTS: Readonly<Record<LetterSpot, { x: number; share: number }>> = {
  alone: { x: LETTER_SILL.x, share: LETTER_SILL.birdShare },
  own: { x: 27, share: 0.36 },
  visitor: { x: 67.5, share: 0.36 },
};

/** A play kept in place: where it would turn round to look behind, it only glances at you, so its tail never swings toward a neighbour. */
function inPlace(play: LetterPlay): LetterPlay {
  return { ...play, moves: play.moves.map((m) => ({ ...m, sx: Math.abs(m.sx) })) };
}

/**
 * The plays of a bird with another beside it: the same as alone but never turning round, so the two keep their
 * distance while one lands, lays its letter down, waves and waits, and the other plays at home.
 */
export const LETTER_PLAY_BESIDE: Readonly<Record<'after' | 'idle', LetterPlay>> = {
  after: inPlace(LETTER_PLAY.after),
  idle: inPlace(LETTER_PLAY.idle),
};

/** A spot's square on the window, as shares of the window's width: left, top and size. */
export function letterSillBox(spot: LetterSpot): { left: number; top: number; size: number } {
  const { x, share } = LETTER_SILL_SPOTS[spot];
  return { left: x / 120 - (share * LETTER_BIRD_FEET.x) / 120, top: LETTER_SILL.y / 120 - (share * LETTER_BIRD_FEET.y) / 120, size: share };
}

/** How a bird at `from` moves to stand at `to`, about its feet: offset in shares of its square at `from`, and scale. */
export function letterSillShift(from: LetterSpot, to: LetterSpot): { x: number; scale: number } {
  const [a, b] = [LETTER_SILL_SPOTS[from], LETTER_SILL_SPOTS[to]];
  return { x: (b.x - a.x) / 120 / a.share, scale: b.share / a.share };
}

/** The middle of a spot's square, as shares of the window. */
const middleOf = (spot: LetterSpot): { x: number; y: number } => {
  const box = letterSillBox(spot);
  return { x: box.left + box.size / 2, y: box.top + box.size / 2 };
};

/** Where every flight ends far off, and where a called bird sets out from: the middle of its square there, as shares of the window. */
export const LETTER_FAR_OFF = (() => {
  const end = LETTER_FLIGHT.keys[LETTER_FLIGHT.keys.length - 1]!;
  const from = middleOf('alone');
  return { x: from.x + end.x, y: from.y + end.y };
})();

/**
 * The flight (`LETTER_FLIGHT`) from a spot, stretched so it ends at the same far-off place from wherever the bird
 * stands, which is also where an incoming bird sets out. Measured like `LETTER_FLIGHT`, in shares of the window from
 * the bird's place on the sill.
 */
export function letterFlightFrom(spot: LetterSpot): Array<{ at: number; x: number; y: number; scale: number; seen: number }> {
  const end = LETTER_FLIGHT.keys[LETTER_FLIGHT.keys.length - 1]!;
  const from = middleOf(spot);
  const [kx, ky] = [(LETTER_FAR_OFF.x - from.x) / end.x, (LETTER_FAR_OFF.y - from.y) / end.y];
  return LETTER_FLIGHT.keys.map((k) => ({ at: k.at, x: k.x * kx, y: k.y * ky, scale: k.scale, seen: k.seen }));
}

// ───────────────────────────────────────────────────────────── the birds out there

/** One bird far off: its size (share of the window's width), one round's duration, and per moment its facing (1 right, -1 left) and middle in shares of the window. */
export interface LetterSkyBird {
  size: number;
  ms: number;
  keys: Array<{ at: number; x: number; y: number; facing: 1 | -1 }>;
}

/** A bird circling a point on an ellipse in direction `dir`, bobbing a little. */
function circling(cx: number, cy: number, rx: number, ry: number, size: number, ms: number, start: number, dir: 1 | -1): LetterSkyBird {
  const steps = 16;
  const keys: LetterSkyBird['keys'] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (dir * i * 2 * Math.PI) / steps;
    // Facing right while the sine is falling, given the direction of travel.
    const facing: 1 | -1 = -Math.sin(t) * dir >= 0 ? 1 : -1;
    keys.push({ at: i / steps, x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) + 0.006 * Math.sin(3 * t), facing });
  }
  return { size, ms, keys };
}

/**
 * The far-off birds, as many as an app shows (`SKY_BIRDS_SHOWN` in letters.ts), each circling its own patch of sky.
 * The first circles where every flight ends, since a call brings that one down.
 */
export const LETTER_SKY: readonly LetterSkyBird[] = [
  circling(LETTER_FAR_OFF.x - 0.04, LETTER_FAR_OFF.y - 0.01, 0.05, 0.02, 0.044, 7200, 0, 1),
  circling(0.38, 0.27, 0.07, 0.025, 0.036, 9400, 2, -1),
  circling(0.55, 0.22, 0.06, 0.02, 0.03, 8600, 4, 1),
  circling(0.3, 0.33, 0.05, 0.018, 0.028, 10200, 1, 1),
  circling(0.62, 0.36, 0.05, 0.02, 0.034, 8000, 3, -1),
  circling(0.46, 0.31, 0.04, 0.015, 0.026, 11000, 5, -1),
];

// ───────────────────────────────────────────────────────────── what the air carries past

/** The small drawings that move round the window. */
export const LETTER_SPRITES = ['petal', 'leaf', 'leaf-red', 'snow', 'seed', 'butterfly', 'firefly', 'star', 'note'] as const;
export type LetterSprite = (typeof LETTER_SPRITES)[number];

/**
 * One small thing moving past: its sprite, size (share of the window's width), duration, start offset (`delay`, a share
 * of `ms`, so a few of a kind are never in step), whether its wings beat (`flap`), and per moment its middle in shares
 * of the window, rotation in degrees and opacity.
 */
export interface LetterDrift {
  sprite: LetterSprite;
  size: number;
  ms: number;
  delay: number;
  flap: boolean;
  keys: Array<{ at: number; x: number; y: number; turn: number; seen: number }>;
}

/** Things falling past the window from above to the meadow, swaying and turning. */
function falling(rand: () => number, sprites: readonly LetterSprite[], count: number, ms: readonly [number, number], size: readonly [number, number], spin: number, sway: number, dim: number): LetterDrift[] {
  const out: LetterDrift[] = [];
  for (let i = 0; i < count; i++) {
    const x0 = 0.24 + rand() * 0.52;
    const phase = rand();
    const turn0 = rand() * 360;
    const amp = sway * (0.6 + rand() * 0.8);
    const keys: LetterDrift['keys'] = [];
    for (let j = 0; j <= 8; j++) {
      const at = j / 8;
      const seen = (at === 0 || at === 1 ? 0 : 1) * dim;
      keys.push({ at, x: x0 + amp * Math.sin(2 * Math.PI * (at * 1.4 + phase)), y: 0.12 + 0.64 * at, turn: turn0 + spin * at * (rand() < 0.5 ? -1 : 1), seen });
    }
    out.push({ sprite: sprites[i % sprites.length]!, size: size[0] + rand() * (size[1] - size[0]), ms: ms[0] + rand() * (ms[1] - ms[0]), delay: i / count, flap: false, keys });
  }
  return out;
}

/** A butterfly wandering over the meadow in loops, its wings beating. */
function wandering(rand: () => number, cx: number, cy: number): LetterDrift {
  const keys: LetterDrift['keys'] = [];
  const phase = rand() * Math.PI * 2;
  for (let j = 0; j <= 12; j++) {
    const at = j / 12;
    const t = 2 * Math.PI * at + phase;
    keys.push({ at, x: cx + 0.12 * Math.sin(t), y: cy + 0.035 * Math.sin(2 * t) - 0.02 * Math.cos(t), turn: 12 * Math.cos(t), seen: 1 });
  }
  return { sprite: 'butterfly', size: 0.05, ms: 11000 + rand() * 3000, delay: rand(), flap: true, keys };
}

/** A firefly drifting in a small round over the meadow, its light coming and going. */
function glowing(rand: () => number): LetterDrift {
  const [cx, cy] = [0.28 + rand() * 0.46, 0.6 + rand() * 0.1];
  const keys: LetterDrift['keys'] = [];
  for (let j = 0; j <= 8; j++) {
    const at = j / 8;
    const t = 2 * Math.PI * at;
    keys.push({ at, x: cx + 0.04 * Math.sin(t), y: cy + 0.025 * Math.sin(2 * t), turn: 0, seen: j % 2 === 0 ? 0.15 : 1 });
  }
  return { sprite: 'firefly', size: 0.035, ms: 5200 + rand() * 2400, delay: rand(), flap: false, keys };
}

/** A star in the night sky, brightening and fading in place. */
function twinkling(rand: () => number): LetterDrift {
  const [x, y] = [0.24 + rand() * 0.52, 0.2 + rand() * 0.16];
  const keys = [0, 0.5, 1].map((at) => ({ at, x, y, turn: 0, seen: at === 0.5 ? 1 : 0.2 }));
  return { sprite: 'star', size: 0.022 + rand() * 0.012, ms: 2600 + rand() * 2200, delay: rand(), flap: false, keys };
}

/** A dandelion seed rising on warm air over the meadow. */
function rising(rand: () => number, i: number, count: number): LetterDrift {
  const x0 = 0.3 + rand() * 0.4;
  const keys: LetterDrift['keys'] = [];
  for (let j = 0; j <= 6; j++) {
    const at = j / 6;
    keys.push({ at, x: x0 + 0.18 * at + 0.02 * Math.sin(6 * at), y: 0.72 - 0.5 * at, turn: 20 * Math.sin(4 * at), seen: at === 0 || at === 1 ? 0 : 0.9 });
  }
  return { sprite: 'seed', size: 0.03, ms: 12000 + rand() * 4000, delay: i / count, flap: false, keys };
}

/**
 * What the air carries past in a season at an hour: petals and a butterfly in spring, butterflies and seeds in summer,
 * leaves in autumn, snow in winter; at night, twinkling stars and fireflies (except in winter, when the snow continues).
 * All of it is outside, seen only through the window.
 */
export function letterDrifts(season: TreeSeason, sky: TreeSky): LetterDrift[] {
  const rand = seeded(`letter-drifts-${season}-${sky}`);
  const night = sky === 'night';
  const out: LetterDrift[] = [];
  if (night) for (let i = 0; i < 6; i++) out.push(twinkling(rand));
  if (season === 'winter') out.push(...falling(rand, ['snow'], 12, [7000, 11000], [0.016, 0.028], 0, 0.03, night ? 0.85 : 1));
  else if (night) for (let i = 0; i < 6; i++) out.push(glowing(rand));
  else if (season === 'spring') out.push(...falling(rand, ['petal'], 7, [9000, 14000], [0.022, 0.032], 220, 0.06, 1), wandering(rand, 0.5, 0.63));
  else if (season === 'summer') {
    out.push(wandering(rand, 0.42, 0.62), wandering(rand, 0.6, 0.66));
    for (let i = 0; i < 4; i++) out.push(rising(rand, i, 4));
  } else out.push(...falling(rand, ['leaf', 'leaf-red'], 7, [8000, 12000], [0.026, 0.036], 320, 0.07, 1));
  // Dusk in summer: the first fireflies.
  if (sky === 'dusk' && season === 'summer') for (let i = 0; i < 2; i++) out.push(glowing(rand));
  return out;
}

/**
 * The birdsong when two people become pen pals: each bird chirps once, the notes swaying up and fading. Drawn inside
 * the room, in front of the birds, from the space between their beaks.
 */
export const LETTER_NOTES: readonly LetterDrift[] = (() => {
  const rand = seeded('letter-notes');
  return [0.38, 0.41, 0.36, 0.43, 0.39].map((x0, i) => {
    const keys: LetterDrift['keys'] = [];
    for (let j = 0; j <= 6; j++) {
      const at = j / 6;
      keys.push({ at, x: x0 + 0.025 * Math.sin(5 * at + i), y: 0.7 - 0.26 * at, turn: 16 * Math.sin(4 * at + i), seen: at === 0 ? 0 : at === 1 ? 0 : 1 - at * 0.4 });
    }
    return { sprite: 'note' as const, size: 0.036 + rand() * 0.016, ms: 1900 + i * 160, delay: 0, flap: false, keys };
  });
})();

// ───────────────────────────────────────────────────────────── the drawings

export interface LetterSpriteOptions {
  sprite: LetterSprite;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** One of the small drawings that move round the window, in the middle of its own transparent square. */
export function letterSpriteSvg(opts: LetterSpriteOptions): string {
  const size = checkSize(opts.size, 120);
  if (!LETTER_SPRITES.includes(opts.sprite)) throw new RangeError(`art: no sprite called ${String(opts.sprite)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'letter-sprite', opts.sprite));
  const soft = (colour: string, edge: string): string => {
    const id = dr.id('s');
    dr.def(radialBox(id, [[0, colour], [0.6, colour], [1, edge]]));
    return `url(#${id})`;
  };
  switch (opts.sprite) {
    case 'petal':
      // A cherry petal, notched at its tip, pink deepening toward its foot.
      dr.add(`<path d="M60 18C66 30 82 40 82 62C82 84 70 100 60 102C50 100 38 84 38 62C38 40 54 30 60 18ZM60 18L56 30L60 34L64 30Z" fill="${soft('#ffe1ea', '#f39ab8')}" fill-rule="evenodd"/>`);
      dr.add(`<path d="M60 40Q58 70 60 96" fill="none" stroke="#f6b6cb" stroke-width="2.4" stroke-linecap="round"/>`);
      break;
    case 'leaf':
    case 'leaf-red': {
      const [base, vein] = opts.sprite === 'leaf' ? ['#f0a03c', '#c9731f'] : ['#e0603a', '#ad4325'];
      // A plane-tree leaf: five points, with veins from the stalk.
      dr.add(`<path d="M60 14L68 34L88 26L82 48L104 52L84 66L94 84L72 80L66 98H54L48 80L26 84L36 66L16 52L38 48L32 26L52 34Z" fill="${base}" stroke="${base}" stroke-width="6" stroke-linejoin="round"/>`);
      dr.add(`<path d="M60 108V40M60 72L84 52M60 72L36 52M60 84L80 78M60 84L40 78" fill="none" stroke="${vein}" stroke-width="3" stroke-linecap="round"/>`);
      break;
    }
    case 'snow':
      dr.add(`<circle cx="60" cy="60" r="34" fill="${soft('#ffffff', '#e4efff')}"/>`);
      break;
    case 'seed':
      // A dandelion seed: a fine white crown of hairs on a stalk.
      dr.add(`<path d="M60 64V104M60 64L28 40M60 64L40 28M60 64L60 22M60 64L80 28M60 64L92 40M60 64L24 58M60 64L96 58" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`);
      dr.add(`<ellipse cx="60" cy="106" rx="4" ry="7" fill="#c9b48a"/>`);
      break;
    case 'butterfly':
      // Seen from above: two pairs of wings, the upper bigger, and the body between.
      dr.add(`<path d="M58 56C46 30 18 26 16 42C14 58 34 66 56 64ZM62 56C74 30 102 26 104 42C106 58 86 66 64 64Z" fill="#f7c948"/>`);
      dr.add(`<path d="M56 66C38 70 28 88 38 96C48 102 56 84 58 70ZM64 66C82 70 92 88 82 96C72 102 64 84 62 70Z" fill="#f29e4c"/>`);
      dr.add(`<circle cx="30" cy="42" r="5" fill="#ffffff" opacity="0.8"/><circle cx="90" cy="42" r="5" fill="#ffffff" opacity="0.8"/>`);
      dr.add(`<path d="M60 40V92" fill="none" stroke="#4a3a52" stroke-width="6" stroke-linecap="round"/>`);
      dr.add(`<path d="M60 42L50 26M60 42L70 26" fill="none" stroke="#4a3a52" stroke-width="2" stroke-linecap="round"/>`);
      break;
    case 'firefly': {
      const id = dr.id('g');
      dr.def(radialBox(id, [[0, '#fffbd0'], [0.25, '#f4f08a', 0.9], [1, '#d6f070', 0]]));
      dr.add(`<circle cx="60" cy="60" r="56" fill="url(#${id})"/>`);
      break;
    }
    case 'star':
      // A sparkle: four long points and four short.
      dr.add(`<path d="M60 8L66 54L112 60L66 66L60 112L54 66L8 60L54 54Z" fill="#ffffff"/>`);
      dr.add(`<path d="M60 36L64 56L84 60L64 64L60 84L56 64L36 60L56 56Z" fill="#fff8d6" transform="rotate(45 60 60)"/>`);
      break;
    case 'note':
      // A note of birdsong, as the pigeon's chirp draws it: a round head, its stem and a flag.
      dr.add(`<ellipse cx="44" cy="88" rx="22" ry="16" fill="#8f8ac6" transform="rotate(-20 44 88)"/>`);
      dr.add(`<path d="M63 84V18Q84 26 92 44Q96 54 90 64" fill="none" stroke="#8f8ac6" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`);
      break;
  }
  return dr.svg(size, opts.title ?? 'A small thing');
}
