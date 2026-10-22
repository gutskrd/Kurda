/**
 * Badges (contract 4, B3): something to collect.
 *
 * A badge is Hevalo doing what it is for (awards.ts): the app's deer, drawn
 * as a flat illustration (mascot.ts), rising out of a plate in the family's
 * shape and the badge's own vivid colour — reading the book, holding up the
 * gem, carrying the lantern, listening in his headphones — with the badge's
 * picture in his hooves or behind him. Under him is the number the tier was
 * earned at, in chunky round figures: the 7 of a seven-day streak, the 100
 * of a hundred lessons. The plate is set in a smooth band of the tier's
 * metal, and the tier climbs in light as well — Sifir a rose-copper band,
 * Zîv silver with a soft light behind, Zêr gold with a glow and sparkles,
 * Firûze turquoise with the sun's rays behind it — while the number says it
 * without colour. On the ranked tiers he holds the rank's own cut stone, so
 * a badge and an emblem show the same thing; a secret, once found, is a
 * treasure with no plate and no deer, held up in a light of its own colour.
 *
 * Small sizes get their own drawing rather than a shrunken one: under 56
 * pixels the plate fills the square with the picture inside it, the number
 * gives way to four pips that count the tier, and the light goes; under 32
 * the picture's finest lines go too.
 *
 * States: `earned` is the whole badge; `locked` (not yet earned) is the same
 * plate, Hevalo and picture in quiet greys, with the first number to reach; `secret`
 * is a secret badge not yet found — a night-sky gem with a "?" on it, the
 * same for every secret.
 */
import type { Crest, CrestBox } from './crest.js';
import { crestMarkup, crestSilhouette } from './crest.js';
import { SCENES, STONE_SCENE } from './awards.js';
import { HERO, PLAIN, paintHero } from './hero.js';
import { ICONS, QUESTION, circ } from './icons.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, RANK_BADGE, RANK_TIERS, badgeArt, isBadgeKey } from './keys.js';
import { DEER, deer, greyDeer } from './mascot.js';
import { numeral, numeralWidth } from './numerals.js';
import type { NumeralStyle } from './numerals.js';
import type { Metal, Plate } from './palette.js';
import { PLATES, SHADOW, STONE, TIER_METAL } from './palette.js';
import { capsule, halo, pips, softStar } from './paint.js';
import { signedArea } from './geometry.js';
import { detailFor, rankCrest } from './ranks.js';
import type { Placement } from './shapes.js';
import { SHAPES, shapePath } from './shapes.js';
import type { Detail } from './svg.js';
import { Drawing, checkSize, grey, linearAt, mix, n, n2, prefixFor, radialAt, seeded } from './svg.js';

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
  /** where Hevalo stands: the middle of his head, and his scale */
  deer: { x: number; y: number; s: number };
  /** above this line he may rise out of the plate; below it he is kept inside it */
  cut: number;
}

/**
 * Large, the plate sits low and Hevalo rises out of it — his head, antlers
 * and raised hooves over its top edge, his chest inside it — with the number
 * across its foot; small, the plate fills the square, and a tiered badge
 * leaves the foot for pips.
 */
function layoutOf(detail: Detail, tiered: boolean): Layout {
  if (detail === 0) {
    return tiered
      ? { plate: { s: 0.86, y: 64 }, band: 5, hero: { cx: 60, cy: 52, scale: 1.6 }, deer: { x: 60, y: 44, s: 0.42 }, cut: 62 }
      : { plate: { s: 0.9, y: 62 }, band: 5.5, hero: { cx: 60, cy: 56, scale: 1.75 }, deer: { x: 60, y: 50, s: 0.46 }, cut: 60 };
  }
  return tiered
    ? { plate: { s: 0.88, y: 54 }, band: 7, hero: { cx: 60, cy: 52, scale: 1.55 }, deer: { x: 60, y: 45, s: 0.4 }, cut: 50 }
    : { plate: { s: 0.96, y: 58 }, band: 7.5, hero: { cx: 60, cy: 57, scale: 1.7 }, deer: { x: 60, y: 52, s: 0.45 }, cut: 54 };
}

