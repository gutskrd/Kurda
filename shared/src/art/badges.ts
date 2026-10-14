/**
 * Badge medallions (contract 4, B3).
 *
 * A medallion is the family's silhouette in the tier's metal, an enamel field
 * in the family's colour, the badge's icon raised on it, and — for a badge
 * with tiers — a plaque of four diamond pips, as many filled as the tier.
 * Colour is never the only signal: the pips count the tier, and the border
 * changes with it too — plain for Sifir, a beaded line for Zîv, a woven chain
 * of diamonds for Zêr, and for Firûze a turquoise rim inlaid with a gold
 * zigzag and set in gold like a stone, with a bezel and eight prongs.
 *
 * Small sizes get their own drawing rather than a shrunken one: under 56
 * pixels the woven border becomes a plain band, the icon grows, its outline
 * thickens and its finest lines go, the way a game's badges have a small icon
 * that is drawn for the size it is shown at.
 *
 * States: `earned` is the full medallion; `locked` (not yet earned) is the
 * same silhouette and icon in a grey outline, which reads on the dark and the
 * light theme alike; `secret` is a secret badge not yet found — the shape,
 * dim, with a "?" where the icon will be.
 */
import { offset, perimeter, stations } from './geometry.js';
import type { Part } from './icons.js';
import { ICONS, QUESTION } from './icons.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, BADGES, RANK_BADGE, RANK_TIERS, isBadgeKey } from './keys.js';
import type { Metal } from './palette.js';
import { ACCENT, ENAMEL, GOLD, INK, RANK_METAL, SHADOW, STONE, TIER_METAL } from './palette.js';
import { OUTLINE, band, bevel, diamondAt, dropShadow, inked, metalAcross, metalBox, metalBoxDark } from './paint.js';
import { rankWindow } from './ranks.js';
import type { Pt } from './svg.js';
import { SHAPES } from './shapes.js';
import { Drawing, checkSize, linePath, linearAt, linearBox, n, n2, polyPath, prefixFor, radialAt, seeded } from './svg.js';

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

/**
 * The look a single (tierless) badge wears. Events and secrets are rare and
 * dated or hidden, so they wear the woven borders; the rest wear Zîv or Zêr.
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
  /** 1–4: how grand the border is */
  look: BadgeTier;
  metal: Metal;
  /** the woven border's dyes, for looks 3 and 4 */
  kilim?: { ground: string; motif: Metal; dot: string };
  enamel: { light: string; deep: string };
}

function lookFor(key: BadgeKey, tier: BadgeTier, tiers: number, state: BadgeState): Look {
  const family = BADGES[key].family;
  if (state === 'secret') return { look: 2, metal: SHADOW, enamel: ENAMEL.secret };
  const look: BadgeTier = tiers > 1 ? tier : SINGLE_LOOK[family];
  const rankTier = rankTierOf(key);
  const metal = rankTier ? RANK_METAL[rankTier] : tiers > 1 ? TIER_METAL[tier] : TIER_METAL[look];
  const kilim =
    look === 4
      ? { ground: rankTier ? metal.deep : '#0b4d47', motif: GOLD, dot: '#c2263f' }
      : look === 3
        ? { ground: rankTier ? metal.deep : '#6b4510', motif: rankTier ? metal : GOLD, dot: '#c2263f' }
        : undefined;
  return { look, metal, kilim, enamel: ENAMEL[family] };
}

const RIM: Record<BadgeTier, number> = { 1: 6.5, 2: 7.5, 3: 11, 4: 12 };

/**
 * Firûze is set like a stone: a gold bezel all round and eight gold prongs,
 * one at the top. Drawn before the medallion, which covers their inner half.
 */
function setting(dr: Drawing, outline: readonly Pt[], small: boolean): string {
  const gold = `url(#${metalAcross(dr, GOLD, 20, 4, 100, 112)})`;
  const ring = offset(outline, small ? 4.2 : 3.4);
  const prongs = stations(offset(outline, small ? 3.6 : 3.4), 8).map((s) =>
    diamondAt(s.p[0], s.p[1], small ? 12 : 10.5, small ? 14 : 13.5, s.angle),
  );
  return inked(prongs.join(''), gold, small ? 2.6 : 1.8) + inked(polyPath(ring), gold, small ? 2.6 : 1.8);
}

