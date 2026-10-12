import {
  ANSWER_GRACE_MS,
  LOBBY_IDLE_MINUTES,
  REVEAL_MAX_SECONDS,
  UNTIMED_QUESTION_CAP_SECONDS,
  type StoryGameMode,
  type StoryGameStatus,
} from '@kurda/shared';

/**
 * The rules of a story game that need no database: when each phase is due to
 * end, who is waited for, who holds the host controls, and who placed where.
 * The service applies them to a row it has locked; they are here so they can
 * be tested one by one.
 */

/** What the phase rules need of a game. Times are epoch milliseconds. */
export interface PhaseGame {
  mode: StoryGameMode;
  status: StoryGameStatus;
  currentIndex: number;
  questionCount: number;
  timerSeconds: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  readingHardCapAt: number | null;
  updatedAt: number;
}

/** What the phase rules need of a player. */
export interface PhasePlayer {
  userId: string;
  seat: number;
  joinedAt: number;
  /** left the game (gone) */
  left: boolean;
  removed: boolean;
  /** not heard from for PRESENCE_TIMEOUT_SECONDS */
  away: boolean;
  /** the instant they turn away if nothing more is heard from them */
  awayAt: number;
  extraTime: boolean;
  doneReading: boolean;
  /** last reveal index they continued past */
  continuedIndex: number | null;
  /** answered the current question */
  answered: boolean;
}

/** In the game: not removed and not left. */
export function inGame(p: PhasePlayer): boolean {
  return !p.removed && !p.left;
}

/** Waited for: in the game and not away. */
export function isActive(p: PhasePlayer): boolean {
  return inGame(p) && !p.away;
}

/**
 * When this player's time for the open question runs out (before the grace),
 * or null when it never does. A timed question gives a player with extra time
 * twice the timer; an untimed duo or group question closes at its cap; an
 * untimed solo question waits for its reader.
 */
export function questionDeadline(game: PhaseGame, extraTime: boolean): number | null {
  if (game.status !== 'question' || game.phaseStartedAt === null) return null;
  if (game.timerSeconds > 0) return game.phaseStartedAt + game.timerSeconds * 1000 * (extraTime ? 2 : 1);
  return game.mode === 'solo' ? null : game.phaseEndsAt;
}

/**
 * When the open question closes on its own: the latest deadline among the
 * players it waits for, plus the answer grace — never earlier, or an answer
 * sent in the last second would arrive to a closed question. Away players are
 * not waited for; with nobody active, the game's own deadline stands.
 */
export function questionCloseAt(game: PhaseGame, players: readonly PhasePlayer[]): number | null {
  if (game.status !== 'question') return null;
  const waitedFor = players.filter(isActive);
  const deadlines = (waitedFor.length ? waitedFor : [{ extraTime: false }]).map((p) =>
    questionDeadline(game, p.extraTime),
  );
  if (deadlines.some((d) => d === null)) return null;
  return Math.max(...(deadlines as number[])) + ANSWER_GRACE_MS;
}

/** Which transition is due now, if any. */
export type Transition = 'expire_lobby' | 'open_questions' | 'close_question' | 'next' | null;

export function dueTransition(game: PhaseGame, players: readonly PhasePlayer[], now: number): Transition {
  const active = players.filter(isActive);
  // "everyone has" needs someone: a game whose players all walked away moves
  // on by its deadlines, not instantly
  const all = (pred: (p: PhasePlayer) => boolean) => active.length > 0 && active.every(pred);
  switch (game.status) {
    case 'lobby':
      return now >= game.updatedAt + LOBBY_IDLE_MINUTES * 60_000 ? 'expire_lobby' : null;
    case 'reading':
      if (all((p) => p.doneReading)) return 'open_questions';
      return game.readingHardCapAt !== null && now >= game.readingHardCapAt ? 'open_questions' : null;
    case 'question': {
      if (all((p) => p.answered)) return 'close_question';
      const closeAt = questionCloseAt(game, players);
      return closeAt !== null && now >= closeAt ? 'close_question' : null;
    }
    case 'reveal':
      if (all((p) => p.continuedIndex === game.currentIndex)) return 'next';
      return game.mode !== 'solo' && game.phaseEndsAt !== null && now >= game.phaseEndsAt ? 'next' : null;
    default:
      return null;
  }
}

/**
 * The next instant something may become due: a deadline, or a player turning
 * away (which can make "everyone has answered" true, or move the host
 * controls). Null when nothing ever will.
 */
export function nextDueAt(game: PhaseGame, players: readonly PhasePlayer[]): number | null {
  const times: number[] = [];
  switch (game.status) {
    case 'lobby':
      times.push(game.updatedAt + LOBBY_IDLE_MINUTES * 60_000);
      break;
    case 'reading':
      if (game.readingHardCapAt !== null) times.push(game.readingHardCapAt);
      break;
    case 'question': {
      const closeAt = questionCloseAt(game, players);
      if (closeAt !== null) times.push(closeAt);
      break;
    }
    case 'reveal':
      if (game.mode !== 'solo' && game.phaseEndsAt !== null) times.push(game.phaseEndsAt);
      break;
    default:
      return null;
  }
  if (game.mode !== 'solo') for (const p of players) if (isActive(p)) times.push(p.awayAt);
  return times.length ? Math.min(...times) : null;
}

/** When a duo or group reveal ends at the latest. */
export function revealEndsAt(mode: StoryGameMode, now: number): number | null {
  return mode === 'solo' ? null : now + REVEAL_MAX_SECONDS * 1000;
}

/** When an opened question's own deadline is (for a player without extra time). */
export function questionEndsAt(mode: StoryGameMode, timerSeconds: number, now: number): number | null {
  if (timerSeconds > 0) return now + timerSeconds * 1000;
  return mode === 'solo' ? null : now + UNTIMED_QUESTION_CAP_SECONDS * 1000;
}

/**
 * Who holds the host controls right now: the host while they are in the game
 * and present; otherwise the earliest-joined active player, until the host is
 * back. Host controls only ever make a game move sooner — deadlines keep it
 * moving without anyone — so handing them on costs nothing and saves a group
 * from waiting on a phone that died.
 */
export function controllerOf(hostId: string | null, players: readonly PhasePlayer[]): string | null {
  const host = hostId ? players.find((p) => p.userId === hostId) : undefined;
  if (host && isActive(host)) return host.userId;
  const standIn = players
    .filter(isActive)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.seat - b.seat)[0];
  return standIn?.userId ?? null;
}

export interface Scored {
  key: string;
  score: number;
  /** total time to the right answers, the tie-break */
  correctMs: number;
}

/**
 * Places: most points first, then the least time spent on the right answers.
 * Equal score and time share a place, and the next place skips (1, 1, 3).
 */
export function placesOf(rows: readonly Scored[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.correctMs - b.correctMs);
  const places = new Map<string, number>();
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    const place = prev && prev.score === r.score && prev.correctMs === r.correctMs ? places.get(prev.key)! : i + 1;
    places.set(r.key, place);
  });
  return places;
}
