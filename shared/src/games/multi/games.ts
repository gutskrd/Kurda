/**
 * The multiplayer learning games the generic engine runs (api/src/mp), and
 * the numbers every one of them shares: how long a turn may be missed before a
 * player is away, how Hevalo plays a seat, and how placement XP is paid.
 *
 * `MULTI_GAMES` is the one list. The play layer's `PLAY_GAMES`, Game Ranks'
 * `RANKED_GAMES` and the invite links all add it to the games that came before,
 * so a new game is one line here (and one in the migration that widens the
 * database's own lists), not a change to every map.
 */

export const MULTI_GAMES = ['last-letter', 'impostor', 'dont-say'] as const;
export type MultiGame = (typeof MULTI_GAMES)[number];

export function isMultiGame(v: unknown): v is MultiGame {
  return (MULTI_GAMES as readonly unknown[]).includes(v);
}

/** The address segment of each game's page (`/app/games/<segment>`), as players know the game. */
export const MULTI_GAME_SEGMENT: Readonly<Record<MultiGame, string>> = {
  'last-letter': 'last-letter',
  impostor: 'impostor',
  'dont-say': 'dont-say',
};

/** A player who lets this many turns in a row run out is away: their next turns are passed over at once. */
export const AWAY_AFTER_MISSED_TURNS = 2;
/** How long an away player's turn waits for them before it is passed over: long enough to tap back in. */
export const AWAY_TURN_GRACE_MS = 4_000;
/** A game whose every person has been gone or away this long is ended where it stands. */
export const ABANDONED_MINUTES = 10;

/** Who plays a computer seat. */
export const HEVALO_BOT = 'hevalo';

// ---------------------------------------------------------------------------
// placement XP
// ---------------------------------------------------------------------------

/** Placement XP is paid only when at least this many people played the game to its end. */
export const MIN_HUMANS_FOR_PLACEMENT_XP = 2;
export const PLACEMENT_WIN_XP = 60;
export const PLACEMENT_LAST_XP = 15;

/**
 * Playing the same people again on the same day pays less: the k-th game of a
 * day against any of the same opponents pays this share (1st, 2nd, 3rd, 4th,
 * then nothing). Games against new people pay in full.
 */
export const REPEAT_OPPONENT_SHARE = [1, 1, 0.5, 0.25, 0] as const;

/** First earns PLACEMENT_WIN_XP, last PLACEMENT_LAST_XP, the places between in even steps. */
export function placementXp(place: number, players: number): number {
  if (players <= 1) return 0;
  const clamped = Math.min(Math.max(Math.floor(place), 1), players);
  const spread = PLACEMENT_WIN_XP - PLACEMENT_LAST_XP;
  return Math.round(PLACEMENT_LAST_XP + (spread * (players - clamped)) / (players - 1));
}

/** The share paid for a game when `earlier` games today were against any of the same people. */
export function repeatOpponentShare(earlier: number): number {
  const i = Math.max(0, Math.min(REPEAT_OPPONENT_SHARE.length - 1, Math.floor(earlier)));
  return REPEAT_OPPONENT_SHARE[i]!;
}

/** What a place pays, all rules applied. */
export function paidPlacementXp(place: number, players: number, earlierToday: number): number {
  return Math.floor(placementXp(place, players) * repeatOpponentShare(earlierToday));
}
