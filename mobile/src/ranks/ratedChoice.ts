import { isRankedGame, type RankedGame } from '@kurda/shared';

/** The Rated/Friendly memory's pure half (no React Native): what was stored, and where a sheet starts. */
export type RatedChoices = Partial<Record<RankedGame, boolean>>;

/** Whatever was stored, game by game; anything else is dropped. */
export function parseChoices(raw: string | null | undefined): RatedChoices {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    const out: RatedChoices = {};
    for (const [game, rated] of Object.entries(v as Record<string, unknown>)) {
      if (isRankedGame(game) && typeof rated === 'boolean') out[game] = rated;
    }
    return out;
  } catch {
    return {};
  }
}

/** The choice a setup sheet starts on: the server's, then this phone's, then Friendly. */
export function startingChoice(game: RankedGame, server: RatedChoices | null, device: RatedChoices): boolean {
  return server?.[game] ?? device[game] ?? false;
}
