/**
 * Badges (contract 4, B3): something to collect.
 *
 * A badge is Hevalo with what it is for (awards.ts): the app's own deer —
 * the speaking character himself, the same drawing as when he talks, from
 * the antlers to his chest — rising out of a jewel of a plate, laughing,
 * amazed or dreaming, with the badge's picture beside him as if he were
 * showing it to you, or behind him: drawn whole in its own colours (props/)
 * like the secrets — a porcelain teapot with a rose on it, a golden bell with
 * a pink bow, the Kurdish sun of twenty-one rays rising behind his shoulder.
 *
 * The plate is made like a collector's piece: the family's shape set in a
 * bezel of the tier's polished metal, bands of light across it, with its
 * thickness under it; inside, the badge's colour as deep enamel under glass,
 * lit from behind Hevalo and darkening to its rim, the light breaking into
 * soft rays and glitter. Across its foot is a ribbon of the same metal with
 * the number the tier was earned at engraved in it — the 7 of a seven-day
 * streak, the 100 of a hundred lessons — its ends folded back. The tier
 * climbs in metal and in light: Sifir rose copper, Zîv chrome silver with a
 * soft light behind, Zêr gold with wings, a glow and lens flares, Firûze
 * turquoise with great wings and the sun's rays — while the number says it
 * without colour. On the ranked tiers he shows the rank's own cut stone, so a
 * badge and an emblem show the same thing.
 *
 * Some badges are a picture on their own, drawn whole in its own colours
 * (pictures.ts) — a cluster of crystals, a chest of treasure, the full moon,
 * a diamond, a heart of cloud: no deer, the picture large on a dark stone of
 * the badge's colour in the family's shape, set in the same metal with the
 * same ribbon, wings and light. A secret is drawn whole too, with no plate:
 * a cut stone, dark under a lighter table, rimmed in the neon of its own
 * colour, the picture on it — the white cat of Van, the spring pouring out
 * of its rocks — and once found it is held up in a light of the same colour.
 *
 * Small sizes get their own drawing rather than a shrunken one: under 56
 * pixels the plate fills the square with Hevalo inside it, the ribbon gives
 * way to four pips that count the tier, and the wings, rays and light go;
 * under 32 the picture's finest lines go too.
 *
 * States: `earned` is the whole badge; `locked` (not yet earned) is the same
 * plate, Hevalo and picture in pewter greys, with the first number to reach; `secret`
 * is a secret badge not yet found — the stone in the night's violet neon
 * with a "?" on it, the same for every secret.
 */
import type { Crest, CrestBox } from './crest.js';
import { crestMarkup, crestSilhouette } from './crest.js';
import { FACES, SCENES, STONE_SCENE } from './awards.js';
import type { CharacterArt, EyeState } from '../characters/types.js';
import type { Viseme } from '../lipsync/visemes.js';
import { drawHevalo } from '../characters/hevalo.js';
import { headGroup } from '../characters/index.js';
import { HERO, PLAIN, paintHero } from './hero.js';
import { QUESTION } from './icons.js';
import { drawPicture } from './pen.js';
import { PICTURES } from './pictures.js';
import { PROPS } from './props/index.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, RANK_BADGE, RANK_TIERS, badgeArt, isBadgeKey } from './keys.js';
import { numeral, numeralWidth } from './numerals.js';
import type { NumeralStyle } from './numerals.js';
import type { Metal, Plate } from './palette.js';
import { PLATES, SHADOW, STONE, TIER_METAL } from './palette.js';
import { capsule, halo, pips, softStar } from './paint.js';
import { signedArea } from './geometry.js';
import { detailFor, rankCrest } from './ranks.js';
import type { Placement } from './shapes.js';
import { SHAPES, shapePath } from './shapes.js';
import type { Detail, Pt } from './svg.js';
import { Drawing, checkSize, grey, linearAt, mix, n, n2, prefixFor, radialAt, radialBox, seeded, wholeUnits } from './svg.js';

export type BadgeState = 'earned' | 'locked' | 'secret';

export interface BadgeOptions {
  key: BadgeKey;
  /** 1 Sifir · 2 Zîv · 3 Zêr · 4 Firûze; ignored by single badges. Default 1. */
  tier?: BadgeTier;
  /** default `earned` */
  state?: BadgeState;
  /** pixels; default 96 */
  size?: number;
  /**
   * How many tiers the badge has; defaults to the art's own list. A single
   * badge (1) shows no number and no pips, and wears its family's single-badge look.
   */
  tiers?: number;
  /** the accessible label; defaults to "Agir · Zêr" */
  title?: string;
  idPrefix?: string;
}

/** Under this many pixels a badge is drawn in its small version. */
export const SMALL_BADGE = 56;
/** Under this many pixels a badge keeps only its plate, band, picture and pips. */
export const TINY_BADGE = 32;

/**
 * The look a single (tierless) badge wears. Events and secrets are rare and
 * dated or hidden, so they wear the grand looks; the rest wear Zîv or Zêr.
 */
const SINGLE_LOOK: Record<BadgeFamily, BadgeTier> = {
  learning: 3,
  habit: 2,
  games: 3,
  ranked: 3,
  friends: 3,
  events: 3,
  secret: 4,
};

