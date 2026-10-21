/**
 * Badge medallions (contract 4, B3).
 *
 * A medallion is the family's silhouette made as an enamel pin: a smooth rim
 * in the tier's metal, enamel in the family's colour glowing softly from the
 * middle, and the badge's glyph — the brightest thing on it — over the glow.
 * Colour is never the only signal of the tier: a slim capsule under a tiered
 * badge holds four round pips, as many lit as the tier, and the rim grows as
 * the tier climbs — Sifir a plain rose-copper rim, Zîv silver set with a ring
 * of beads, Zêr gold with the beads and a soft glow, and Firûze turquoise
 * with a kilim band round its rim and a stronger glow. The ranked family's
 * tier badges carry the rank's own scene, so a badge and an emblem show the
 * same place.
 *
 * Small sizes get their own drawing rather than a shrunken one: under 56
 * pixels the body and glyph grow, the glyph's finest lines go, the rim's
 * kilim becomes beads and the pips grow to be counted; under 32 the beads go.
 *
 * States: `earned` is the full medallion; `locked` (not yet earned) is the same
 * silhouette and glyph as a quiet grey outline that reads on the dark and the
 * light theme alike; `secret` is a secret badge not yet found — a midnight
 * gem with a "?" in it, the same for every secret.
 */
import { stations } from './geometry.js';
import { ICONS, QUESTION } from './icons.js';
import { paintIcon } from './iconpaint.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, RANK_BADGE, RANK_TIERS, badgeArt, isBadgeKey } from './keys.js';
import type { Field, Metal } from './palette.js';
import { FIELD, SHADOW, STONE, TIER_METAL } from './palette.js';
import { capsule, dotsAt, gloss, halo, kilimAlong, lipMetal, pinShadow, pips, rimMetal } from './paint.js';
import { detailFor } from './ranks.js';
import { sceneAt } from './scenes.js';
import type { Placement } from './shapes.js';
import { SHAPES, shapePath, shapePoints } from './shapes.js';
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
   * badge (1) shows no pips and wears its family's single-badge look.
   */
  tiers?: number;
  /** the accessible label; defaults to "Agir · Zêr" */
  title?: string;
  idPrefix?: string;
}

/** Under this many pixels a badge is drawn in its small version. */
export const SMALL_BADGE = 56;
/** Under this many pixels a badge keeps only its shape, rim, glyph and pips. */
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

interface Look {
  /** 1–4: how grand the badge is */
  look: BadgeTier;
  /** the rim's metal, and the glyph's */
  metal: Metal;
  field: Field;
}

function lookFor(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): Look {
  const family = badgeArt(key).family;
  if (state === 'secret') return { look: 2, metal: SHADOW, field: FIELD.secret };
  const look: BadgeTier = tiers > 1 ? tier : SINGLE_LOOK[family];
  return { look, metal: TIER_METAL[look], field: FIELD[family] };
}

/**
 * Where a badge's body sits and how much of its canvas it fills: large badges
 * leave room round the body for their light; small ones fill the canvas, and
 * a small tiered one leaves the bottom for a capsule big enough to count.
 */
function layoutOf(small: boolean, tiered: boolean): Placement {
  if (!small) return { s: 0.84, y: 53 };
  return tiered ? { s: 0.84, y: 48 } : { s: 0.97, y: 59 };
}

/** Where the glyph sits and how big, for this family and layout. */
function glyphPlace(family: BadgeFamily, lay: Placement, small: boolean): { cx: number; cy: number; scale: number } {
  const shape = SHAPES[family];
  return { cx: 60 + (shape.icon[0] - 60) * lay.s, cy: lay.y + (shape.icon[1] - 56) * lay.s, scale: shape.scale * lay.s * (small ? 1.12 : 1) };
}

/** The rim's width, by look: a grander badge is set in a heavier rim. */
const RIM: Record<BadgeTier, number> = { 1: 6, 2: 6.5, 3: 6.5, 4: 8 };
/** How strongly the badge glows, by look. */
const GLOW: Record<BadgeTier, number> = { 1: 0, 2: 0, 3: 0.34, 4: 0.5 };

/** The tier capsule: four round pips, as many lit as the tier. */
function tierCapsule(dr: Drawing, tier: number, count: number, m: Metal, small: boolean, locked: boolean): string {
  const cy = small ? 101 : 103;
  const w = small ? 88 : 48;
  const h = small ? 30 : 15;
  const pill = capsule(60, cy, w, h);
  const r = small ? 6.6 : 3.1;
  const gap = small ? 6.4 : 3.6;
  if (locked) {
    return (
      `<path d="${pill}" fill="${STONE.mid}" fill-opacity="0.12" stroke="${STONE.mid}" stroke-width="${small ? 2.4 : 1.4}"/>` +
      pips(dr, STONE, count, 0, 60, cy, r, gap)
    );
  }
  const ground = dr.id('q');
  dr.def(linearAt(ground, [[0, mix(m.deep, m.dark, 0.4)], [1, m.deep]], 0, cy - h / 2, 0, cy + h / 2));
  return (
    `<path d="${pill}" transform="translate(0 ${small ? 2.4 : 1.4})" fill="${m.deep}" fill-opacity="0.5"/>` +
    `<path d="${pill}" fill="url(#${ground})" stroke="url(#${rimMetal(dr, m, 60, cy, w / 2)})" stroke-width="${small ? 3 : 1.6}"/>` +
    pips(dr, m, count, tier, 60, cy, r, gap)
  );
}

