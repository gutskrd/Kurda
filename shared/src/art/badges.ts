/**
 * Badges: one calm, glossy piece in its family's shape and its own colour, a paler plate set into it, and one symbol
 * pressed into the plate. Sixty of them on a page must read as one set yet be told apart at a glance, and no part
 * relies on colour alone: the shape is the family (shapes.ts), the symbol is the badge (badge-glyphs.ts), and a tiered
 * badge's tag shows the milestone number in the tier's metal.
 *
 * Small sizes are redrawn rather than shrunk: below `SMALL_BADGE` the piece fills the square, four pips replace the tag
 * and the shadow goes; below `TINY_BADGE` the gloss goes too. States: `earned` is the whole badge, `locked` the same
 * piece in greys with the first milestone on its tag, and `secret` a violet gem with a "?", the same for every secret.
 */
import { BADGE_GLYPHS, GLYPH_VIEWBOX } from './badge-glyphs.js';
import type { BadgeFamily, BadgeKey, BadgeTier, RankTier } from './keys.js';
import { BADGE_TIER_NAMES, RANK_BADGE, RANK_TIERS, badgeArt, isBadgeKey } from './keys.js';
import { numeral, numeralWidth } from './numerals.js';
import type { Metal, PlateName } from './palette.js';
import { PLATES, RANK_METAL, STONE, TIER_METAL } from './palette.js';
import { capsule, pips, softStar } from './paint.js';
import { detailFor } from './ranks.js';
import type { Placement } from './shapes.js';
import { shapePath } from './shapes.js';
import type { Detail } from './svg.js';
import { Drawing, checkSize, linearAt, mix, n, n2, prefixFor, radialBox } from './svg.js';

export type BadgeState = 'earned' | 'locked' | 'secret';

export interface BadgeOptions {
  key: BadgeKey;
  /** 1 Sifir · 2 Zîv · 3 Zêr · 4 Firûze; ignored by single badges. Default 1. */
  tier?: BadgeTier;
  /** Defaults to `earned`. */
  state?: BadgeState;
  /** Size in pixels; defaults to 96. */
  size?: number;
  /** How many tiers the badge has; defaults to the art's own list. A single badge (1) shows no number and no pips. */
  tiers?: number;
  /** The accessible label; defaults to "Agir · Zêr". */
  title?: string;
  idPrefix?: string;
}

/** Below this many pixels the small version is drawn. */
export const SMALL_BADGE = 56;
/** Below this many pixels a badge keeps only its piece, its symbol and its pips. */
export const TINY_BADGE = 32;

/** One colour in the five steps a piece is modelled in, light to dark: plate, lit side, face, far side, thickness. */
interface Tone {
  plate: string;
  light: string;
  mid: string;
  dark: string;
  deep: string;
}

/** A palette plate colour as a piece's steps: softer than enamel, like glaze. */
function toneOf(name: PlateName): Tone {
  const p = PLATES[name];
  return {
    plate: mix(p.rim, '#ffffff', 0.35),
    light: mix(p.top, '#ffffff', 0.22),
    mid: mix(p.top, p.bottom, 0.4),
    dark: mix(p.bottom, p.deep, 0.12),
    deep: mix(p.bottom, p.deep, 0.5),
  };
}

/** A rank's metal as a piece's steps, so its badge matches its emblem. */
const toneOfMetal = (m: Metal): Tone => ({ plate: mix(m.hi, '#ffffff', 0.3), light: m.light, mid: mix(m.light, m.mid, 0.7), dark: m.mid, deep: m.dark });

/** Not earned yet: the piece in greys. */
const PEWTER: Tone = { plate: '#dfe2e8', light: '#c3c8d2', mid: '#a9b0bc', dark: '#8f96a4', deep: '#737a89' };

/** A secret not yet found: night violet. */
const NIGHT: Tone = { plate: '#8f7be0', light: '#6a52cc', mid: '#4b36a8', dark: '#2f1f7c', deep: '#1a0e52' };

/**
 * Each badge's colour. Neighbours in a family differ, so a family's row is a row of colours; where a colour carries
 * meaning (fire red, spring green, wave blue) it is that one.
 */