/** The ranked family's tier badges show their rank tier; the key says which. */
function rankTierOf(key: BadgeKey): RankTier | undefined {
  return RANK_TIERS.find((t) => RANK_BADGE[t] === key);
}

/** How grand a badge is (1–4) and the metal of its band. */
function lookFor(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): { look: BadgeTier; metal: Metal } {
  if (state === 'secret') return { look: 2, metal: SHADOW };
  const look: BadgeTier = tiers > 1 ? tier : SINGLE_LOOK[badgeArt(key).family];
  return { look, metal: TIER_METAL[look] };
}

// ─────────────────────────────────────────────────────────────── the layout

interface Layout {
  plate: Placement;
  /** how wide the metal band round the plate is */
  band: number;
  /** where a picture on its own stands, and how big (1 = the 40-unit icon at 1:1) */
  hero: { cx: number; cy: number; scale: number };
  /** where Hevalo stands: how far down his antlers' tips are, and his scale against his own drawing */
  deer: { top: number; s: number };
  /** where the badge's picture stands beside him, down by his chest, and how big */
  beside: { cx: number; cy: number; scale: number };
  /** where a picture behind him stands: how far out from his middle, how far down, and how big */
  aside: { dx: number; cy: number; scale: number };
  /** above this line he may rise out of the plate; below it he is kept inside it */
  cut: number;
}

/**
 * Large, the plate sits low and Hevalo rises out of it — his antlers and the
 * tips of his ears over its top edge, his chest inside it — with the number
 * across its foot; small, the plate fills the square, and a tiered badge
 * leaves the foot for pips.
 */
function layoutOf(detail: Detail, tiered: boolean): Layout {
  if (detail === 0) {
    return tiered
      ? {
          plate: { s: 0.86, y: 64 },
          band: 5,
          hero: { cx: 60, cy: 52, scale: 1.6 },
          deer: { top: 1, s: 0.13 },
          beside: { cx: 87, cy: 76, scale: 0.92 },
          aside: { dx: 36, cy: 26, scale: 0.8 },
          cut: 62,
        }
      : {
          plate: { s: 0.9, y: 62 },
          band: 5.5,
          hero: { cx: 60, cy: 56, scale: 1.75 },
          deer: { top: 2, s: 0.138 },
          beside: { cx: 87, cy: 82, scale: 1 },
          aside: { dx: 38, cy: 28, scale: 0.85 },
          cut: 60,
        };
  }
  return tiered
    ? {
        plate: { s: 0.88, y: 54 },
        band: 7,
        hero: { cx: 60, cy: 52, scale: 1.55 },
        deer: { top: 0, s: 0.13 },
        beside: { cx: 87, cy: 70, scale: 1 },
        aside: { dx: 38, cy: 26, scale: 0.85 },
        cut: 50,
      }
    : {
        plate: { s: 0.96, y: 58 },
        band: 7.5,
        hero: { cx: 60, cy: 57, scale: 1.7 },
        deer: { top: 1, s: 0.14 },
        beside: { cx: 87, cy: 78, scale: 1.08 },
        aside: { dx: 40, cy: 28, scale: 0.9 },
        cut: 54,
      };
}

/** A secret's cut stone: the family's diamond, nearly the square's size. */
const GEM: Placement = { s: 0.9, y: 58 };
/** Where a secret's picture stands on its stone, and how big. */
const TREASURE = { cx: 60, cy: 57, scale: 1.5 };

/** The plate's top and foot on the canvas, for lighting it. */
const spanOf = (lay: Layout): [number, number] => [lay.plate.y - 54 * lay.plate.s, lay.plate.y + 54 * lay.plate.s];

// ─────────────────────────────────────────────────────────────── the light

/** The light behind a badge, by look: none, a soft light, a glow, a strong glow. */
const AURA: Record<BadgeTier, number> = { 1: 0, 2: 0.22, 3: 0.42, 4: 0.6 };

/** The sun's rays behind a Firûze badge, fading before the square's edge. */
function rays(dr: Drawing, colour: string): string {
  const [cx, cy, reach] = [60, 58, 57];
  const id = dr.id('o');
  dr.def(radialAt(id, [[0, colour, 0.8], [0.45, colour, 0.35], [1, colour, 0]], cx, cy, reach));
  const out: string[] = [];
  const count = 16;
  const w = (Math.PI / count) * 0.45;
  for (let i = 0; i < count; i++) {
    const a = ((i * 360) / count - 90) * (Math.PI / 180);
    out.push(`M${n(cx)},${n(cy)}L${n(cx + Math.cos(a - w) * reach)},${n(cy + Math.sin(a - w) * reach)}L${n(cx + Math.cos(a + w) * reach)},${n(cy + Math.sin(a + w) * reach)}Z`);
  }
  return `<path d="${out.join('')}" fill="url(#${id})"/>`;
}

/** A flare: a four-pointed star of thin rays, the upright ones longer, like light caught on a lens. */
function flare(x: number, y: number, r: number): string {
  const w = r * 0.13;
  const [up, side] = [r * 1.35, r];
  return (
    `M${n(x)},${n(y - up)}Q${n(x + w)},${n(y - w)} ${n(x + side)},${n(y)}Q${n(x + w)},${n(y + w)} ${n(x)},${n(y + up)}` +
    `Q${n(x - w)},${n(y + w)} ${n(x - side)},${n(y)}Q${n(x - w)},${n(y - w)} ${n(x)},${n(y - up)}Z`
  );
}