function titleOf(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): string {
  const name = badgeArt(key).name;
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
  const tiers = opts.tiers ?? badgeArt(key).tiers;
  if (!Number.isInteger(tiers) || tiers < 1 || tiers > 4) throw new RangeError(`art: tiers must be 1–4, got ${String(tiers)}`);
  const size = checkSize(opts.size, 96);
  const detail = detailFor(size, SMALL_BADGE, TINY_BADGE);
  const small = detail > 0;
  const family = badgeArt(key).family;
  const shownTier = (tiers > 1 ? Math.min(tier, tiers) : 1) as BadgeTier;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'badge', key, shownTier, state, tiers, detail));
  const title = opts.title ?? titleOf(key, shownTier, tiers, state);
  const lay = layoutOf(small, tiers > 1);
  const outline = shapePath(family, lay);
  const at = glyphPlace(family, lay, small);

  if (state === 'locked') {
    const g = STONE.mid;
    dr.add(`<path d="${outline}" fill="${g}" fill-opacity="0.1" stroke="${g}" stroke-width="${small ? 3 : 2}" stroke-linejoin="round"/>`);
    dr.add(glyphGroup(dr, key, at, small, { metal: STONE, field: FIELD[family], locked: true }));
    if (tiers > 1) dr.add(tierCapsule(dr, 0, tiers, STONE, small, true));
    return dr.svg(size, title);
  }

  const lk = lookFor(key, shownTier, tiers, state);
  const m = lk.metal;
  const bottom = lay.y + 56 * lay.s;

  // light behind: a soft glow for Zêr and Firûze, kept inside the square
  if (GLOW[lk.look] > 0) dr.add(halo(dr, 60, 60, 59, m.light, GLOW[lk.look] * (small ? 0.75 : 1), 0.5));
  dr.add(pinShadow(dr, outline, m.deep, 60, bottom - 2, 92 * lay.s, small ? 3 : 2.2));

  // the rim: smooth metal, edged in its own darkest tone, and what is set into it
  const rim = small ? RIM[lk.look] + 1.5 : RIM[lk.look];
  dr.add(`<path d="${outline}" fill="url(#${rimMetal(dr, m, 60, lay.y, 50)})" stroke="${m.deep}" stroke-width="${n2(detail === 2 ? 3 : small ? 2.2 : 1.2)}" stroke-linejoin="round"/>`);
  if (lk.look >= 2 && detail < 2 && state !== 'secret') {
    const mid = shapePoints(family, lay, rim / 2);
    if (lk.look === 4 && detail === 0) dr.add(kilimAlong(stations(mid, 22), rim * 0.6, m.hi, m.dark));
    else dr.add(`<path d="${dotsAt(stations(mid, detail === 0 ? 26 : 14, 0.5).map((s) => s.p), rim * (detail === 0 ? 0.16 : 0.2))}" fill="${m.hi}"/>`);
  }

  // the enamel: the family's colour glowing from behind the glyph, or the rank's own scene
  const fieldPath = shapePath(family, lay, rim);
  const clip = dr.clip(fieldPath);
  const rankTier = rankTierOf(key);
  const f = lk.field;
  let enamel: string;
  if (rankTier && state === 'earned') {
    enamel = sceneAt(dr, rankTier, at.cx, at.cy + 2 * lay.s, 44 * lay.s, detail);
  } else {
    const ground = dr.id('e');
    dr.def(
      radialAt(
        ground,
        [
          [0, f.glow],
          [0.55, f.mid],
          [1, f.deep],
        ],
        at.cx,
        at.cy - 6,
        52 * lay.s,
      ),
    );
    enamel = `<path d="${fieldPath}" fill="url(#${ground})"/>` + (state === 'secret' ? secretStars(key) : '');
  }
  dr.add(`<g clip-path="url(#${clip})">${enamel}${gloss(dr, 60, lay.y, 46 * lay.s, small ? 0.18 : 0.24)}</g>`);
  dr.add(`<path d="${fieldPath}" fill="none" stroke="url(#${lipMetal(dr, m, 60, lay.y, 46 * lay.s)})" stroke-width="${n2(small ? 2.4 : 1.6)}" stroke-linejoin="round"/>`);
  if (!(rankTier && state === 'earned')) dr.add(glyphGroup(dr, key, at, small, { metal: m, field: f, locked: false, secret: state === 'secret' }));

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
  const draw = ICONS[rankTier ? 'hilkiser' : key];
  const parts = p.secret || !draw ? QUESTION : draw();
  const glow = p.locked ? '' : halo(dr, at.cx, at.cy, 24 * at.scale, mix(p.field.glow, '#ffffff', 0.3), 0.45);
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
 * The glint on its own: a soft band of light, clipped to the badge's body, to
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
  const small = size < SMALL_BADGE;
  const family = badgeArt(key).family;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'glint', family, n2(phase), small));
  const clip = dr.clip(shapePath(family, layoutOf(small, badgeArt(key).tiers > 1), 0.6));
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
