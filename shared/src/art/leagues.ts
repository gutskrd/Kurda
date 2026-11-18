/**
 * Learning-league emblems: six water tiers, each a crest (crest.ts) whose stone is the colour of its water, set in a
 * rim that climbs from pearl through silver, gold, rose gold and platinum to mother-of-pearl. The setting grows with
 * each tier (drop, shield with wings, hexagon with beads, octagon on a laurel, brilliant under a crown, full crest), so
 * the ladder reads by outline first; a league not reached yet is its own outline, flat, with a keyhole.
 */
import type { Crest } from './crest.js';
import { crestMarkup, crestSilhouette } from './crest.js';
import { LEAGUE_GLYPHS } from './crest-glyphs.js';
import type { LeagueTier } from './keys.js';
import { LEAGUE_TIER_NAMES, LEAGUE_TIERS } from './keys.js';
import { LEAGUE_METAL, LEAGUE_RIM } from './palette.js';
import { crestBox, detailFor } from './ranks.js';
import { Drawing, checkSize, prefixFor } from './svg.js';

const LADDER: Record<LeagueTier, Pick<Crest, 'cut' | 'wings' | 'base' | 'crown' | 'beads' | 'glow' | 'rays'>> = {
  dilop: { cut: 'drop', wings: 0, base: 0, crown: 'none', beads: false, glow: 0, rays: false },
  kani: { cut: 'shield', wings: 1, base: 0, crown: 'none', beads: false, glow: 0, rays: false },
  cem: { cut: 'hexagon', wings: 2, base: 0, crown: 'none', beads: true, glow: 0, rays: false },
  gol: { cut: 'octagon', wings: 3, base: 1, crown: 'none', beads: true, glow: 0, rays: false },
  derya: { cut: 'brilliant', wings: 4, base: 1, crown: 'pearls', beads: true, glow: 0.3, rays: false },
  okyanus: { cut: 'brilliant', wings: 5, base: 2, crown: 'star', beads: true, glow: 0.55, rays: true },
};

/** A league's crest, whole. */
export function leagueCrest(tier: LeagueTier): Crest {
  return { ...LADDER[tier], gem: LEAGUE_METAL[tier], metal: LEAGUE_RIM[tier], glyph: LEAGUE_GLYPHS[tier] };
}

export interface LeagueEmblemOptions {
  tier: LeagueTier;
  /** Size in pixels; defaults to 128. */
  size?: number;
  /** The accessible label; defaults to "Çem (River)". */
  title?: string;
  idPrefix?: string;
  /** A league not reached yet: its outline flat in `body` with a keyhole in `mark`, both in the screen's colours. */
  locked?: { body: string; mark: string };
}

/** Below this many pixels the small version is drawn: filling its square, bolder. */
export const SMALL_LEAGUE = 56;

/** A learning league's emblem as an SVG string. */
export function leagueEmblemSvg(opts: LeagueEmblemOptions): string {
  const { tier } = opts;
  if (!LEAGUE_TIERS.includes(tier)) throw new RangeError(`art: unknown league tier ${String(tier)}`);
  const size = checkSize(opts.size, 128);
  const detail = detailFor(size, SMALL_LEAGUE);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'league', tier, detail, opts.locked?.body, opts.locked?.mark));
  const crest = leagueCrest(tier);
  const box = crestBox(detail, false);
  if (opts.locked) dr.add(crestSilhouette(crest, detail, box, opts.locked.body, opts.locked.mark));
  else dr.add(crestMarkup(dr, crest, { detail, box }).markup);
  const nm = LEAGUE_TIER_NAMES[tier];
  return dr.svg(size, opts.title ?? `${nm.ku} (${nm.en})`);
}