/** Flares with a soft light round each, in white with an edge of the tier's metal so they show on the light theme too. */
function flares(dr: Drawing, at: readonly (readonly [number, number, number])[], m: Metal): string {
  if (at.length === 0) return '';
  const glow = dr.id('o');
  dr.def(radialBox(glow, [[0, '#ffffff', 0.85], [0.35, m.hi, 0.35], [1, m.hi, 0]]));
  return (
    at.map(([x, y, r]) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.95)}" fill="url(#${glow})"/>`).join('') +
    `<path d="${at.map(([x, y, r]) => flare(x, y, r)).join('')}" fill="#ffffff" stroke="${m.mid}" stroke-width="0.7" stroke-linejoin="round"/>`
  );
}

/** Where the sparkles go, by look: two for Zêr, four for Firûze — never on the picture. */
const SPARKLES: Record<BadgeTier, readonly (readonly [number, number, number])[]> = {
  1: [],
  2: [],
  3: [
    [13, 30, 6.5],
    [107, 22, 5],
  ],
  4: [
    [13, 30, 6.5],
    [107, 22, 5],
    [109, 74, 4.5],
    [11, 80, 3.6],
  ],
};

// ─────────────────────────────────────────────────────────────── the wings

/** The feathers of one wing, root to tip of the fan: how far up the plate's side it grows, its angle, length and width. */
const FEATHERS: Record<3 | 4, readonly (readonly [number, number, number, number])[]> = {
  3: [
    [-14, -38, 22, 8],
    [-8, -18, 19, 7.5],
    [-2, 2, 15, 6.5],
  ],
  4: [
    [-18, -52, 25, 8.5],
    [-12, -34, 25, 8.5],
    [-6, -16, 22, 8],
    [0, 2, 18, 7],
    [6, 20, 14, 6],
  ],
};

/**
 * Wings behind the plate, for the grand looks: three feathers a side in Zêr,
 * five in Firûze, fanned out from the plate's shoulders in the tier's metal,
 * each lit along its upper half — the badge's highest honour told by shape
 * as well as by colour.
 */
function wingsBehind(lay: Layout, look: BadgeTier, m: Metal): string {
  if (look < 3) return '';
  const half = 54 * lay.plate.s;
  const shoulder = lay.plate.y - 4;
  const whole: string[] = [];
  const lit: string[] = [];
  for (const side of [-1, 1] as const) {
    for (const [dy, deg, len, wide] of FEATHERS[look as 3 | 4]) {
      const a = (deg * Math.PI) / 180;
      const [ux, uy] = [Math.cos(a) * side, Math.sin(a)];
      const [nx, ny] = [-uy * side, ux * side];
      const root: Pt = [60 + side * (half - 6), shoulder + dy];
      const at = (along: number, across: number): string => `${n(root[0] + ux * along + nx * across)},${n(root[1] + uy * along + ny * across)}`;
      const r = wide / 2;
      whole.push(`M${at(0, r)}Q${at(len * 0.55, r * 1.5)} ${at(len, 0)}Q${at(len * 0.55, -r * 1.3)} ${at(0, -r)}Z`);
      lit.push(`M${at(0, r)}Q${at(len * 0.55, r * 1.5)} ${at(len, 0)}Q${at(len * 0.5, r * 0.15)} ${at(0, 0)}Z`);
    }
  }
  return (
    `<path d="${whole.join('')}" fill="${m.mid}" stroke="${m.deep}" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="${lit.join('')}" fill="${m.light}"/>`
  );
}

// ─────────────────────────────────────────────────────────────── the plate

/**
 * Polished metal: bands of light and shade across it on a slant, the way a
 * curved bezel catches the light of a room — the shine that makes it read as
 * metal rather than as a colour.
 */
function foil(dr: Drawing, m: Metal, x1: number, y1: number, x2: number, y2: number): string {
  const id = dr.id('m');
  dr.def(
    linearAt(
      id,
      [
        [0, m.hi],
        [0.14, m.light],
        [0.3, m.dark],
        [0.46, m.hi],
        [0.6, m.mid],
        [0.78, m.dark],
        [0.92, m.light],
        [1, m.mid],
      ],
      x1,
      y1,
      x2,
      y2,
    ),
  );
  return `url(#${id})`;
}

/** The enamel of a badge not yet earned: pewter, with the same depth as a coloured one. */
const PEWTER: Plate = { top: STONE.hi, bottom: STONE.mid, rim: STONE.hi, deep: STONE.deep };

/**
 * The plate: the family's shape set in a bezel of the tier's polished metal,
 * with its thickness under it; inside, the badge's own colour as deep enamel
 * under glass — lit from behind the picture and darkening to its edge, the
 * light breaking into soft rays and a little glitter, a sheen of glass across
 * its top and the bezel's shadow round its rim.
 */
