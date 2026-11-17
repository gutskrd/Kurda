/**
 * The multiplayer learning games the generic engine runs (api/src/mp) and the numbers they share: when a player counts as
 * away, how Hevalo plays a seat, and how placement XP is paid. `MULTI_GAMES` is the one list that `PLAY_GAMES`,
 * `RANKED_GAMES` and invite links extend, so a new game is one line here plus the migration widening the database's lists.
 */

export const MULTI_GAMES = ['last-letter', 'impostor', 'who-am-i'] as const;
export type MultiGame = (typeof MULTI_GAMES)[number];

export function isMultiGame(v: unknown): v is MultiGame {
  return (MULTI_GAMES as readonly unknown[]).includes(v);
}

/** Each game's page segment (`/app/games/<segment>`), the name players know. */
export const MULTI_GAME_SEGMENT: Readonly<Record<MultiGame, string>> = {
  'last-letter': 'last-letter',
  impostor: 'impostor',
  'who-am-i': 'who-am-i',
};

/** A player who lets this many turns in a row run out is away: their next turns are passed over at once. */
export const AWAY_AFTER_MISSED_TURNS = 2;
/** How long an away player's turn waits before it is passed over: long enough to tap back in. */
export const AWAY_TURN_GRACE_MS = 4_000;

// ---------------------------------------------------------------------------
// placement XP
// ---------------------------------------------------------------------------

/** Placement XP is paid only when at least this many people played the game to its end. */
export const MIN_HUMANS_FOR_PLACEMENT_XP = 2;
export const PLACEMENT_WIN_XP = 60;
export const PLACEMENT_LAST_XP = 15;

/**
 * Playing the same people again the same day pays less: the k-th game against any of the same opponents pays this share,
 * then nothing. New opponents pay in full.
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
