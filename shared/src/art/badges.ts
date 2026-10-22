/**
 * Badges (contract 4, B3): something to collect.
 *
 * A badge is its picture first — the thing itself in its own colours, big,
 * glossy and outlined like a sticker (hero.ts) — standing on a pale plate in
 * its family's shape and tint and rising out over the plate's top edge. The
 * plate is set in a smooth band of the tier's metal, and under it is the
 * number the tier was earned at, in chunky round figures: the 7 of a
 * seven-day streak, the 100 of a hundred lessons. The tier climbs in light as
 * well as in metal — Sifir a rose-copper band, Zîv silver with a soft light
 * behind, Zêr gold with a glow and sparkles, Firûze turquoise with the sun's
 * rays behind it — and the number says it without colour. The ranked family's
 * tier badges carry the rank's own cut stone as their picture, so a badge and
 * an emblem show the same thing.
 *
 * Small sizes get their own drawing rather than a shrunken one: under 56
 * pixels the plate fills the square with the picture inside it, the number
 * gives way to four pips that count the tier, and the light goes; under 32
 * the picture's finest lines go too.
 *
 * States: `earned` is the whole badge; `locked` (not yet earned) is the same
 * plate and picture in a quiet grey, with the first number to reach; `secret`
 * is a secret badge not yet found — a night-sky gem with a "?" on it, the
 * same for every secret.
 */
import type { Crest, CrestBox } from './crest.js';
import { crestMarkup, crestSilhouette } from './crest.js';
import { HERO, PLAIN, paintHero } from './hero.js';
import { ICONS, QUESTION } from './icons.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, RANK_BADGE, RANK_TIERS, badgeArt, isBadgeKey } from './keys.js';
import { numeral, numeralWidth } from './numerals.js';
import type { NumeralStyle } from './numerals.js';
import type { Metal } from './palette.js';
import { PLATE, SHADOW, STONE, TIER_METAL } from './palette.js';
import { capsule, halo, pips, softStar } from './paint.js';
import { detailFor, rankCrest } from './ranks.js';
import type { Placement } from './shapes.js';
import { shapePath } from './shapes.js';
import type { Detail } from './svg.js';
import { Drawing, checkSize, linearAt, mix, n, n2, prefixFor, radialAt, seeded } from './svg.js';

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
  /** where the picture stands, and how big (1 = the 40-unit icon at 1:1) */
  hero: { cx: number; cy: number; scale: number };
  /** where a rank's stone stands, when the picture is one */
  stone: CrestBox;
}

/**
 * Large, the plate sits low and a little small so the picture rises out over
 * its top and the number has the foot; small, the plate fills the square,
 * the picture stays inside it, and a tiered badge leaves the foot for pips.
 */
function layoutOf(detail: Detail, tiered: boolean): Layout {
  if (detail === 0) {
    return tiered
      ? { plate: { s: 0.86, y: 63 }, band: 6.5, hero: { cx: 60, cy: 47, scale: 1.48 }, stone: { top: 14, bottom: 86, cap: 26 } }
      : { plate: { s: 0.9, y: 62 }, band: 7, hero: { cx: 60, cy: 54, scale: 1.6 }, stone: { top: 16, bottom: 98, cap: 27 } };
  }
  return tiered
    ? { plate: { s: 0.86, y: 54 }, band: 8, hero: { cx: 60, cy: 53, scale: 1.48 }, stone: { top: 18, bottom: 90, cap: 26 } }
    : { plate: { s: 0.96, y: 58 }, band: 8.5, hero: { cx: 60, cy: 58, scale: 1.62 }, stone: { top: 16, bottom: 100, cap: 30 } };
}

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
    [17, 30, 6.5],
    [104, 24, 5],
  ],
  4: [
    [17, 30, 6.5],
    [104, 24, 5],
    [108, 74, 4.5],
    [12, 78, 3.6],
  ],
};

// ─────────────────────────────────────────────────────────────── the plate

/**
 * The plate: the family's shape with its thickness under it, a smooth band of
 * the tier's metal round it, and the family's pale tint inside, lit from
 * above and brightest behind the picture.
 */