/** A secret, once found, is a treasure held up in its own light, with no plate: the picture alone, bigger. */
const TREASURE = { cx: 60, cy: 57, scale: 2.3 };

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

/** A four-pointed sparkle. */
function sparkle(x: number, y: number, r: number): string {
  const w = r * 0.24;
  return `M${n(x)},${n(y - r)}Q${n(x + w)},${n(y - w)} ${n(x + r)},${n(y)}Q${n(x + w)},${n(y + w)} ${n(x)},${n(y + r)}Q${n(x - w)},${n(y + w)} ${n(x - r)},${n(y)}Q${n(x - w)},${n(y - w)} ${n(x)},${n(y - r)}Z`;
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

// ─────────────────────────────────────────────────────────────── the plate

/**
 * The plate: the family's shape with its thickness under it, a smooth band of
 * the tier's metal round it, and inside, the badge's own vivid colour lit
 * from above — a lighter facet across its upper half and a light behind the
 * picture.
 */
function plateOf(dr: Drawing, family: BadgeFamily, lay: Layout, m: Metal, p: Plate, detail: Detail, locked: boolean): string {
  const outline = shapePath(family, lay.plate);
  const face = shapePath(family, lay.plate, lay.band);
  const [top, foot] = spanOf(lay);
  const thick = detail === 0 ? 4 : 5;
  if (locked) {
    return (
      `<path d="${outline}" transform="translate(0 ${n2(thick)})" fill="${STONE.dark}" fill-opacity="0.3"/>` +
      `<path d="${outline}" fill="${STONE.mid}" fill-opacity="0.32" stroke="${STONE.mid}" stroke-width="${n2(detail === 0 ? 1.4 : 2.2)}" stroke-linejoin="round"/>` +
      `<path d="${face}" fill="${STONE.hi}" fill-opacity="0.16" stroke="${STONE.mid}" stroke-opacity="0.6" stroke-width="${n2(detail === 0 ? 1.2 : 1.8)}" stroke-linejoin="round"/>`
    );
  }
  const band = dr.id('m');
  dr.def(
    linearAt(
      band,
      [
        [0, m.hi],
        [0.3, m.light],
        [0.72, m.mid],
        [1, m.dark],
      ],
      0,
      top,
      0,
      foot,
    ),
  );
  const tint = dr.id('e');
  dr.def(linearAt(tint, [[0, p.top], [1, p.bottom]], 0, top + lay.band, 0, foot - lay.band));
  const out = [
    `<path d="${outline}" transform="translate(0 ${n2(thick)})" fill="${p.deep}"/>`,
    `<path d="${outline}" fill="url(#${band})" stroke="${p.deep}" stroke-width="${n2(detail === 0 ? 1.4 : 2.2)}" stroke-linejoin="round"/>`,
    `<path d="${face}" fill="url(#${tint})" stroke="${m.dark}" stroke-width="${n2(detail === 0 ? 1.2 : 1.8)}" stroke-linejoin="round"/>`,
  ];
  if (detail < 2) {
    const clip = dr.clip(face);
    const light = dr.id('w');
    const [cx, cy] = [lay.hero.cx, lay.hero.cy + 6];
    const r = 44 * lay.plate.s;
    dr.def(radialAt(light, [[0, '#ffffff', p === PLATES.night ? 0.25 : 0.4], [1, '#ffffff', 0]], cx, cy, r));
    // the facet: the upper left of the face a shade lighter, cut on a slant
    const facet = `M0,0H120V${n(top + 20)}L0,${n(foot - 18)}Z`;
    out.push(
      `<g clip-path="url(#${clip})"><path d="${facet}" fill="#ffffff" fill-opacity="0.16"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${light})"/>${p === PLATES.night ? stars(family + m.mid) : ''}</g>`,
    );
  }
  return out.join('');
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

/** The light a found secret is held up in: a glowing disc of its own colour, the sun's rays round it. */
function treasureLight(dr: Drawing, p: Plate, detail: Detail): string {
  const glow = dr.id('o');
  dr.def(radialAt(glow, [[0, p.rim, 0.95], [0.3, p.top, 0.8], [0.65, p.bottom, 0.32], [1, p.bottom, 0]], 60, 58, 56));
  return (detail === 0 ? rays(dr, p.bottom) : '') + `<circle cx="60" cy="58" r="56" fill="url(#${glow})"/>`;
}

// ─────────────────────────────────────────────────────────────── the picture

/** A picture on its own — a found secret, or the "?" of one not found yet — sticker-painted and placed. */
function heroOf(dr: Drawing, key: BadgeKey, at: Layout['hero'], edge: string, detail: Detail, state: BadgeState): string {
  const draw = ICONS[key];
  const parts = state === 'secret' || !draw ? QUESTION : draw();
  const { cx, cy, scale } = at;
  const painted = paintHero(parts, {
    dr,
    colours: state === 'secret' ? PLAIN : (HERO[key] ?? PLAIN),
    edge,
    outline: (detail === 0 ? 2.8 : 3.6) / scale,
    small: detail > 0,
    locked: state === 'locked',
    shadow: detail === 0 && state !== 'locked' ? 3.2 / scale : 0,
  });
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(scale)})">${painted}</g>`;
}

