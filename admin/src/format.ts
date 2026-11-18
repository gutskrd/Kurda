/** Small display helpers shared across pages. */
import { APP_LOCALES } from '@kurda/shared';

/** A language by its English name, as the console names languages; an unknown code as itself. */
export function localeName(code: string): string {
  return APP_LOCALES.find((l) => l.code === code)?.englishName ?? code;
}

/** The shape the ratio tile needs; matches the drift endpoint's response. */
export interface RatioLike {
  /** Null when nothing was spent, so faucet/sink is infinite. */
  ratio: number | null;
  faucet: number;
}

/**
 * Text for the faucet/sink ratio tile.
 *
 * A null ratio means faucets with no sinks at all — infinite, which JSON cannot
 * represent, so the API sends null. Calling `.toFixed()` on it threw and took the
 * whole page down with it, so the infinite case gets its own symbol here rather
 * than being confused with "no data".
 */
export function ratioLabel(drift: RatioLike | null): string {
  if (!drift) return '—';
  if (drift.ratio === null) return drift.faucet > 0 ? '∞' : '—';
  return drift.ratio.toFixed(2);
}