/** The woven border: a chain of diamonds (Zêr) or a zigzag (Firûze), with woven edges. */
function kilimBand(dr: Drawing, outline: readonly Pt[], rim: number, lk: Look, small: boolean): string {
  const k = lk.kilim;
  if (!k) return '';
  const outer = offset(outline, -1.9);
  const inner = offset(outline, -(rim - 1.4));
  const mid = offset(outline, -(rim + 0.5) / 2);
  const half = (rim - 3.3) / 2;
  const out: string[] = [`<path d="${band(outer, inner)}" fill="${k.ground}" fill-rule="evenodd"/>`];
  if (small) {
    out.push(`<path d="${polyPath(mid)}" fill="none" stroke="${k.motif.light}" stroke-width="1.6"/>`);
    return out.join('');
  }
  out.push(`<path d="${polyPath(offset(outline, -2.6))}${polyPath(offset(outline, -(rim - 2.1)))}" fill="none" stroke="${k.motif.mid}" stroke-width="0.7"/>`);
  const len = perimeter(mid);
  if (lk.look === 3) {
    const count = Math.max(8, Math.round(len / 7.2 / 2) * 2);
    const big: string[] = [];
    const dots: string[] = [];
    const small2: string[] = [];
    stations(mid, count).forEach((s, i) => {
      if (i % 2 === 0) {
        big.push(diamondAt(s.p[0], s.p[1], 5.8, half * 2 - 0.4, s.angle));
        dots.push(diamondAt(s.p[0], s.p[1], 1.8, 1.8, s.angle));
      } else {
        small2.push(diamondAt(s.p[0], s.p[1], 2.2, 2.2, s.angle));
      }
    });
    out.push(`<path d="${big.join('')}" fill="${k.motif.light}" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/>`);
    out.push(`<path d="${dots.join('')}" fill="${k.dot}"/>`);
    out.push(`<path d="${small2.join('')}" fill="${k.motif.hi}"/>`);
  } else {
    const count = Math.max(16, Math.round(len / 4.4 / 2) * 2);
    const zig: Pt[] = [];
    const dots: string[] = [];
    stations(mid, count).forEach((s, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const o = (half - 0.6) * side;
      zig.push([s.p[0] + s.inward[0] * o, s.p[1] + s.inward[1] * o]);
      const d = -(half - 2.2) * side;
      dots.push(diamondAt(s.p[0] + s.inward[0] * d, s.p[1] + s.inward[1] * d, 1.7, 1.7, s.angle));
    });
    out.push(`<path d="${linePath([...zig, zig[0] as Pt])}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-opacity="0.55"/>`);
    out.push(`<path d="${linePath([...zig, zig[0] as Pt])}" fill="none" stroke="${k.motif.light}" stroke-width="1.4" stroke-linejoin="round"/>`);
    out.push(`<path d="${dots.join('')}" fill="${k.dot}"/>`);
  }
  return out.join('');
}

/** Zîv's beaded line: a row of small beads around the middle of the rim. */
function beads(outline: readonly Pt[], rim: number, m: Metal): string {
  const mid = offset(outline, -rim / 2);
  const count = Math.max(10, Math.round(perimeter(mid) / 5));
  const out = stations(mid, count).map((s) => `M${n(s.p[0] - 1.05)},${n(s.p[1])}a1.05,1.05 0 1 0 2.1,0a1.05,1.05 0 1 0 -2.1,0Z`);
  return `<path d="${out.join('')}" fill="${m.hi}" stroke="${m.dark}" stroke-width="0.5"/>`;
}

interface IconPaint {
  dr: Drawing;
  metal: Metal;
  small: boolean;
  locked: boolean;
}