function plateOf(dr: Drawing, family: BadgeFamily, lay: Layout, m: Metal, p: Plate, detail: Detail, locked: boolean): string {
  const outline = shapePath(family, lay.plate);
  const face = shapePath(family, lay.plate, lay.band);
  const [top, foot] = spanOf(lay);
  const half = 54 * lay.plate.s;
  const height = foot - top;
  const thick = detail === 0 ? 4 : 5;
  const [metal, enamel] = locked ? [STONE, PEWTER] : [m, p];
  const deep = locked ? STONE.dark : m.deep;
  const glowAt = { x: 60, y: top + height * 0.32 };
  const fill = dr.id('e');
  dr.def(
    radialAt(
      fill,
      [
        [0, mix(enamel.top, '#ffffff', locked ? 0.15 : 0.45)],
        [0.3, enamel.top],
        [0.66, enamel.bottom],
        [1, mix(enamel.bottom, enamel.deep, locked ? 0.4 : 0.82)],
      ],
      glowAt.x,
      glowAt.y,
      height * 0.8,
    ),
  );
  const out = [
    `<path d="${outline}" transform="translate(0 ${n2(thick)})" fill="${deep}"${locked ? ' fill-opacity="0.45"' : ''}/>`,
    `<path d="${outline}" fill="${foil(dr, metal, 60 - half, top, 60 + half, foot)}" stroke="${deep}" stroke-width="${n2(detail === 0 ? 1.3 : 2)}" stroke-linejoin="round"/>`,
    // its edge, wide and soft, is the bezel's shadow falling inside the rim and the groove the enamel is set in
    `<path d="${face}" fill="url(#${fill})" stroke="${locked ? STONE.dark : enamel.deep}" stroke-opacity="${locked ? 0.45 : 0.6}" stroke-width="${n2(detail === 0 ? 3.6 : 4.4)}" stroke-linejoin="round"/>`,
  ];
  if (detail < 2) {
    const clip = dr.clip(face);
    const inside: string[] = [];
    if (detail === 0 && !locked) {
      // the light behind the picture, breaking into rays
      const beam = dr.id('r');
      dr.def(radialBox(beam, [[0, '#ffffff', 0.34], [0.55, '#ffffff', 0.1], [1, '#ffffff', 0]]));
      const count = 14;
      const reach = height * 0.95;
      const wedge = (Math.PI / count) * 0.42;
      const d: string[] = [];
      for (let i = 0; i < count; i++) {
        const a = ((i * 360) / count - 90 + 360 / count / 2) * (Math.PI / 180);
        const P = (t: number): string => `${n(glowAt.x + Math.cos(t) * reach)},${n(glowAt.y + Math.sin(t) * reach)}`;
        d.push(`M${n(glowAt.x)},${n(glowAt.y)}L${P(a - wedge)}L${P(a + wedge)}Z`);
      }
      inside.push(`<path d="${d.join('')}" fill="url(#${beam})"/>`);
      inside.push(glitter(`${family}${p.top}`, 60 - half, top, half * 2, height));
    }
    // the glass: a sheen across the top, and the light it gathers at the foot
    const sheen = dr.id('s');
    dr.def(linearAt(sheen, [[0, '#ffffff', locked ? 0.22 : 0.3], [1, '#ffffff', 0]], 0, top, 0, top + height * 0.42));
    inside.push(
      `<path d="M${n(60 - half * 1.2)},${n(top)}H${n(60 + half * 1.2)}V${n(top + height * 0.3)}C${n(60 + half * 0.4)},${n(top + height * 0.4)} ${n(60 - half * 0.4)},${n(top + height * 0.46)} ${n(60 - half * 1.2)},${n(top + height * 0.42)}Z" fill="url(#${sheen})"/>`,
    );

    if (p === PLATES.night && !locked) inside.push(stars(family + m.mid));
    out.push(`<g clip-path="url(#${clip})">${inside.join('')}</g>`);
  }
  return out.join('');
}

/** A little glitter in the enamel's light: tiny diamond glints, the same for every badge of a family and colour. */
function glitter(seed: string, x: number, y: number, w: number, h: number): string {
  const rnd = seeded(`glitter-${seed}`);
  const d: string[] = [];
  for (let i = 0; i < 8; i++) {
    const [gx, gy, r] = [x + w * (0.1 + rnd() * 0.8), y + h * (0.08 + rnd() * 0.6), 0.8 + rnd() * 1.2];
    d.push(`M${n(gx)},${n(gy - r)}l${n(r * 0.3)},${n(r)}l${n(-r * 0.3)},${n(r)}l${n(-r * 0.3)},${n(-r)}Z`);
  }
  return `<path d="${d.join('')}" fill="#ffffff" fill-opacity="0.85"/>`;
}

function stars(seed: string): string {
  const rnd = seeded(`stars-${seed}`);
  const dots: string[] = [];
  for (let i = 0; i < 14; i++) {
    const [x, y, r] = [22 + rnd() * 76, 24 + rnd() * 66, 0.5 + rnd() * 0.8];
    dots.push(`M${n(x - r)},${n(y)}a${n2(r)},${n2(r)} 0 1 0 ${n2(r * 2)},0a${n2(r)},${n2(r)} 0 1 0 -${n2(r * 2)},0Z`);
  }
  return `<path d="${dots.join('')}" fill="#ffffff" fill-opacity="0.7"/>`;
}

/** The light a found secret is held up in: a glow of its own colour, the sun's rays round it. */
function treasureLight(dr: Drawing, p: Plate, detail: Detail): string {
  const glow = dr.id('o');
  dr.def(radialAt(glow, [[0, p.rim, 0.85], [0.35, p.top, 0.6], [0.7, p.bottom, 0.22], [1, p.bottom, 0]], 60, 58, 56));
  return (detail === 0 ? rays(dr, p.bottom) : '') + `<circle cx="60" cy="58" r="56" fill="url(#${glow})"/>`;
}