/** Hevalo in grey, for a badge not yet earned. */
const GREY_DEER = greyDeer((hex) => mix(grey(hex), '#c3c7cf', 0.3));

/**
 * Hevalo doing what the badge is for: rising out of the plate, the badge's
 * picture held at his chest, held up, or standing behind him; for a ranked
 * tier, the rank's own stone in his hooves.
 */
function sceneOf(dr: Drawing, key: BadgeKey, family: BadgeFamily, lay: Layout, edge: string, detail: Detail, locked: boolean): string {
  const rankTier = rankTierOf(key);
  const scene = rankTier ? STONE_SCENE : SCENES[key];
  if (!scene) return heroOf(dr, key, lay.hero, edge, detail, locked ? 'locked' : 'earned');
  const art = deer(dr, scene.pose, locked ? GREY_DEER : DEER);
  // a raised hoof shows its prop off to one side: he steps a little the other way to make room
  const step = scene.pose.arms === 'raise' ? -9 : 0;
  const { y, s } = lay.deer;
  const x = lay.deer.x + step * (s / 0.42);
  const place = (inner: string): string => (inner ? `<g transform="translate(${n(x)} ${n(y)}) scale(${n2(s)})">${inner}</g>` : '');

  let behind = '';
  let held = '';
  let above = '';
  const prop = scene.prop;
  const draw = ICONS[key];
  if (prop && draw) {
    const at = prop.at === 'hold' || prop.at === 'front' ? { x: art.hold.x, y: art.hold.y - 8 } : prop.at === 'raised' ? { x: art.raised.x + 2, y: art.raised.y - 15 * prop.scale } : { x: 0, y: 0 };
    const painted = paintHero(draw(), {
      dr,
      colours: HERO[key] ?? PLAIN,
      edge: locked ? STONE.dark : edge,
      outline: (detail === 0 ? 2.2 : 3) / (s * prop.scale),
      small: detail > 0,
      locked,
      gloss: false,
    });
    const turn = prop.rotate ? ` rotate(${n(prop.rotate)})` : '';
    const g = `<g transform="translate(${n(at.x + (prop.dx ?? 0))} ${n(at.y + (prop.dy ?? 0))})${turn} scale(${n2(prop.scale)})">${painted}</g>`;
    if (prop.at === 'behind') behind = g;
    else if (prop.at === 'hold') held = g;
    else above = g;
  }
  if (rankTier) {
    // the rank's own stone, set in its bezel, held at his chest
    // drawn as the emblems' small stone: it is small in his hooves, so its finest facets would only be weight
    const crest: Crest = { ...rankCrest(rankTier), wings: 0, base: 0, crown: 'none', beads: false, glow: 0, rays: false };
    const cy = y + (art.hold.y - 6) * s;
    const box: CrestBox = { top: cy - 22, bottom: cy + 18, cap: 15 };
    const small = detail === 0 ? 1 : detail;
    held = '';
    above = locked ? `<g opacity="0.75">${crestSilhouette(crest, small, box, STONE.light, STONE.dark)}</g>` : crestMarkup(dr, crest, { detail: small, box }).markup;
  }

  // below the cut he is kept inside the plate, as if standing in it; above it he rises free. The two
  // are one path wound the same way round, so where they overlap they add up and nothing cancels
  const body = SHAPES[family].body;
  const clockwise = body.kind === 'round' && signedArea(body.shape.vertices) > 0;
  const free = clockwise ? `M0,0H120V${n(lay.cut)}H0Z` : `M0,0V${n(lay.cut)}H120V0Z`;
  const clip = dr.clip(shapePath(family, lay.plate, lay.band) + free);
  const stone = rankTier ? above : '';
  return (
    place(behind) +
    `<g clip-path="url(#${clip})">${place(art.back + art.body + art.head)}</g>` +
    (rankTier ? stone + place(art.arms) : place(held + art.arms + above))
  );
}

