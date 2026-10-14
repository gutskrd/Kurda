/**
 * Badge medallions (contract 4, B3).
 *
 * A medallion is the family's silhouette, cut like a stone: a faceted rim in
 * the tier's metal, a field in the family's colour glowing from the middle,
 * and the badge's glyph — the brightest thing on it — floating over the glow.
 * Colour is never the only signal of the tier: a slim capsule under a tiered
 * badge holds four chevrons, as many lit as the tier, and the cut grows finer
 * and the light stronger as the tier climbs — Sifir a plain rose-copper cut,
 * Zîv a finer silver one with a glow, Zêr gold with a burst of rays, and
 * Firûze electric turquoise with the long rays, a kilim jewel set at its crown
 * and a spark.
 *
 * Small sizes get their own drawing rather than a shrunken one: under 56
 * pixels the rays go, the body and glyph grow, the glyph's finest lines go and
 * its cuts and the chevrons thicken.
 *
 * States: `earned` is the full medallion; `locked` (not yet earned) is the same
 * silhouette and glyph as a quiet grey outline that reads on the dark and the
 * light theme alike; `secret` is a secret badge not yet found — a midnight
 * gem with a "?" glowing in it, the same for every secret.
 */
import { offset, place } from './geometry.js';
import { ICONS, QUESTION } from './icons.js';
import { paintIcon } from './iconpaint.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, BADGES, RANK_BADGE, RANK_TIERS, isBadgeKey } from './keys.js';
import type { Field, Metal } from './palette.js';
import { FIELD, RANK_METAL, SHADOW, STONE, TIER_METAL } from './palette.js';
import { capsule, chevrons, edge, facetBand, halo, kilimGem, rays, sparkle } from './paint.js';
import { rankField, rankGlyph } from './ranks.js';
import type { Pt } from './svg.js';
import { SHAPES } from './shapes.js';
import { Drawing, checkSize, linearAt, mix, n, n2, polyPath, prefixFor, radialAt, seeded } from './svg.js';

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
   * badge (1) shows no chevrons and wears its family's single-badge look.
   */
  tiers?: number;
  /** the accessible label; defaults to "Agir · Zêr" */
  title?: string;
  idPrefix?: string;
}

/** Under this many pixels a badge is drawn in its small version. */
export const SMALL_BADGE = 56;

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

interface Look {
  /** 1–4: how grand the badge is */
  look: BadgeTier;
  /** the rim's metal */
  metal: Metal;
  /** the glyph's metal */
  glyph: Metal;
  field: Field;
}

function lookFor(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): Look {
  const family = BADGES[key].family;
  if (state === 'secret') return { look: 2, metal: SHADOW, glyph: SHADOW, field: FIELD.secret };
  const look: BadgeTier = tiers > 1 ? tier : SINGLE_LOOK[family];
  const metal = tiers > 1 ? TIER_METAL[tier] : TIER_METAL[look];
  const rankTier = rankTierOf(key);
  if (rankTier) return { look, metal, glyph: RANK_METAL[rankTier], field: rankField(rankTier) };
  return { look, metal, glyph: metal, field: FIELD[family] };
}

/** How much of its canvas a badge's body fills, leaving room for its light. */
const BODY = { large: 0.84, small: 0.97 };
/** Where the body's centre sits: a little high, leaving the bottom for the tier capsule. */
const BODY_Y = { large: 54, small: 55 };

/** The family's silhouette, placed and sized for a large or small badge. */
function bodyOutline(family: BadgeFamily, small: boolean): Pt[] {
  return place(
    SHAPES[family].outline.map(([x, y]) => [x - 60, y - 56] as Pt),
    { x: 60, y: small ? BODY_Y.small : BODY_Y.large, s: small ? BODY.small : BODY.large },
  );
}

/** Where the glyph sits and how big, for this family and size. */
function glyphPlace(family: BadgeFamily, small: boolean): { cx: number; cy: number; scale: number } {
  const shape = SHAPES[family];
  const s = small ? BODY.small : BODY.large;
  const y = small ? BODY_Y.small : BODY_Y.large;
  return { cx: 60 + (shape.icon[0] - 60) * s, cy: y + (shape.icon[1] - 56) * s, scale: shape.scale * s * (small ? 1.12 : 1) };
}

/** The rim's width and how finely it is cut, by look. */
const RIM: Record<BadgeTier, number> = { 1: 5.5, 2: 6, 3: 6.5, 4: 7 };
const CUT: Record<BadgeTier, number> = { 1: 3, 2: 4, 3: 5, 4: 7 };
/** How strongly the badge glows, by look. */
const GLOW: Record<BadgeTier, number> = { 1: 0, 2: 0.22, 3: 0.4, 4: 0.6 };