const HUE: Readonly<Record<string, PlateName>> = {
  // learning
  ders: 'blue',
  'peyven-min': 'violet',
  bekemasi: 'green',
  dubare: 'teal',
  cirokbej: 'pink',
  rewi: 'orange',
  ferheng: 'indigo',
  zengil: 'gold',
  penus: 'sky',
  belur: 'violet',
  gencine: 'gold',
  // habit
  agir: 'red',
  hefte: 'sky',
  roj: 'gold',
  vegera: 'teal',
  pela: 'blue',
  cay: 'orange',
  'gula-hefte': 'pink',
  'heyva-cardehe': 'indigo',
  // games
  peyvzan: 'green',
  helbestvan: 'orange',
  bilez: 'gold',
  rastnivis: 'blue',
  guhdar: 'violet',
  hemereng: 'pink',
  dilpak: 'red',
  mamik: 'teal',
  bilbil: 'sky',
  elmas: 'indigo',
  // Ranked: the six tier badges use their rank's colour (below).
  hilkiser: 'orange',
  cihgirti: 'sky',
  // friends
  heval: 'violet',
  diyari: 'pink',
  mevandar: 'gold',
  name: 'blue',
  dilgerm: 'red',
  // events
  newroz: 'orange',
  'roja-ziman': 'green',
  'zimane-dayike': 'pink',
  sersal: 'violet',
  yelda: 'red',
  zivistan: 'sky',
  bihar: 'green',
  havin: 'gold',
  payiz: 'orange',
  mehane: 'indigo',
  // Secrets, once found.
  'tire-rast': 'red',
  'ji-nu-ve': 'green',
  'kewe-ciye': 'orange',
  'deste-zerin': 'gold',
  'mevane-agir': 'orange',
  'kaniya-zanine': 'sky',
  'pisika-wane': 'pink',
  perperok: 'violet',
  'sterka-siqiti': 'indigo',
  mirari: 'teal',
};

/** The rank tier a ranked-family tier badge shows, read from its key. */
function rankTierOf(key: BadgeKey): RankTier | undefined {
  return RANK_TIERS.find((t) => RANK_BADGE[t] === key);
}

function toneFor(key: BadgeKey, state: BadgeState): Tone {
  if (state === 'secret') return NIGHT;
  if (state === 'locked') return PEWTER;
  const rank = rankTierOf(key);
  if (rank) return toneOfMetal(RANK_METAL[rank]);
  return toneOf(HUE[key] ?? 'violet');
}

/**
 * The two symbols drawn here because the icon family has neither: the pomegranate broken open on Yalda night, and the
 * pearl. In the glyphs' 256 box, at their weight.
 */
const DRAWN: Readonly<Record<string, readonly string[]>> = {
  yelda: [
    // The fruit, and the crown it keeps from its flower.
    'M128,76C81.6,76,44,113.6,44,160S81.6,244,128,244S212,206.4,212,160S174.4,76,128,76Z',
    'M96,84L88,28L112,52L128,20L144,52L168,28L160,84Z',
  ],
  mirari: [
    // The pearl, with its highlight left open, and the glint it throws.
    'M116,64A76,76,0,1,1,116,216A76,76,0,1,1,116,64ZM88,98A17,17,0,1,0,88,132A17,17,0,1,0,88,98Z',
    'M198,22C202,44,212,54,234,58C212,62,202,72,198,94C194,72,184,62,162,58C184,54,194,44,198,22Z',
  ],
};

/**
 * A badge's colour as one value, for what an app draws round it (the wash on its sheet, the light under its tile).
 * Locked badges give their grey and unfound secrets the night violet, so the wash never gives the badge away.
 */
export function badgeColour(key: BadgeKey, state: BadgeState = 'earned'): string {
  if (!isBadgeKey(key)) throw new RangeError(`art: no badge art for key ${String(key)}`);
  return toneFor(key, state).mid;
}

/** What a badge shows: its own symbol, or the "?" of a secret not yet found. */
function glyphOf(key: BadgeKey, state: BadgeState): readonly string[] {
  if (state === 'secret') return BADGE_GLYPHS.secret ?? [];
  return BADGE_GLYPHS[key] ?? DRAWN[key] ?? [];
}

/** Whether the art has a symbol for a badge; every catalogue badge must. */
export function hasBadgeGlyph(key: BadgeKey): boolean {
  return glyphOf(key, 'earned').length > 0;
}

interface Layout {
  /** Where the piece stands. */
  at: Placement;
  /** Its thickness, drawn under it. */
  depth: number;
  /** The plate's size relative to the piece. */
  plate: number;
  /** The symbol box's size, in canvas units. */
  glyph: number;
}

/**
 * Where everything stands at a size. Full: the piece a little above the middle, leaving its foot for the tag (when
 * tiered) and its shadow. Small: the piece fills the square, raised a little when pips sit under it.
 */