/** A plate's colour gone deep, for a picture set on it by itself: a stone lit from behind what is set in it. */
const stoneOf = (p: Plate): Plate => ({ top: mix(p.bottom, p.deep, 0.3), bottom: mix(p.deep, '#000000', 0.2), rim: p.rim, deep: mix(p.deep, '#000000', 0.55) });

/** How much of the plate a picture set on it by itself may fill: the leaf is narrow across its tips, the rosette's lobes take its edge. */
const OBJECT_FIT: Readonly<Partial<Record<BadgeFamily, number>>> = { friends: 0.82, events: 0.92 };

/** Where a picture set on a plate by itself stands: in the middle of the plate's face, as big as its shape allows. */
const objectAt = (lay: Layout, family: BadgeFamily): Layout['hero'] => ({
  cx: 60,
  cy: lay.plate.y - 3 * lay.plate.s,
  scale: 1.5 * lay.plate.s * (OBJECT_FIT[family] ?? 1),
});

/** The "?" of a secret not yet found glows violet, the colour of the night it is cut from. */
const SHADOW_NEON: Plate = { top: '#a77bff', bottom: '#6a3de8', rim: '#e6dbff', deep: '#22105c' };

/** A stone's colour as a metal: white at its brightest, through its colour to its darkest — the neon the "?" is made of. */
const neonOf = (p: Plate): Metal => ({ hi: '#ffffff', light: p.rim, mid: p.top, dark: p.bottom, deep: p.deep });

/**
 * A secret's stone: a dark cut gem in the family's diamond, its table a
 * shade lighter, its facets running to its corners, rimmed in the secret's
 * own neon with the glow of it round the edge. A secret not yet found is the
 * same stone in the night's colours, a badge not yet earned in pewter.
 */
function gemOf(dr: Drawing, p: Plate, detail: Detail): string {
  const outline = shapePath('secret', GEM);
  const dark = mix(p.deep, '#000000', 0.45);
  const body = dr.id('e');
  dr.def(radialAt(body, [[0, mix(p.bottom, p.deep, 0.2)], [0.55, p.deep], [1, dark]], 60, 46, 58));
  const out = [`<path d="${outline}" transform="translate(0 ${detail === 0 ? 4 : 5})" fill="${dark}"/>`, `<path d="${outline}" fill="url(#${body})"/>`];
  if (detail < 2) {
    const table = shapePath('secret', GEM, 15);
    const shade = dr.id('t');
    dr.def(linearAt(shade, [[0, p.top, 0.5], [1, p.deep, 0.15]], 0, 30, 0, 86));
    // the crown's facets, from the table's corners out to the stone's
    const [inner, outer] = [53 * GEM.s - 21.5, 53 * GEM.s - 7.5];
    const y = GEM.y;
    const facets = `M60,${n(y - inner)}V${n(y - outer)}M60,${n(y + inner)}V${n(y + outer)}M${n(60 - inner)},${n(y)}H${n(60 - outer)}M${n(60 + inner)},${n(y)}H${n(60 + outer)}`;
    out.push(
      `<path d="${table}" fill="url(#${shade})" stroke="${p.rim}" stroke-opacity="0.4" stroke-width="0.9" stroke-linejoin="round"/>`,
      `<path d="${facets}" stroke="${p.rim}" stroke-opacity="0.4" stroke-width="0.9"/>`,
    );
  }
  // the neon rim, and its glow
  out.push(
    `<path d="${outline}" fill="none" stroke="${p.top}" stroke-opacity="0.4" stroke-width="${detail === 0 ? 6 : 7}" stroke-linejoin="round"/>`,
    `<path d="${outline}" fill="none" stroke="${p.rim}" stroke-width="${detail === 0 ? 1.8 : 2.6}" stroke-linejoin="round"/>`,
  );
  return out.join('');
}

// ─────────────────────────────────────────────────────────────── the picture

/** A picture on its own, placed: one drawn whole (pictures.ts), or an icon painted — the "?" of a secret not found yet in neon. */
function heroOf(dr: Drawing, key: BadgeKey, at: Layout['hero'], edge: string, detail: Detail, state: BadgeState, material?: Metal): string {
  const { cx, cy, scale } = at;
  // a picture drawn whole, in its own colours
  const picture = state === 'secret' ? undefined : PICTURES[key];
  if (picture) return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(scale)})">${drawPicture(picture, { dr, detail, locked: state === 'locked' })}</g>`;
  // otherwise the "?" of a secret not found yet
  const painted = paintHero(QUESTION, {
    dr,
    colours: state === 'secret' ? PLAIN : (HERO[key] ?? PLAIN),
    edge,
    outline: (detail === 0 ? 1.8 : 2.8) / scale,
    small: detail > 0,
    locked: state === 'locked',
    shadow: detail === 0 && state !== 'locked' ? 2.6 / scale : 0,
    ...(material && state !== 'locked' ? { material } : {}),
  });
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(scale)})">${painted}</g>`;
}