/** The icon's parts, painted for this badge's metal and size. */
function paintIcon(parts: readonly Part[], p: IconPaint): string {
  const { dr, metal, small, locked } = p;
  const line = small ? 2.9 : 2.2;
  const shown = parts.filter((part) => !(small && 'fine' in part && part.fine));
  const tf = (part: Part): string => (part.tf ? ` transform="${part.tf}"` : '');

  if (locked) {
    const g = STONE.mid;
    return shown
      .filter((part) => part.k !== 'h')
      .map((part) => {
        switch (part.k) {
          case 'k':
            return `<path d="${part.d}" fill="${g}"${tf(part)}/>`;
          case 'd':
            return `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
          case 'l':
            return `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2((part.w ?? 3) + (small ? 1 : 0.4))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
          default:
            return `<path d="${part.d}" fill="${g}" fill-opacity="0.16" stroke="${g}" stroke-width="${n2(line * 0.85)}" stroke-linejoin="round"${tf(part)}/>`;
        }
      })
      .join('');
  }

  const light = metalBox(dr, metal);
  const dark = metalBoxDark(dr, metal);
  const snow = dr.id('n');
  dr.def(
    linearBox(snow, [
      [0, '#ffffff'],
      [1, '#d9e3ee'],
    ]),
  );
  const accents = new Map<string, string>();
  const accent = (name: keyof typeof ACCENT): string => {
    let id = accents.get(name);
    if (!id) {
      id = dr.id('a');
      const [a, b] = ACCENT[name];
      dr.def(
        linearBox(id, [
          [0, a],
          [1, b],
        ]),
      );
      accents.set(name, id);
    }
    return `url(#${id})`;
  };

  // the shadow every raised part casts on the enamel
  const shadow = shown
    .filter((part) => part.k === 'f' || part.k === 'a' || part.k === 'w' || part.k === 'c' || part.k === 'l')
    .map((part) =>
      part.k === 'l'
        ? `<path d="${part.d}" fill="none" stroke="#000000" stroke-width="${n2((part.w ?? 3) + line + 0.4)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
        : `<path d="${part.d}" fill="#000000" stroke="#000000" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`,
    )
    .join('');

  const body = shown
    .map((part) => {
      switch (part.k) {
        case 'f':
          return `<path d="${part.d}" fill="url(#${light})" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'a':
          return `<path d="${part.d}" fill="url(#${dark})" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'w':
          return `<path d="${part.d}" fill="url(#${snow})" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'c':
          return `<path d="${part.d}" fill="${accent(part.c)}" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'k':
          return `<path d="${part.d}" fill="${INK}"${tf(part)}/>`;
        case 'd':
          return `<path d="${part.d}" fill="none" stroke="${INK}" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
        case 'l': {
          const w = part.w ?? 3;
          const colour = part.c ? ACCENT[part.c][0] : metal.light;
          return (
            `<path d="${part.d}" fill="none" stroke="${INK}" stroke-width="${n2(w + line)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>` +
            `<path d="${part.d}" fill="none" stroke="${colour}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
          );
        }
        case 'h':
          return `<path d="${part.d}" fill="#ffffff" fill-opacity="${n2(part.o ?? 0.5)}"${tf(part)}/>`;
      }
      return '';
    })
    .join('');
  return `<g opacity="0.38" transform="translate(0 1.9)">${shadow}</g>${body}`;
}

/** The plaque of tier pips under a tiered badge. */
function pips(dr: Drawing, tier: number, count: number, cy: number, m: Metal, small: boolean, locked: boolean): string {
  const gap = small ? 13 : 10;
  const size = small ? 11 : 8;
  const w = gap * count + (small ? 6 : 6);
  const h = small ? 18 : 14.5;
  const x0 = 60 - (gap * (count - 1)) / 2;
  const pill = `M${n(60 - w / 2 + h / 2)},${n(cy - h / 2)}H${n(60 + w / 2 - h / 2)}A${n(h / 2)},${n(h / 2)} 0 0 1 ${n(60 + w / 2 - h / 2)},${n(cy + h / 2)}H${n(60 - w / 2 + h / 2)}A${n(h / 2)},${n(h / 2)} 0 0 1 ${n(60 - w / 2 + h / 2)},${n(cy - h / 2)}Z`;
  const out: string[] = [];
  if (locked) {
    out.push(`<path d="${pill}" fill="${STONE.deep}" fill-opacity="0.2" stroke="${STONE.mid}" stroke-width="1.6"/>`);
  } else {
    const ground = dr.id('q');
    dr.def(linearAt(ground, [[0, m.dark], [1, m.deep]], 0, cy - h / 2, 0, cy + h / 2));
    out.push(inked(pill, `url(#${ground})`, OUTLINE));
    out.push(bevel(dr, pill, cy - h / 2, cy + h / 2, 0.9, 0.5));
  }
  const on: string[] = [];
  const off: string[] = [];
  for (let i = 0; i < count; i++) (i < tier && !locked ? on : off).push(diamondAt(x0 + gap * i, cy, size, size));
  if (on.length) out.push(`<path d="${on.join('')}" fill="url(#${metalBox(dr, m)})" stroke="${INK}" stroke-width="${small ? 1.3 : 1}" stroke-linejoin="round"/>`);
  if (off.length) {
    const c = locked ? STONE.mid : m.light;
    out.push(`<path d="${off.join('')}" fill="none" stroke="${c}" stroke-width="${small ? 1.4 : 1.1}" stroke-opacity="0.8" stroke-linejoin="round"/>`);
  }
  return out.join('');
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
  const shape = SHAPES[family];
  const shownTier = (tiers > 1 ? Math.min(tier, tiers) : 1) as BadgeTier;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'badge', key, shownTier, state, tiers, small));
  const title = opts.title ?? titleOf(key, shownTier, tiers, state);
  const outline = shape.outline;
  const outlinePath = polyPath(outline);
  const locked = state === 'locked';

  if (locked) {
    const g = STONE.mid;
    if (shape.stalk) dr.add(`<path d="${polyPath(shape.stalk)}" fill="none" stroke="${g}" stroke-width="2"/>`);
    dr.add(`<path d="${outlinePath}" fill="${g}" fill-opacity="0.1" stroke="${g}" stroke-width="${small ? 3 : 2.4}" stroke-linejoin="round"/>`);
    dr.add(`<path d="${polyPath(offset(outline, -(small ? 8 : 6.5)))}" fill="none" stroke="${g}" stroke-width="${small ? 1.6 : 1.1}" stroke-opacity="0.7" stroke-linejoin="round"/>`);
    dr.add(iconGroup(dr, key, shape, small, { metal: STONE, locked: true }));
    if (tiers > 1) dr.add(pips(dr, 0, tiers, shape.plaque, STONE, small, true));
    return dr.svg(size, title);
  }

  const lk = lookFor(key, shownTier, tiers, state);
  const m = lk.metal;
  const rim = small ? (lk.look >= 3 ? 10 : 8.5) : RIM[lk.look];

  dr.add(dropShadow(polyPath(offset(outline, 1.2)), small ? 2.2 : 2.8, 0.28));
  if (lk.look === 4) dr.add(setting(dr, outline, small));
  if (shape.stalk) dr.add(inked(polyPath(shape.stalk), `url(#${metalAcross(dr, m, 0, 60, 30, 120)})`, OUTLINE));
  dr.add(inked(polyPath(offset(outline, 0.2)), `url(#${metalAcross(dr, m, 22, 8, 98, 108)})`, small ? 3.2 : OUTLINE));
  dr.add(bevel(dr, polyPath(offset(outline, -1.1)), 8, 70, small ? 1.6 : 1.2, 0.8));
  if (lk.look >= 3) dr.add(kilimBand(dr, outline, rim, lk, small));
  else if (lk.look === 2 && !small) dr.add(beads(outline, rim, m));

  // the enamel field, behind a thin ink line
  const edge = offset(outline, -rim);
  const field = offset(outline, -rim - (small ? 1.5 : 1.1));
  const fieldPath = polyPath(field);
  dr.add(`<path d="${polyPath(edge)}" fill="${INK}"/>`);
  const enamel = dr.id('e');
  dr.def(
    radialAt(
      enamel,
      [
        [0, lk.enamel.light],
        [1, lk.enamel.deep],
      ],
      shape.icon[0],
      shape.icon[1] - 14,
      58,
    ),
  );
  dr.add(`<path d="${fieldPath}" fill="url(#${enamel})"/>`);
  // light from above: the field's top edge in shadow, a soft gloss across its upper half
  const clip = dr.clip(fieldPath);
  const shade = dr.id('h');
  dr.def(linearAt(shade, [[0, '#000000', 0.45], [0.35, '#000000', 0]], 0, 8, 0, 100));
  const gloss = dr.id('l');
  dr.def(linearAt(gloss, [[0, '#ffffff', 0.16], [1, '#ffffff', 0]], 0, 10, 0, 56));
  dr.add(
    `<g clip-path="url(#${clip})"><path d="${fieldPath}" fill="none" stroke="url(#${shade})" stroke-width="7"/>` +
      `<ellipse cx="${n(shape.icon[0])}" cy="${n(shape.icon[1] - 30)}" rx="54" ry="30" fill="url(#${gloss})"/>` +
      (state === 'secret' ? secretStars(key) : '') +
      `</g>`,
  );
  dr.add(iconGroup(dr, key, shape, small, { metal: state === 'secret' ? SHADOW : m, locked: false, secret: state === 'secret' }));
  if (tiers > 1) dr.add(pips(dr, shownTier, tiers, shape.plaque, m, small, false));
  return dr.svg(size, title);
}

function secretStars(key: string): string {
  const rnd = seeded(`secret-${key}`);
  const out: string[] = [];
  for (let i = 0; i < 14; i++) {
    out.push(`<circle cx="${n(20 + rnd() * 80)}" cy="${n(18 + rnd() * 76)}" r="${n2(0.4 + rnd() * 0.7)}" fill="#ffffff" fill-opacity="${n2(0.3 + rnd() * 0.5)}"/>`);
  }
  return out.join('');
}

function iconGroup(
  dr: Drawing,
  key: BadgeKey,
  shape: (typeof SHAPES)[BadgeFamily],
  small: boolean,
  p: { metal: Metal; locked: boolean; secret?: boolean },
): string {
  const [cx, cy] = shape.icon;
  const rankTier = rankTierOf(key);
  if (rankTier && !p.locked && !p.secret) return rankWindow(dr, rankTier, cx, cy, (small ? 27 : 24) * shape.scale);
  const draw = ICONS[rankTier ? 'hilkiser' : key];
  const parts = p.secret || !draw ? QUESTION : draw();
  const scale = shape.scale * (small ? 1.2 : 1);
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n2(scale)})">${paintIcon(parts, { dr, metal: p.metal, small, locked: p.locked })}</g>`;
}