function layoutOf(detail: Detail, tiered: boolean): Layout {
  if (detail === 0) return tiered ? { at: { s: 0.84, y: 50 }, depth: 4.5, plate: 0.76, glyph: 46 } : { at: { s: 0.9, y: 54 }, depth: 4.5, plate: 0.76, glyph: 49 };
  return tiered ? { at: { s: 0.9, y: 52 }, depth: 4, plate: 0.76, glyph: 52 } : { at: { s: 0.98, y: 56 }, depth: 4, plate: 0.76, glyph: 56 };
}

/** The piece: its thickness, its face lit from the upper left, its gloss and the light along its upper edge. */
function pieceOf(dr: Drawing, family: BadgeFamily, lay: Layout, t: Tone, detail: Detail): string {
  const { at, depth } = lay;
  const face = shapePath(family, at);
  const fill = dr.id('f');
  dr.def(
    linearAt(
      fill,
      [
        [0, t.light],
        [0.5, t.mid],
        [1, t.dark],
      ],
      60 - 44 * at.s,
      at.y - 50 * at.s,
      60 + 40 * at.s,
      at.y + 50 * at.s,
    ),
  );
  const out = [`<path d="${shapePath(family, { s: at.s, y: at.y + depth })}" fill="${t.deep}"/>`, `<path d="${face}" fill="url(#${fill})"/>`];
  if (detail === 2) return out.join('');
  // The gloss: a soft light on the upper left of the face, fading before the middle.
  const gloss = dr.id('g');
  dr.def(radialBox(gloss, [[0, '#ffffff', 0.42], [1, '#ffffff', 0]], 0.28, 0.14, 0.62));
  out.push(`<path d="${face}" fill="url(#${gloss})"/>`);
  // The edge: lit where the piece turns toward the light, shaded where it turns away.
  const edge = dr.id('e');
  dr.def(
    linearAt(
      edge,
      [
        [0, '#ffffff', 0.75],
        [0.45, '#ffffff', 0.1],
        [1, t.deep, 0.3],
      ],
      0,
      at.y - 52 * at.s,
      0,
      at.y + 52 * at.s,
    ),
  );
  out.push(`<path d="${shapePath(family, at, 0.9)}" fill="none" stroke="url(#${edge})" stroke-width="1.6"/>`);
  return out.join('');
}

/** The plate set into the piece, and the symbol pressed into the plate. */
function plateOf(dr: Drawing, family: BadgeFamily, key: BadgeKey, state: BadgeState, lay: Layout, t: Tone): string {
  const { at } = lay;
  const inner: Placement = { s: at.s * lay.plate, y: at.y };
  const plate = shapePath(family, inner);
  const fill = dr.id('p');
  dr.def(linearAt(fill, [[0, '#ffffff'], [0.3, t.plate], [1, mix(t.plate, t.light, 0.55)]], 0, at.y - 44 * inner.s, 0, at.y + 48 * inner.s));
  const out = [
    // The plate's own thickness, a line of shade under it.
    `<path d="${shapePath(family, { s: inner.s, y: inner.y + 1.8 })}" fill="${t.deep}" fill-opacity="0.35"/>`,
    `<path d="${plate}" fill="url(#${fill})"/>`,
  ];
  const glyph = glyphOf(key, state);
  if (glyph.length > 0) {
    const k = lay.glyph / GLYPH_VIEWBOX;
    const ink = dr.id('i');
    dr.def(linearAt(ink, [[0, t.mid], [1, t.deep]], 0, 0, 0, GLYPH_VIEWBOX));
    const d = glyph.join('');
    const placed = (dy: number): string => `translate(${n(60 - lay.glyph / 2)} ${n(at.y - lay.glyph / 2 + dy)}) scale(${n2(k)})`;
    // Pressed in: a line of light along the lower edge, then the symbol in the badge's colour.
    out.push(`<path d="${d}" transform="${placed(1.1)}" fill="#ffffff" fill-opacity="0.85"/>`);
    out.push(`<path d="${d}" transform="${placed(0)}" fill="url(#${ink})"/>`);
  }
  return out.join('');
}

/** Where the tag sits: across the piece's foot. */
const TAG_Y = 99;
const TAG_H = 16.5;
const FIGURE_H = 9.2;

/**
 * The tag at a tiered badge's foot: a capsule of the tier's metal holding the tier's milestone number, or a star for
 * "every unit of the course", which is not a number.
 */