/** The tier capsule: four chevrons, as many lit as the tier. */
function tierCapsule(dr: Drawing, tier: number, count: number, m: Metal, small: boolean, locked: boolean): string {
  const cy = small ? 106 : 104;
  const w = small ? 62 : 46;
  const h = small ? 19 : 14;
  const pill = capsule(60, cy, w, h);
  const [on, off] = chevrons(count, locked ? 0 : tier, 60, cy + 0.2, small ? 10 : 7.4, small ? 9.5 : 6.6, small ? 2.6 : 2.2, small ? 3.6 : 2.5);
  if (locked) {
    return (
      `<path d="${pill}" fill="${STONE.mid}" fill-opacity="0.12" stroke="${STONE.mid}" stroke-width="${small ? 2.2 : 1.4}"/>` +
      `<path d="${off}" fill="${STONE.mid}" fill-opacity="0.55"/>`
    );
  }
  const ground = dr.id('q');
  dr.def(linearAt(ground, [[0, mix(m.deep, m.dark, 0.35)], [1, m.deep]], 0, cy - h / 2, 0, cy + h / 2));
  const lit = dr.id('q');
  dr.def(linearAt(lit, [[0, m.hi], [1, m.light]], 0, cy - h / 2, 0, cy + h / 2));
  return (
    `<path d="${pill}" fill="url(#${ground})" stroke="${m.dark}" stroke-width="${small ? 1.6 : 1.1}"/>` +
    (on ? `<path d="${on}" fill="url(#${lit})"/>` : '') +
    (off ? `<path d="${off}" fill="${m.light}" fill-opacity="0.22"/>` : '')
  );
}

function titleOf(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): string {
  const name = BADGES[key].name;
  if (state === 'secret') return 'Secret badge';
  if (state === 'locked') return `${name} · not earned yet`;
  return tiers > 1 ? `${name} · ${BADGE_TIER_NAMES[tier]}` : name;
}

/** A badge medallion as an SVG string. */
export function badgeSvg(opts: BadgeOptions): string {
  const { key } = opts;
  if (!isBadgeKey(key)) throw new RangeError(`art: no badge art for key ${String(key)}`);
  const tier = opts.tier ?? 1;
  if (![1, 2, 3, 4].includes(tier)) throw new RangeError(`art: badge tier must be 1–4, got ${String(tier)}`);
  const state = opts.state ?? 'earned';
  if (!['earned', 'locked', 'secret'].includes(state)) throw new RangeError(`art: unknown badge state ${String(state)}`);
  const tiers = opts.tiers ?? BADGES[key].tiers;
  if (!Number.isInteger(tiers) || tiers < 1 || tiers > 4) throw new RangeError(`art: tiers must be 1–4, got ${String(tiers)}`);
  const size = checkSize(opts.size, 96);
  const small = size < SMALL_BADGE;
  const family = BADGES[key].family;
  const shownTier = (tiers > 1 ? Math.min(tier, tiers) : 1) as BadgeTier;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'badge', key, shownTier, state, tiers, small));
  const title = opts.title ?? titleOf(key, shownTier, tiers, state);
  const outline = bodyOutline(family, small);
  const outlinePath = polyPath(outline);
  const at = glyphPlace(family, small);

  if (state === 'locked') {
    const g = STONE.mid;
    dr.add(`<path d="${outlinePath}" fill="${g}" fill-opacity="0.1" stroke="${g}" stroke-width="${small ? 3 : 2}" stroke-linejoin="round"/>`);
    dr.add(glyphGroup(dr, key, at, small, { metal: STONE, field: FIELD[family], locked: true }));
    if (tiers > 1) dr.add(tierCapsule(dr, 0, tiers, STONE, small, true));
    return dr.svg(size, title);
  }

  const lk = lookFor(key, shownTier, tiers, state);
  const m = lk.metal;
  const top = Math.min(...outline.map((p) => p[1]));
  const bodyY = small ? BODY_Y.small : BODY_Y.large;

  // light behind: a halo, and for Zêr and Firûze a burst of rays
  if (!small && GLOW[lk.look] > 0) dr.add(halo(dr, 60, bodyY, 60, m.mid, GLOW[lk.look], 0.45));
  if (!small && lk.look >= 3) dr.add(rays(dr, 60, bodyY, 40, lk.look === 4 ? 60 : 55, lk.look === 4 ? 16 : 12, m.light, lk.look === 4 ? 0.95 : 0.75));

  // the cut rim
  const rim = small ? RIM[lk.look] + 1.5 : RIM[lk.look];
  const inner = offset(outline, -rim);
  dr.add(facetBand(outline, inner, m, CUT[lk.look]));
  dr.add(edge(outlinePath, m.deep, small ? 1.6 : 1.1, 0.9));

  // the field, glowing from behind the glyph
  const fieldPath = polyPath(offset(outline, -rim - 0.2));
  const f = lk.field;
  const ground = dr.id('e');
  dr.def(
    radialAt(
      ground,
      [
        [0, f.glow],
        [0.5, f.mid],
        [1, f.deep],
      ],
      at.cx,
      at.cy - 4,
      48 * (small ? BODY.small : BODY.large),
    ),
  );
  dr.add(`<path d="${polyPath(inner)}" fill="${m.deep}"/>`);
  dr.add(`<path d="${fieldPath}" fill="url(#${ground})"/>`);
  const clip = dr.clip(fieldPath);
  // the field is cut too: its upper-left half catches a little more light, its lower-right edge a rim light
  const wedge = `M${n(at.cx + 90)},${n(at.cy - 90)}L${n(at.cx - 90)},${n(at.cy + 90)}L${n(at.cx - 90)},${n(at.cy - 90)}Z`;
  const rimLight = dr.id('l');
  dr.def(
    linearAt(
      rimLight,
      [
        [0, m.hi, 0],
        [0.55, m.hi, 0],
        [1, m.hi, 0.75],
      ],
      30,
      20,
      90,
      100,
    ),
  );
  dr.add(
    `<g clip-path="url(#${clip})"><path d="${wedge}" fill="#ffffff" fill-opacity="0.07"/>` +
      (state === 'secret' ? secretStars(key) : '') +
      `<path d="${fieldPath}" fill="none" stroke="url(#${rimLight})" stroke-width="${small ? 2.4 : 1.8}"/></g>`,
  );
  dr.add(glyphGroup(dr, key, at, small, { metal: lk.glyph, field: f, locked: false, secret: state === 'secret' }));

  // Firûze's crown: a kilim jewel set at the top of the rim; Zêr and Firûze a spark
  if (lk.look === 4) dr.add(kilimGem(dr, 60, top + rim / 2, small ? 13 : 10, small ? 15 : 12, m));
  if (lk.look >= 3 && !small) dr.add(`<path d="${sparkle(92, top + 8, lk.look === 4 ? 7.5 : 5.5)}" fill="#ffffff"/>`);
  if (tiers > 1) dr.add(tierCapsule(dr, shownTier, tiers, m, small, false));
  return dr.svg(size, title);
}