/** What the ids in Hevalo's drawing start with until a badge gives them its own. */
const STAND_IN = 'hvbadgedeer-';
/** Where his face is drawn about, in his own units: his drawing is centred on the badge there. */
const MIDDLE = 255;
let drawn: CharacterArt | undefined;
const figures = new Map<string, string>();
/**
 * Hevalo from the antlers to his chest, with a face and a turn of his head:
 * drawn once, as every badge shows the same drawing of him, and in whole
 * units of his own — at an eighth of his size, a tenth of one is far under
 * a pixel. A badge gives the ids its own.
 */
function hevalo(eyes: EyeState, mouth: Viseme, tilt: number): string {
  const key = `${eyes}|${mouth}|${tilt}`;
  let figure = figures.get(key);
  if (figure === undefined) {
    const art = (drawn ??= drawHevalo(STAND_IN));
    figure = wholeUnits((art.chest ?? art.body) + headGroup(art, mouth, eyes, tilt));
    figures.set(key, figure);
  }
  return figure;
}

const greys = new Map<string, string>();
/** Hevalo in quiet greys, for a badge not yet earned: each of his colours taken to the stone's grey. */
function greyed(markup: string): string {
  return markup.replace(/#[0-9a-f]{6}\b/gi, (hex) => {
    let g = greys.get(hex);
    if (!g) {
      g = mix(grey(hex), '#c3c7cf', 0.3);
      greys.set(hex, g);
    }
    return g;
  });
}

/**
 * Hevalo with what the badge is for: rising out of the plate, from the
 * antlers to his chest, with his face for it, and the badge's picture beside
 * him or behind him; for a ranked tier, the rank's own stone.
 */
function sceneOf(dr: Drawing, key: BadgeKey, family: BadgeFamily, lay: Layout, m: Metal, detail: Detail, locked: boolean): string {
  const edge = m.deep;
  const rankTier = rankTierOf(key);
  const scene = rankTier ? STONE_SCENE : SCENES[key];
  if (!scene) return heroOf(dr, key, lay.hero, edge, detail, locked ? 'locked' : 'earned');
  // a badge not yet earned: he is dreaming of it
  const face = FACES[locked ? 'dream' : scene.mood];
  const own = hevalo(face.eyes, face.mouth, scene.tilt ?? 0).replaceAll(STAND_IN, `${dr.id('d')}-`);
  const { top, s } = lay.deer;
  const him = `<g transform="translate(${n2(60 - MIDDLE * s)} ${n2(top)}) scale(${s})">${locked ? greyed(own) : own}</g>`;

  let behind = '';
  let before = '';
  const prop = scene.prop;
  const picture = PROPS[key];
  if (rankTier) {
    // the rank's own stone, set in its bezel: drawn as the emblems' small stone, for its finest facets would only be weight here
    const crest: Crest = { ...rankCrest(rankTier), wings: 0, base: 0, crown: 'none', beads: false, glow: 0, rays: false };
    const k = lay.beside.scale;
    const box: CrestBox = { top: lay.beside.cy - 21 * k, bottom: lay.beside.cy + 19 * k, cap: 15 * k };
    const small = detail === 0 ? 1 : detail;
    // a crest is always drawn on the square's middle line: moved from there to where his picture would be
    const stone = locked ? `<g opacity="0.75">${crestSilhouette(crest, small, box, STONE.light, STONE.dark)}</g>` : crestMarkup(dr, crest, { detail: small, box }).markup;
    before = `<g transform="translate(${n(lay.beside.cx - 60)} 0)">${stone}</g>`;
  } else if (picture) {
    const out = prop.at === 'behind';
    const place = out
      ? { x: 60 + (prop.dx ?? 1) * lay.aside.dx, y: lay.aside.cy + (prop.dy ?? 0), scale: lay.aside.scale * (prop.scale ?? 1) }
      : { x: lay.beside.cx + (prop.dx ?? 0), y: lay.beside.cy + (prop.dy ?? 0), scale: lay.beside.scale * (prop.scale ?? 1) };
    // drawn whole in its own colours; at his side it is small, so without its finest details
    const painted = drawPicture(picture, { dr, detail: detail === 2 ? 2 : 1, locked });
    const turn = prop.rotate ? ` rotate(${n(prop.rotate)})` : '';
    // the picture glows with its own colour, a light of it on the plate and the page round it
    const shine = locked || detail === 2 ? '' : halo(dr, place.x, place.y, 19 * place.scale, m.light, 0.75, 0.25);
    const g = `${shine}<g transform="translate(${n(place.x)} ${n(place.y)})${turn} scale(${n2(place.scale)})">${painted}</g>`;
    if (out) behind = g;
    else before = g;
  }

  // below the cut he is kept inside the plate, as if standing in it; above it he rises free. The two
  // are one path wound the same way round, so where they overlap they add up and nothing cancels
  const body = SHAPES[family].body;
  const clockwise = body.kind === 'round' && signedArea(body.shape.vertices) > 0;
  const free = clockwise ? `M0,0H120V${n(lay.cut)}H0Z` : `M0,0V${n(lay.cut)}H120V0Z`;
  const clip = dr.clip(shapePath(family, lay.plate, lay.band) + free);
  return behind + `<g clip-path="url(#${clip})">${him}</g>` + before;
}

// ─────────────────────────────────────────────────────────────── the tier

