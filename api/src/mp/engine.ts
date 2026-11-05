import { AWAY_AFTER_MISSED_TURNS, AWAY_TURN_GRACE_MS, LOBBY_IDLE_MINUTES, type GameRules } from '@kurda/shared';

/**
 * The phase engine's decisions, pure: given a game's state, its seats and the
 * time, what is due now and when the next thing will be. Generalised from the
 * story games' phase rules (story-games/logic.ts): deadlines are judged on the
 * database's clock read after the game's lock, nobody is waited for who has
 * gone, and a player who is not there does not hold everyone else up.
 *
 * - A turn whose time ran out is a timeout for every seat it waited on.
 * - Hevalo's seat moves when its thinking time is up.
 * - A player who let two turns in a row run out, or who has not been heard
 *   from (presence), is away: their turn is passed over a moment after it
 *   comes (AWAY_TURN_GRACE_MS) instead of running its whole time. They are back
 *   the moment they ask anything.
 * - With every person gone the game ends where it stands.
 *
 * The service (service.ts) applies one step at a time to the row it has
 * locked, and arms a timer — and writes `due_at` for any replica's sweep — for
 * `nextDue`.
 */

/** A seat as the engine judges it. Times are epoch milliseconds. */
export interface EngineSeat {
  seat: number;
  /** null for a computer seat */
  userId: string | null;
  bot: string | null;
  joinedAt: number;
  left: boolean;
  removed: boolean;
  /** marked away after missed turns (stored) */
  away: boolean;
  /** not heard from for PRESENCE_TIMEOUT_SECONDS (in memory and `last_seen_at`) */
  silent: boolean;
  /** when they turn silent if nothing more is heard from them */
  silentAt: number;
}

export type EngineStep =
  | { kind: 'finish' }
  | { kind: 'end' }
  | { kind: 'bot'; seat: number }
  | { kind: 'timeout'; seats: number[] }
  | { kind: 'skip'; seats: number[] };

/** A person still in the game. */
export function inGame(s: EngineSeat): boolean {
  return s.userId !== null && !s.left && !s.removed;
}

/** Away: missed their turns, or not heard from. */
export function isAway(s: EngineSeat): boolean {
  return s.away || s.silent;
}

/** A player is away after this many turns in a row ran out on them. */
export function awayAfter(missedTurns: number): boolean {
  return missedTurns >= AWAY_AFTER_MISSED_TURNS;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRules = GameRules<any, any, any, any, any>;

/** What is due on a game under way at `now`, if anything. `waitSince` is when the present wait began. */
export function dueStep(rules: AnyRules, state: unknown, seats: readonly EngineSeat[], now: number, waitSince: number): EngineStep | null {
  if (rules.finished(state)) return { kind: 'finish' };
  if (!seats.some(inGame)) return { kind: 'end' };
  const waiting = rules.waitingFor(state);
  const due = rules.dueAt(state);
  const bySeat = new Map(seats.map((s) => [s.seat, s]));
  const bot = waiting.find((seat) => bySeat.get(seat)?.bot);
  if (bot !== undefined && due !== null && now >= due) return { kind: 'bot', seat: bot };
  const people = waiting.filter((seat) => !bySeat.get(seat)?.bot);
  if (due !== null && now >= due && people.length > 0) return { kind: 'timeout', seats: people };
  // someone waited on who is not there: passed over after a moment, not after the whole turn
  const absent = people.filter((seat) => {
    const s = bySeat.get(seat);
    return !s || !inGame(s) || isAway(s);
  });
  if (absent.length > 0 && now >= waitSince + AWAY_TURN_GRACE_MS) return { kind: 'skip', seats: absent };
  return null;
}

/** The next instant something may become due on a game under way, or null. */
export function nextDue(rules: AnyRules, state: unknown, seats: readonly EngineSeat[], waitSince: number): number | null {
  // finished but not yet settled: due at once
  if (rules.finished(state)) return 0;
  const times: number[] = [];
  const due = rules.dueAt(state);
  if (due !== null) times.push(due);
  const bySeat = new Map(seats.map((s) => [s.seat, s]));
  for (const seat of rules.waitingFor(state)) {
    const s = bySeat.get(seat);
    if (s?.bot) continue;
    // away now: passed over after the grace; present now: may turn silent before their time is up
    if (!s || !inGame(s) || isAway(s)) times.push(waitSince + AWAY_TURN_GRACE_MS);
    else times.push(s.silentAt);
  }
  return times.length ? Math.min(...times) : null;
}

/** When an unstarted lobby closes for want of anyone starting it. */
export function lobbyClosesAt(updatedAt: number): number {
  return updatedAt + LOBBY_IDLE_MINUTES * 60_000;
}

/**
 * Who holds the host controls after the start: the host while in the game and
 * not away, otherwise the earliest-joined person still in it and present,
 * until the host is back. Host controls only make a game move sooner (or open
 * the next round), so handing them on costs nothing. In the lobby they never
 * pass: who may join is decided by who the host is, and a lobby whose host has
 * left is called off.
 */
export function controllerOf(hostId: string | null, seats: readonly EngineSeat[]): string | null {
  const host = hostId ? seats.find((s) => s.userId === hostId) : undefined;
  if (host && inGame(host) && !isAway(host)) return host.userId;
  const standIn = seats
    .filter((s) => inGame(s) && !isAway(s))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.seat - b.seat)[0];
  return standIn?.userId ?? null;
}