function secretStars(key: string): string {
  const rnd = seeded(`secret-${key}`);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(`<circle cx="${n(24 + rnd() * 72)}" cy="${n(20 + rnd() * 70)}" r="${n2(0.4 + rnd() * 0.7)}" fill="#ffffff" fill-opacity="${n2(0.3 + rnd() * 0.5)}"/>`);
  }
  return out.join('');
}

function glyphGroup(
  dr: Drawing,
  key: BadgeKey,
  at: { cx: number; cy: number; scale: number },
  small: boolean,
  p: { metal: Metal; field: Field; locked: boolean; secret?: boolean },
): string {
  const rankTier = rankTierOf(key);
  if (rankTier && !p.locked && !p.secret) return rankGlyph(dr, rankTier, at.cx, at.cy, at.scale, small, p.field);
  const draw = ICONS[rankTier ? 'hilkiser' : key];
  const parts = p.secret || !draw ? QUESTION : draw();
  const glow = p.locked ? '' : halo(dr, at.cx, at.cy, 24 * at.scale, mix(p.field.glow, '#ffffff', 0.3), 0.5);
  return (
    glow +
    `<g transform="translate(${n(at.cx)} ${n(at.cy)}) scale(${n2(at.scale)})">${paintIcon(parts, { dr, metal: p.metal, field: p.field, small, locked: p.locked })}</g>`
  );
}

/**
 * Whether a badge has the glint (research §5.2): Zêr and Firûze, and the single
 * badges that wear their looks. The apps play it once when the badge is earned
 * and again on hover or tap — never under reduced motion.
 */
export function badgeShines(key: BadgeKey, tier: BadgeTier = 1, tiers?: number): boolean {
  if (!isBadgeKey(key)) return false;
  const count = tiers ?? BADGES[key].tiers;
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
 * The glint on its own: a band of light, clipped to the badge's body, to lay
 * over the badge at the same size. Decorative — its title says so, and the
 * apps hide it from screen readers.
 */
export function badgeShineSvg(opts: BadgeShineOptions): string {
  const { key } = opts;
  if (!isBadgeKey(key)) throw new RangeError(`art: no badge art for key ${String(key)}`);
  const phase = opts.phase ?? 0.5;
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) throw new RangeError(`art: phase must be 0–1, got ${String(phase)}`);
  const size = checkSize(opts.size, 96);
  const small = size < SMALL_BADGE;
  const family = BADGES[key].family;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'glint', family, n2(phase), small));
  const clip = dr.clip(polyPath(offset(bodyOutline(family, small), -0.6)));
  const band = dr.id('g');
  dr.def(
    linearAt(
      band,
      [
        [0, '#ffffff', 0],
        [0.5, '#ffffff', 0.55],
        [1, '#ffffff', 0],
      ],
      -12,
      0,
      12,
      0,
    ),
  );
  const x = -34 + phase * 188;
  dr.add(
    `<g clip-path="url(#${clip})"><g transform="translate(${n(x)} 60) rotate(28)">` +
      `<rect x="-12" y="-90" width="24" height="180" fill="url(#${band})"/>` +
      `<rect x="15" y="-90" width="3" height="180" fill="#ffffff" fill-opacity="0.4"/></g></g>`,
  );
  return dr.svg(size, 'Shine');
}