function plateOf(dr: Drawing, family: BadgeFamily, lay: Layout, m: Metal, detail: Detail, locked: boolean): string {
  const outline = shapePath(family, lay.plate);
  const face = shapePath(family, lay.plate, lay.band);
  const [top, foot] = spanOf(lay);
  const p = PLATE[family];
  const thick = detail === 0 ? 3.4 : 4.4;
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
    `<path d="${outline}" transform="translate(0 ${n2(thick)})" fill="${m.deep}"/>`,
    `<path d="${outline}" fill="url(#${band})" stroke="${m.deep}" stroke-width="${n2(detail === 0 ? 1.4 : 2.2)}" stroke-linejoin="round"/>`,
    `<path d="${face}" fill="url(#${tint})"/>`,
  ];
  if (detail < 2) {
    // brightest behind the picture, and a night of stars on a secret's plate
    const clip = dr.clip(face);
    const light = dr.id('w');
    const [cx, cy] = [lay.hero.cx, lay.hero.cy + 4];
    const r = 46 * lay.plate.s;
    dr.def(radialAt(light, [[0, '#ffffff', family === 'secret' ? 0.32 : 0.85], [1, '#ffffff', 0]], cx, cy, r));
    out.push(`<g clip-path="url(#${clip})"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${light})"/>${family === 'secret' ? stars(family + m.mid) : ''}</g>`);
  }
  // the inner edge of the band, where the plate sits in it
  out.push(`<path d="${face}" fill="none" stroke="${m.dark}" stroke-opacity="0.7" stroke-width="${n2(detail === 0 ? 1.2 : 1.8)}" stroke-linejoin="round"/>`);
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

// ─────────────────────────────────────────────────────────────── the picture

function heroOf(dr: Drawing, key: BadgeKey, family: BadgeFamily, lay: Layout, detail: Detail, state: BadgeState): string {
  const rankTier = rankTierOf(key);
  if (rankTier && state !== 'secret') {
    // the rank's own cut stone, set in its bezel
    const crest: Crest = { ...rankCrest(rankTier), wings: 0, base: 0, crown: 'none', beads: true, glow: 0, rays: false };
    if (state === 'locked') return `<g opacity="0.6">${crestSilhouette(crest, detail, lay.stone, STONE.light, STONE.dark)}</g>`;
    return crestMarkup(dr, crest, { detail, box: lay.stone }).markup;
  }
  const draw = ICONS[key];
  const parts = state === 'secret' || !draw ? QUESTION : draw();
  const edge = PLATE[state === 'secret' ? 'secret' : family].deep;
  const { cx, cy, scale } = lay.hero;
  const painted = paintHero(parts, {
    dr,
    colours: state === 'secret' ? PLAIN : (HERO[key] ?? PLAIN),
    edge,
    outline: (detail === 0 ? 2.6 : 3.6) / scale,
    small: detail > 0,
    locked: state === 'locked',
    shadow: detail === 0 && state !== 'locked' ? 2.6 / scale : 0,
  });
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(scale)})">${painted}</g>`;
}

// ─────────────────────────────────────────────────────────────── the tier

/** The number under a large tiered badge: the milestone this tier was earned at, or a star for "all of it". */
function milestoneMark(dr: Drawing, milestone: number | 'all', style: NumeralStyle): string {
  const foot = 110;
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
  const h = Math.min(21, 84 / numeralWidth(text));
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

  if (!locked && detail === 0) {
    if (AURA[look] > 0) dr.add(halo(dr, 60, 58, 58, m.light, AURA[look], 0.3));
    if (look === 4 && state === 'earned') dr.add(rays(dr, m.light));
  }
  dr.add(plateOf(dr, plateFamily, lay, m, detail, locked));
  dr.add(heroOf(dr, key, family, lay, detail, state));

  if (numbered) {
    const style: NumeralStyle = locked ? { edge: STONE.mid, top: STONE.hi, bottom: STONE.light } : { edge: m.deep, top: '#ffffff', bottom: mix('#ffffff', m.light, 0.85) };
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
  const clip = dr.clip(shapePath(family, layoutOf(detail, badgeArt(key).tiers > 1).plate, 0.6));
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