/**
 * The number under a large tiered badge, on a ribbon of the tier's metal
 * across the plate's foot — the milestone this tier was earned at, engraved,
 * or a star for "all of it". The ribbon's ends fold back behind it.
 */
function milestoneMark(dr: Drawing, milestone: number | 'all', m: Metal): string {
  const [cy, h] = [104, 20];
  const text = milestone === 'all' ? '' : String(milestone);
  const size = 13;
  const w = Math.max(36, (milestone === 'all' ? 1.2 : numeralWidth(text)) * size + 18);
  const [x0, x1, y0, y1] = [60 - w / 2, 60 + w / 2, cy - h / 2, cy + h / 2];
  const arch = 2;
  // the folded ends, behind, a step lower, cut into a swallowtail
  const tail = (x: number, dir: -1 | 1): string => {
    const [inner, outer] = [x - dir * 3, x + dir * 9];
    return `M${n(inner)},${n(y0 + 4)}L${n(outer)},${n(y0 + 4)}L${n(outer - dir * 3.5)},${n(cy + 3)}L${n(outer)},${n(y1 + 4)}L${n(inner)},${n(y1 + 4)}Z`;
  };
  const band = dr.id('n');
  dr.def(
    linearAt(
      band,
      [
        [0, m.hi],
        [0.3, m.light],
        [0.62, m.mid],
        [1, m.dark],
      ],
      0,
      y0,
      0,
      y1,
    ),
  );
  const out = [
    `<path d="${tail(x0, -1)}${tail(x1, 1)}" fill="${m.dark}" stroke="${m.deep}" stroke-width="1.2" stroke-linejoin="round"/>`,
    `<path d="M${n(x0)},${n(y0)}Q60,${n(y0 - arch)} ${n(x1)},${n(y0)}V${n(y1)}Q60,${n(y1 - arch)} ${n(x0)},${n(y1)}Z" fill="url(#${band})" stroke="${m.deep}" stroke-width="1.3" stroke-linejoin="round"/>`,
    `<path d="M${n(x0 + 2.5)},${n(y0 + 1.6)}Q60,${n(y0 - arch + 1.6)} ${n(x1 - 2.5)},${n(y0 + 1.6)}" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="0.9" stroke-linecap="round"/>`,
  ];
  // engraved: the figures in the metal's darkest tone, the light catching the cut's lower edge
  const style: NumeralStyle = { edge: m.hi, top: m.deep, bottom: m.deep, rim: 0.07, drop: 0.07 };
  if (milestone === 'all') {
    const star = softStar(60, cy - 0.5, 7.5);
    out.push(`<path d="${star}" transform="translate(0 0.8)" fill="${m.hi}"/><path d="${star}" fill="${m.deep}"/>`);
  } else {
    out.push(numeral(dr, text, 60, cy - size / 2 - 0.5, size, style));
  }
  return out.join('');
}

/** The pips under a small tiered badge: four, as many lit as the tier. */
function tierPips(dr: Drawing, tier: number, count: number, m: Metal, detail: Detail, locked: boolean): string {
  const cy = 106;
  const r = detail === 1 ? 5.6 : 6.6;
  const gap = detail === 1 ? 5 : 4.4;
  const w = count * r * 2 + (count - 1) * gap + r * 2.2;
  const h = r * 2 + r * 1.4;
  const pill = capsule(60, cy, w, h);
  if (locked) return `<path d="${pill}" fill="${STONE.dark}" fill-opacity="0.35" stroke="${STONE.mid}" stroke-width="2"/>` + pips(dr, STONE, count, 0, 60, cy, r, gap);
  return `<path d="${pill}" fill="${m.deep}" stroke="${m.mid}" stroke-width="2"/>` + pips(dr, m, count, tier, 60, cy, r, gap);
}

function titleOf(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): string {
  const name = badgeArt(key).name;
  if (state === 'secret') return 'Secret badge';
  if (state === 'locked') return `${name} · not earned yet`;
  return tiers > 1 ? `${name} · ${BADGE_TIER_NAMES[tier]}` : name;
}