// ─────────────────────────────────────────────────────────────── the tier

/** The number under a large tiered badge: the milestone this tier was earned at, or a star for "all of it". */
function milestoneMark(dr: Drawing, milestone: number | 'all', style: NumeralStyle): string {
  const foot = 112;
  if (milestone === 'all') {
    const id = dr.id('nf');
    dr.def(linearAt(id, [[0, style.top], [1, style.bottom]], 0, 86, 0, 112));
    const star = softStar(60, 98, 15.5);
    return (
      `<path d="${star}" transform="translate(0 2)" fill="${style.edge}" stroke="${style.edge}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="${star}" fill="${style.edge}" stroke="${style.edge}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="${star}" fill="url(#${id})"/>`
    );
  }
  const text = String(milestone);
  const h = Math.min(18.5, 80 / numeralWidth(text));
  return numeral(dr, text, 60, foot - h, h, style);
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

  if (treasure) {
    dr.add(treasureLight(dr, p, detail));
    dr.add(heroOf(dr, key, TREASURE, PLATES.night.deep, detail, state));
  } else {
    if (!locked && detail === 0) {
      if (AURA[look] > 0) dr.add(halo(dr, 60, 58, 58, m.light, AURA[look], 0.3));
      if (look === 4 && state === 'earned') dr.add(rays(dr, m.light));
    }
    dr.add(plateOf(dr, plateFamily, lay, m, p, detail, locked));
    // Hevalo on every badge but a secret; a secret not yet found shows only its "?"
    dr.add(state === 'secret' || family === 'secret' ? heroOf(dr, key, lay.hero, p.deep, detail, state) : sceneOf(dr, key, family, lay, p.deep, detail, locked));
  }

  if (numbered) {
    const style: NumeralStyle = locked ? { edge: STONE.mid, top: STONE.hi, bottom: STONE.light } : { edge: p.deep, top: '#ffffff', bottom: mix('#ffffff', m.light, 0.85) };
    dr.add(locked ? `<g opacity="0.75">${milestoneMark(dr, milestone, style)}</g>` : milestoneMark(dr, milestone, style));
  } else if (tiered) {
    dr.add(tierPips(dr, shownTier, tiers, locked ? STONE : m, detail, locked));
  }

  if (!locked && detail === 0 && SPARKLES[look].length > 0) {
    // white with an edge of the tier's metal, so a sparkle shows on the light theme too
    dr.add(`<path d="${SPARKLES[look].map(([x, y, r]) => sparkle(x, y, r)).join('')}" fill="#ffffff" stroke="${m.mid}" stroke-width="1" stroke-linejoin="round"/>`);
  }
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
  const clip = dr.clip(family === 'secret' ? circ(60, 58, 44) : shapePath(family, layoutOf(detail, badgeArt(key).tiers > 1).plate, 0.6));
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
