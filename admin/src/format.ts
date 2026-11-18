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

/** Text for the faucet/sink ratio tile. JSON has no infinity, so a null ratio with faucets but no sinks shows "∞". */
export function ratioLabel(drift: RatioLike | null): string {
  if (!drift) return '—';
  if (drift.ratio === null) return drift.faucet > 0 ? '∞' : '—';
  return drift.ratio.toFixed(2);
}