/** A badge as an SVG string. */
export function badgeSvg(opts: BadgeOptions): string {
  const { key } = opts;
  if (!isBadgeKey(key)) throw new RangeError(`art: no badge art for key ${String(key)}`);
  const tier = opts.tier ?? 1;
  if (![1, 2, 3, 4].includes(tier)) throw new RangeError(`art: badge tier must be 1–4, got ${String(tier)}`);
  const state = opts.state ?? 'earned';
  if (!['earned', 'locked', 'secret'].includes(state)) throw new RangeError(`art: unknown badge state ${String(state)}`);
  const tiers = opts.tiers ?? badgeArt(key).tiers;
  if (!Number.isInteger(tiers) || tiers < 1 || tiers > 4) throw new RangeError(`art: tiers must be 1–4, got ${String(tiers)}`);
  const size = checkSize(opts.size, 96);
  const detail = detailFor(size, SMALL_BADGE, TINY_BADGE);
  const family = badgeArt(key).family;
  const shownTier = (tiers > 1 ? Math.min(tier, tiers) : 1) as BadgeTier;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'badge', key, shownTier, state, tiers, detail));
  const title = opts.title ?? titleOf(key, shownTier, tiers, state);
  const tiered = tiers > 1 && state !== 'secret';
  const lay = layoutOf(detail, tiered);
  const plateFamily: BadgeFamily = state === 'secret' ? 'secret' : family;
  const { look, metal: m } = lookFor(key, shownTier, tiers, state);
  const locked = state === 'locked';
  // the number a tier was earned at; one the art does not know (a tier asked of a single badge) is counted in pips instead
  const milestone = badgeArt(key).milestones[(locked ? 1 : shownTier) - 1];
  const numbered = tiered && detail === 0 && milestone !== undefined;

  const colours = state === 'secret' ? PLAIN : (HERO[key] ?? PLAIN);
  const p = PLATES[colours.plate];
  // a secret once found is a treasure in its own light; every other badge stands on its plate
  const treasure = family === 'secret' && state === 'earned';

  if (family === 'secret' || state === 'secret') {
    // a secret is a cut stone with its picture on it; found, it is held up in its light
    const stone = locked ? PEWTER : p;
    if (treasure) dr.add(treasureLight(dr, p, detail));
    dr.add(gemOf(dr, stone, detail));
    dr.add(heroOf(dr, key, TREASURE, mix(stone.deep, '#000000', 0.3), detail, state, neonOf(state === 'secret' ? SHADOW_NEON : stone)));
  } else {
    if (!locked && detail === 0) {
      // the enamel's own colour glows round it; the grander looks add the light of their metal
      dr.add(halo(dr, 60, 60, 56, p.top, 0.34, 0.45));
      if (AURA[look] > 0) dr.add(halo(dr, 60, 58, 58, m.light, AURA[look], 0.3));
      if (look === 4 && state === 'earned') dr.add(rays(dr, m.light));
    }
    if (!locked && detail === 0 && state === 'earned') dr.add(wingsBehind(lay, look, m));
    if (PICTURES[key]) {
      // a picture on its own: set on a dark stone of its colour in the family's shape, in the tier's metal
      dr.add(plateOf(dr, plateFamily, lay, m, stoneOf(p), detail, locked));
      dr.add(heroOf(dr, key, objectAt(lay, family), m.deep, detail, state));
    } else {
      dr.add(plateOf(dr, plateFamily, lay, m, p, detail, locked));
      // Hevalo on every badge but a secret; a secret not yet found shows only its "?"
      dr.add(sceneOf(dr, key, family, lay, locked ? STONE : m, detail, locked));
    }
  }

  if (numbered) {
    dr.add(milestoneMark(dr, milestone, locked ? STONE : m));
  } else if (tiered) {
    dr.add(tierPips(dr, shownTier, tiers, locked ? STONE : m, detail, locked));
  }

  if (!locked && detail === 0) dr.add(flares(dr, SPARKLES[look], m));
  return dr.svg(size, title);
}

/**
 * Whether a badge has the glint (research §5.2): Zêr and Firûze, and the single
 * badges that wear their looks. The apps play it once when the badge is earned
 * and again on hover or tap — never under reduced motion.
 */
export function badgeShines(key: BadgeKey, tier: BadgeTier = 1, tiers?: number): boolean {
  if (!isBadgeKey(key)) return false;
  const count = tiers ?? badgeArt(key).tiers;
  const shownTier = (count > 1 ? Math.min(tier, count) : 1) as BadgeTier;
  return lookFor(key, shownTier, count, 'earned').look >= 3;
}

export interface BadgeShineOptions {
  key: BadgeKey;
  /** pixels; the same as the badge it lies on. Default 96. */
  size?: number;
  /**
   * Where the glint is on its way across, 0 (off the upper left) to 1 (off
   * the lower right). An app steps it over about a second to play the glint.
   */
  phase?: number;
  idPrefix?: string;
}

/**
 * The glint on its own: a soft band of light, clipped to the badge's plate, to
 * lay over the badge at the same size — a gleam across glazed enamel, not a
 * flash. Decorative: its title says so, and the apps hide it from screen
 * readers.
 */
export function badgeShineSvg(opts: BadgeShineOptions): string {
  const { key } = opts;
  if (!isBadgeKey(key)) throw new RangeError(`art: no badge art for key ${String(key)}`);
  const phase = opts.phase ?? 0.5;
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) throw new RangeError(`art: phase must be 0–1, got ${String(phase)}`);
  const size = checkSize(opts.size, 96);
  const detail = detailFor(size, SMALL_BADGE, TINY_BADGE);
  const family = badgeArt(key).family;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'glint', family, n2(phase), detail));
  // a found secret has no plate: its glint crosses the light it is held up in
  const clip = dr.clip(family === 'secret' ? shapePath('secret', GEM, 0.6) : shapePath(family, layoutOf(detail, badgeArt(key).tiers > 1).plate, 0.6));
  const band = dr.id('g');
  dr.def(
    linearAt(
      band,
      [
        [0, '#ffffff', 0],
        [0.5, '#ffffff', 0.42],
        [1, '#ffffff', 0],
      ],
      -16,
      0,
      16,
      0,
    ),
  );
  const x = -34 + phase * 188;
  dr.add(`<g clip-path="url(#${clip})"><g transform="translate(${n(x)} 60) rotate(28)"><rect x="-16" y="-90" width="32" height="180" fill="url(#${band})"/></g></g>`);
  return dr.svg(size, 'Shine');
}