function tagOf(dr: Drawing, milestone: number | 'all', m: Metal): string {
  const text = milestone === 'all' ? '' : String(milestone);
  const w = Math.max(TAG_H * 1.75, numeralWidth(text) * FIGURE_H + 14);
  const pill = capsule(60, TAG_Y, w, TAG_H);
  const fill = dr.id('t');
  dr.def(linearAt(fill, [[0, m.hi], [0.55, m.light], [1, mix(m.light, m.mid, 0.6)]], 0, TAG_Y - TAG_H / 2, 0, TAG_Y + TAG_H / 2));
  const out = [
    `<path d="${capsule(60, TAG_Y + 2, w, TAG_H)}" fill="${m.dark}"/>`,
    `<path d="${pill}" fill="url(#${fill})"/>`,
    `<path d="${capsule(60, TAG_Y, w - 2.2, TAG_H - 2.2)}" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1"/>`,
  ];
  if (milestone === 'all') out.push(`<path d="${softStar(60, TAG_Y, 5.6)}" fill="${m.deep}"/>`);
  else out.push(numeral(dr, text, 60, TAG_Y - FIGURE_H / 2, FIGURE_H, { edge: m.deep, top: m.deep, bottom: m.deep, rim: 0, drop: 0 }));
  return out.join('');
}

/** The pips under a small tiered badge: four in a capsule of the tier's metal, as many raised as the tier. */
function pipsOf(dr: Drawing, tier: number, count: number, m: Metal): string {
  const cy = 107;
  const r = 5.4;
  const gap = 4.6;
  const w = count * r * 2 + (count - 1) * gap + r * 2.2;
  return `<path d="${capsule(60, cy, w, r * 2 + r * 1.3)}" fill="${m.deep}"/>` + pips(dr, m, count, tier, 60, cy, r, gap);
}

/** The soft shadow a piece casts, well inside the square. */
function shadowOf(dr: Drawing): string {
  const id = dr.id('s');
  dr.def(radialBox(id, [[0, '#000000', 0.2], [1, '#000000', 0]]));
  return `<ellipse cx="60" cy="112.5" rx="34" ry="5" fill="url(#${id})"/>`;
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
  // An unfound secret is the same gem whatever it hides.
  const family: BadgeFamily = state === 'secret' ? 'secret' : badgeArt(key).family;
  const shownTier = (tiers > 1 ? Math.min(tier, tiers) : 1) as BadgeTier;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'badge', key, shownTier, state, tiers, detail));
  const title = opts.title ?? titleOf(key, shownTier, tiers, state);
  const tiered = tiers > 1 && state !== 'secret';
  const locked = state === 'locked';
  const lay = layoutOf(detail, tiered);
  const tone = toneFor(key, state);
  const metal = locked ? STONE : TIER_METAL[shownTier];
  // The tier's milestone; one the art does not know (a tier asked of a single badge) is shown as pips instead.
  const milestone = badgeArt(key).milestones[(locked ? 1 : shownTier) - 1];

  if (detail === 0) dr.add(shadowOf(dr));
  dr.add(pieceOf(dr, family, lay, tone, detail));
  dr.add(plateOf(dr, family, key, state, lay, tone));
  if (tiered && detail === 0 && milestone !== undefined) dr.add(tagOf(dr, milestone, metal));
  else if (tiered) dr.add(pipsOf(dr, locked ? 0 : shownTier, tiers, metal));
  return dr.svg(size, title);
}

/**
 * Whether a badge has the glint: Zêr and Firûze tiers, and single-tier badges, which are rare. The apps play it once
 * when earned and again on hover or tap, never under reduced motion.
 */
export function badgeShines(key: BadgeKey, tier: BadgeTier = 1, tiers?: number): boolean {
  if (!isBadgeKey(key)) return false;
  const count = tiers ?? badgeArt(key).tiers;
  return count > 1 ? Math.min(tier, count) >= 3 : true;
}

export interface BadgeShineOptions {
  key: BadgeKey;
  /** Size in pixels, the same as the badge it lies on; defaults to 96. */
  size?: number;
  /** The glint's progress, 0 (off the upper left) to 1 (off the lower right); apps step it over about a second. */
  phase?: number;
  idPrefix?: string;
}

/**
 * The glint alone: a soft band of light clipped to the badge's face, laid over the badge at the same size. Decorative
 * and hidden from screen readers.
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
  const clip = dr.clip(shapePath(family, layoutOf(detail, badgeArt(key).tiers > 1).at, 0.6));
  const band = dr.id('g');
  dr.def(
    linearAt(
      band,
      [
        [0, '#ffffff', 0],
        [0.5, '#ffffff', 0.5],
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
