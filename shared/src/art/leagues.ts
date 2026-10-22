/**
 * Learning-league emblems (contract 4, L1/B3): six water tiers, each a crest
 * (see crest.ts) — a stone the colour of its water, set in a precious rim that
 * climbs with it: pearl, silver, gold, rose gold, platinum, and for the ocean
 * mother-of-pearl.
 *
 *   Dilop, the drop      a drop-cut stone on its own, a leaf cut into it
 *   Kanî, the spring     a shield with a first pair of wings, bubbles rising
 *   Çem, the river       a hexagon, fuller wings, running water
 *   Gol, the lake        an octagon with wings above and below, a peak and its reflection
 *   Derya, the sea       a round brilliant under a crown, glowing, the sun on the horizon
 *   Okyanûs, the ocean   the full crest: a jewelled crown, a hanging stone, rays, a whale's tail
 *
 * The drop rounds into the ocean as the water does, and the setting grows
 * round it, so the ladder reads by its outline first and its colour second —
 * which is also how a league not reached yet is drawn: its own outline, flat,
 * with a keyhole.
 */
import type { Crest } from './crest.js';
import { crestMarkup, crestSilhouette } from './crest.js';
import { LEAGUE_GLYPHS } from './crest-glyphs.js';
import type { LeagueTier } from './keys.js';
import { LEAGUE_TIER_NAMES, LEAGUE_TIERS } from './keys.js';
import { LEAGUE_METAL, LEAGUE_RIM } from './palette.js';
import { crestBox, detailFor } from './ranks.js';
import { Drawing, checkSize, prefixFor } from './svg.js';

const LADDER: Record<LeagueTier, Pick<Crest, 'cut' | 'wings' | 'base' | 'crown' | 'glow' | 'rays'>> = {
  dilop: { cut: 'drop', wings: 0, base: 0, crown: 'none', glow: 0, rays: false },
  kani: { cut: 'shield', wings: 1, base: 0, crown: 'none', glow: 0, rays: false },
  cem: { cut: 'hexagon', wings: 2, base: 0, crown: 'none', glow: 0, rays: false },
  gol: { cut: 'octagon', wings: 3, base: 1, crown: 'none', glow: 0, rays: false },
  derya: { cut: 'brilliant', wings: 4, base: 1, crown: 'spikes', glow: 0.3, rays: false },
  okyanus: { cut: 'brilliant', wings: 5, base: 2, crown: 'jewel', glow: 0.55, rays: true },
};

/** A league's crest, whole. */
export function leagueCrest(tier: LeagueTier): Crest {
  return { ...LADDER[tier], gem: LEAGUE_METAL[tier], metal: LEAGUE_RIM[tier], glyph: LEAGUE_GLYPHS[tier] };
}

export interface LeagueEmblemOptions {
  tier: LeagueTier;
  /** pixels; default 128 */
  size?: number;
  /** the accessible label; defaults to "Çem (River)" */
  title?: string;
  idPrefix?: string;
  /**
   * A league not reached yet: the tier's own outline, flat in `body`, with a
   * keyhole in `mark` — its shape says which one it is, its stone waits.
   * The colours are the screen's, so it sits quietly in light and dark.
   */
  locked?: { body: string; mark: string };
}

/** Under this many pixels an emblem is drawn in its small version: filling its square, bolder. */
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
