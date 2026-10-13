import type pg from 'pg';
import { dictionaryKey, type GameAccess, type InviteSummary, type LobbyCard } from '@kurda/shared';
import { XpService } from '../xp/service.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { canJoin, mayHostOpen } from '../play/access.js';
import {
  WORDLE_BATTLES as T,
  cancelIdleLobbies,
  hostRef,
  inGame,
  loadFacts,
  lobbyCard,
  lobbyIdle,
  mayJoin,
  nextSeat,
  present,
  rematchChain,
  seatId,
  seatPlayers,
  seatsOf,
  tallySeries,
  type LobbyRow,
  type SeatPlayer,
  type SeatRow,
} from '../play/lobby.js';
import type { LobbyChange, LobbyFacts, Series } from '../play/types.js';
import {
  applyGuess,
  initGame,
  keyboardFromGuesses,
  normalizeWord,
  toLetters,
  InMemoryDictionary,
  type GameStatus,
  type GuessRejection,
  type GuessRow,
  type WordleGame,
} from './wordle.js';
import { filterByDifficulty, type Difficulty } from './wordle-daily.js';
import { placementXp, rankBattle, type BattlePlayerResult } from './wordle-battle.js';

const MAX_ATTEMPTS = 6;
const HARDER_TO_EASIER: readonly Difficulty[] = ['hard', 'medium', 'easy'];

/**
 * A battle ends this long after it starts whatever anyone is doing, so one
 * player who closed the tab cannot hold it open for ever (six guesses take a
 * person a few minutes, not ten).
 */
export const BATTLE_MINUTES = 10;

/**
 * A player the server has not heard from for this long is away, and a battle
 * does not wait for players who are away: once everyone still around has
 * finished, it ends, and the away player's game ends where they left it. Long
 * enough for a phone call or a look at the dictionary, short enough that
 * nobody sits on "waiting for the others" for long.
 */
export const AWAY_SECONDS = 120;

/** `last_seen_at` is written at most this often per player. */
const SEEN_EVERY_SECONDS = 15;

export type CreateResult = { ok: true; battle: BattleState } | { ok: false; reason: 'empty-pool' | 'open-needs-adult' };
export type JoinResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: 'not-found' | 'not-open' | 'full' | 'already-joined' };
export type StartResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'not-lobby' | 'need-two' };
export type GuessResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: GuessRejection | 'not-found' | 'not-active' | 'finished' | 'not-in-match' };
export type ReadResult = { ok: true; battle: BattleState } | { ok: false; reason: 'not-found' | 'started' };
export type LeaveResult = { ok: true } | { ok: false; reason: 'not-found' };
export type RemoveResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'not-lobby' | 'no-seat' };
export type NextResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not-found' | 'not-finished' | 'not-pair' | 'forbidden' | 'empty-pool' };

/** Opponent info shown mid-match: progress + finish status only, never letters. */
export interface OpponentView {
  /** `seat:N` — never another player's account id */
  userId: string;
  seat: number;
  /** null unless the viewer may see it (a friend, or anyone in an open battle): "Opponent N" */
  name: string | null;
  avatarUrl: string | null;
  guessCount: number;
  solved: boolean;
  status: GameStatus;
  progress: number;
  finished: boolean;
  /** left the battle */
  gone: boolean;
}

/** A player's own live match view (their guesses carry feedback, not the target). */
export interface BattleState {
  id: string;
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  difficulty: Difficulty;
  targetLength: number;
  maxPlayers: number;
  /** the host: the viewer's own id when they host, else the host's `seat:N` */
  createdBy: string;
  isHost: boolean;
  access: GameAccess;
  /** when an active battle ends on its own */
  endsAt: string | null;
  /** the rematch or next round, once there is one */
  nextLobbyId: string | null;
  /** everyone in it, by seat, as this viewer may see them */
  players: SeatPlayer[];
  me: {
    seat: number;
    guesses: GuessRow[];
    keyboard: Record<string, import('./wordle.js').LetterFeedback>;
    status: GameStatus;
    solved: boolean;
    remainingAttempts: number;
  } | null;
  opponents: OpponentView[];
  /** revealed only once the whole match is finished */
  target: string | null;
}

/** Post-match reveal: everyone's full guess history + the word + placement + XP. */
export interface BattleResults {
  id: string;
  target: string;
  difficulty: Difficulty;
  ranking: Array<{
    /** the viewer's own id on their own row, `seat:N` on everyone else's */
    userId: string;
    seat: number;
    name: string | null;
    avatarUrl: string | null;
    isMe: boolean;
    rank: number;
    solved: boolean;
    guessCount: number;
    timeMs: number | null;
    progress: number;
    xpAwarded: number | null;
    guesses: GuessRow[];
  }>;
}

interface BattleRow extends LobbyRow {
  difficulty: Difficulty;
  target: string;
  target_length: number;
  started_at: Date | null;
  finished_at: Date | null;
  ends_at: Date | null;
}
interface PlayerRow extends SeatRow {
  battle_id: string;
  guesses: GuessRow[];
  status: GameStatus;
  solved: boolean;
  guess_count: number;
  progress: number;
  time_ms: number | null;
  xp_awarded: number | null;
  finished_at: Date | null;
}

export interface WordleBattleDeps {
  xp?: XpService;
  now?: () => Date;
  /**
   * Called after every change is committed (the play module's `play_changed`,
   * which replaced the clients' fast polling). `also` names someone no longer
   * in the battle who should hear about it once — a player just removed;
   * `card: false` marks a guess that ended nothing, which no chat card shows.
   */
  onChange?: (battleId: string, opts?: LobbyChange) => void;
  /** turns an uploaded profile photo's key into its URL, for the players' faces */
  publicUrl?: PublicUrl;
}

/** best count of green letters across a player's guesses (for ranking non-solvers) */
function greenProgress(guesses: GuessRow[]): number {
  let best = 0;
  for (const g of guesses) {
    const greens = g.feedback.filter((f) => f === 'green').length;
    if (greens > best) best = greens;
  }
  return best;
}

const minutesAfter = (at: Date, minutes: number): Date => new Date(at.getTime() + minutes * 60_000);

/**
 * Wordle Battle mode (KUR-306) — server-authoritative match service. Every player
 * races the same server-held word; guesses are scored here (via the #303 engine)
 * and only a player's own feedback + opponents' progress are ever returned.
 * Placement (first-solve → fewest-guesses → fastest-time) and XP are computed by
 * the pure `wordle-battle.ts` ranker when the last player finishes. Poll-safe, so
 * the flow is fully integration-testable without the realtime gateway.
 *
 * Who may join, and what players see of each other, follow the rules every
 * online game shares (play/access.ts): the host's friends (or any adult, in an
 * open battle), never across a block, and other players known by their seat —
 * by name only to their friends. Members only: everyone else is told the
 * battle does not exist. A battle ends at `ends_at` or once nobody still
 * racing is around, so a closed tab cannot hang it; a lobby nobody starts
 * closes after half an hour.
 */
export class WordleBattleService {
  private readonly xp: XpService;
  private readonly now: () => Date;
  private readonly onChange: (battleId: string, opts?: LobbyChange) => void;
  private readonly publicUrl: PublicUrl;

  constructor(private readonly pool: pg.Pool, deps: WordleBattleDeps = {}) {
    this.xp = deps.xp ?? new XpService(pool);
    this.now = deps.now ?? (() => new Date());
    this.onChange = deps.onChange ?? (() => undefined);
    this.publicUrl = deps.publicUrl ?? (() => null);
  }

  async create(
    userId: string,
    opts: { difficulty: Difficulty; maxPlayers?: number; access?: GameAccess; chatGroupId?: string | null },
  ): Promise<CreateResult> {
    const access = opts.access ?? 'friends';
    if (access === 'open' && !(await mayHostOpen(this.pool, userId))) return { ok: false, reason: 'open-needs-adult' };
    const picked = await this.pickTarget(opts.difficulty);
    if (!picked) return { ok: false, reason: 'empty-pool' };
    const maxPlayers = Math.min(8, Math.max(2, opts.maxPlayers ?? 8));
    const id = await this.tx(async (client) => {
      const b = await client.query<BattleRow>(
        `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, max_players, access, chat_group_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [userId, picked.difficulty, picked.target, toLetters(picked.target).length, maxPlayers, access, opts.chatGroupId ?? null, this.now()],
      );
      await client.query(`INSERT INTO wordle_battle_players (battle_id, user_id, seat) VALUES ($1,$2,1)`, [b.rows[0]!.id, userId]);
      return b.rows[0]!.id;
    });
    this.changed(id);
    return { ok: true, battle: await this.state(id, userId) };
  }

  /**
   * Join an open lobby. Every refusal the join rule makes — not allowed,
   * removed, called off — is the same 'not-found' as a battle that does not
   * exist, and comes before 'not-open' and 'full', so those two are only ever
   * told to someone who could have joined.
   */
  async join(battleId: string, userId: string): Promise<JoinResult> {
    const now = this.now();
    let cancelled = false;
    const res = await this.tx<JoinResult | null>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, battleId);
      const mine = seats.find((s) => s.user_id === userId);
      if (mine && !mine.removed) return { ok: false, reason: 'already-joined' };
      if (battle.status === 'cancelled') return { ok: false, reason: 'not-found' };
      if (lobbyIdle(battle, now)) {
        await this.cancelLobby(client, battleId, now);
        cancelled = true;
        return { ok: false, reason: 'not-found' };
      }
      if (!(await mayJoin(client, battle, seats, userId))) return { ok: false, reason: 'not-found' };
      if (battle.status !== 'lobby') return { ok: false, reason: 'not-open' };
      if (present(seats).length >= battle.max_players) return { ok: false, reason: 'full' };
      const seat = await nextSeat(client, T, battleId);
      await client.query(`INSERT INTO wordle_battle_players (battle_id, user_id, seat) VALUES ($1,$2,$3)`, [battleId, userId, seat]);
      await client.query(`UPDATE wordle_battles SET updated_at = $2 WHERE id = $1`, [battleId, now]);
      return null;
    });
    if (cancelled) this.changed(battleId);
    if (res) return res;
    this.changed(battleId);
    return { ok: true, battle: await this.state(battleId, userId) };
  }

  /** The creator starts the match once ≥2 players have joined (lobby → active). */
  async start(battleId: string, userId: string): Promise<StartResult> {
    const now = this.now();
    const res = await this.tx<StartResult | null>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, battleId);
      if (!present(seats).some((s) => s.user_id === userId)) return { ok: false, reason: 'not-found' };
      if (battle.created_by !== userId) return { ok: false, reason: 'forbidden' };
      if (battle.status !== 'lobby' || lobbyIdle(battle, now)) return { ok: false, reason: 'not-lobby' };
      if (present(seats).length < 2) return { ok: false, reason: 'need-two' };
      await client.query(
        `UPDATE wordle_battles SET status = 'active', started_at = $2, ends_at = $3, updated_at = $2 WHERE id = $1`,
        [battleId, now, minutesAfter(now, BATTLE_MINUTES)],
      );
      // everyone starts out present: away is measured from here
      await client.query(`UPDATE wordle_battle_players SET last_seen_at = $2 WHERE battle_id = $1 AND NOT removed`, [battleId, now]);
      return null;
    });
    if (res) return res;
    this.changed(battleId);
    return { ok: true, battle: await this.state(battleId, userId) };
  }

  async guess(battleId: string, userId: string, word: string): Promise<GuessResult> {
    const now = this.now();
    let over = false;
    const res = await this.tx<GuessResult | 'ended' | null>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      const p = await client.query<PlayerRow>(`SELECT * FROM wordle_battle_players WHERE battle_id = $1 AND user_id = $2 FOR UPDATE`, [battleId, userId]);
      const player = p.rows[0];
      // to anyone not in it, the battle does not exist
      if (!player || player.removed) return { ok: false, reason: 'not-found' };
      if (battle.status === 'finished') return { ok: false, reason: 'finished' };
      if (battle.status !== 'active') return { ok: false, reason: 'not-active' };
      if (player.left_at) return { ok: false, reason: 'not-in-match' };
      // time is up: the battle ends now, and this guess is not part of it
      if (battle.ends_at && now >= battle.ends_at) {
        await this.finalize(client, battleId, now);
        return 'ended';
      }
      if (player.status !== 'playing') return { ok: false, reason: 'finished' };

      const game = this.rehydrate(battle, player);
      const normalized = normalizeWord(word);
      const dict = new InMemoryDictionary((await this.wordExists(client, normalized)) ? [normalized] : []);
      const applied = applyGuess(game, battle.target, word, dict);
      if (!applied.ok) return { ok: false, reason: applied.reason };

      const next = applied.game;
      const finished = next.status !== 'playing';
      const startedAt = battle.started_at ?? now;
      const timeMs = finished ? Math.max(0, now.getTime() - startedAt.getTime()) : null;

      await client.query(
        `UPDATE wordle_battle_players
         SET guesses = $3::jsonb, status = $4, solved = $5, guess_count = $6, progress = $7,
             time_ms = COALESCE($8, time_ms),
             finished_at = CASE WHEN $9::boolean THEN $10 ELSE finished_at END,
             last_seen_at = $10
         WHERE battle_id = $1 AND user_id = $2`,
        [battleId, userId, JSON.stringify(next.guesses), next.status, next.status === 'won', next.guesses.length, greenProgress(next.guesses), timeMs, finished, now],
      );

      // finalize when nobody still racing is left: everyone else won, ran out
      // of guesses, left, or is away
      if (finished && (await this.racing(client, battleId, now)) === 0) {
        await this.finalize(client, battleId, now);
        over = true;
      }
      return null;
    });
    if (res === 'ended') {
      this.changed(battleId);
      return { ok: false, reason: 'finished' };
    }
    if (res) return res;
    // a guess moves the guesser's own progress, which no chat card shows —
    // unless it ended the battle
    this.changed(battleId, { card: over });
    return { ok: true, battle: await this.state(battleId, userId) };
  }

  /**
   * `GET /wordle/battles/:id`: a member's live view. Someone the join rule
   * would let in sees an open lobby before joining it (installed phone builds
   * open an invite link this way), and is told 'started' about one already
   * under way — a latecomer's "this battle has already started". Everyone else
   * is told it does not exist.
   */
  async read(battleId: string, userId: string): Promise<ReadResult> {
    const now = this.now();
    const b = await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId]);
    const battle = b.rows[0];
    if (!battle) return { ok: false, reason: 'not-found' };
    const seats = await seatsOf(this.pool, T, battleId);
    const mine = seats.find((s) => s.user_id === userId && !s.removed);
    if (mine) {
      await this.settle(battle, userId, now);
      return { ok: true, battle: await this.state(battleId, userId) };
    }
    if (!(await mayJoin(this.pool, battle, seats, userId))) return { ok: false, reason: 'not-found' };
    if (battle.status === 'lobby' && !lobbyIdle(battle, now)) return { ok: true, battle: await this.state(battleId, userId) };
    if (battle.status === 'active' || battle.status === 'finished') return { ok: false, reason: 'started' };
    return { ok: false, reason: 'not-found' };
  }

  /**
   * Leave. Out of a lobby: a player's row goes (they never played); the host
   * leaving calls the lobby off, since who could join was decided against
   * them. Out of a battle under way: marked gone and finished where they
   * stand — the battle stops waiting for them — and they can still read it.
   */
  async leave(battleId: string, userId: string): Promise<LeaveResult> {
    const now = this.now();
    const res = await this.tx<LeaveResult>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, battleId);
      const mine = seats.find((s) => s.user_id === userId && !s.removed);
      if (!mine) return { ok: false, reason: 'not-found' };
      if (battle.status === 'lobby') {
        if (battle.created_by === userId) await this.cancelLobby(client, battleId, now);
        else {
          await client.query(`DELETE FROM wordle_battle_players WHERE battle_id = $1 AND user_id = $2`, [battleId, userId]);
          await client.query(`UPDATE wordle_battles SET updated_at = $2 WHERE id = $1`, [battleId, now]);
        }
      } else if (battle.status === 'active' && mine.left_at === null) {
        await client.query(
          `UPDATE wordle_battle_players
              SET left_at = $3,
                  status = CASE WHEN status = 'playing' THEN 'lost' ELSE status END,
                  finished_at = COALESCE(finished_at, $3)
            WHERE battle_id = $1 AND user_id = $2`,
          [battleId, userId, now],
        );
        if ((await this.racing(client, battleId, now)) === 0) await this.finalize(client, battleId, now);
      }
      return { ok: true };
    });
    if (res.ok) this.changed(battleId);
    return res;
  }

  /**
   * The host takes a player out of the lobby, by seat — the only handle a
   * host has on anyone. The row stays, marked, so they cannot simply join
   * again; to them the battle no longer exists. Not once it has started:
   * there, a player who is gone is waited for by nobody anyway.
   */
  async remove(battleId: string, hostId: string, seat: number): Promise<RemoveResult> {
    const now = this.now();
    let removed: string | null = null;
    const res = await this.tx<RemoveResult | null>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, battleId);
      if (!seats.some((s) => s.user_id === hostId && !s.removed)) return { ok: false, reason: 'not-found' };
      if (battle.created_by !== hostId) return { ok: false, reason: 'forbidden' };
      if (battle.status !== 'lobby' || lobbyIdle(battle, now)) return { ok: false, reason: 'not-lobby' };
      const target = seats.find((s) => s.seat === seat && !s.removed);
      if (!target || target.user_id === hostId) return { ok: false, reason: 'no-seat' };
      await client.query(`UPDATE wordle_battle_players SET removed = true WHERE battle_id = $1 AND user_id = $2`, [battleId, target.user_id]);
      await client.query(`UPDATE wordle_battles SET updated_at = $2 WHERE id = $1`, [battleId, now]);
      removed = target.user_id;
      return null;
    });
    if (res) return res;
    this.changed(battleId, removed ? { also: [removed] } : undefined);
    return { ok: true, battle: await this.state(battleId, hostId) };
  }

  /**
   * A player's view, as `userId` may see it: their own guesses, everyone
   * else's progress (never their letters) by seat. Callers decide who may
   * have it (`read`); this only builds it.
   */
  async state(battleId: string, userId: string): Promise<BattleState> {
    const b = await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId]);
    const battle = b.rows[0]!;
    const rows = await this.pool.query<PlayerRow>(
      `SELECT * FROM wordle_battle_players WHERE battle_id = $1 AND NOT removed ORDER BY seat`,
      [battleId],
    );
    const players = await seatPlayers(this.pool, battle, rows.rows, userId, this.publicUrl);
    const bySeat = new Map(players.map((p) => [p.seat, p]));
    const mine = rows.rows.find((r) => r.user_id === userId) ?? null;
    return {
      id: battle.id,
      status: battle.status,
      difficulty: battle.difficulty,
      targetLength: battle.target_length,
      maxPlayers: battle.max_players,
      createdBy: hostRef(battle, rows.rows, userId),
      isHost: battle.created_by === userId,
      access: battle.access,
      endsAt: battle.status === 'active' && battle.ends_at ? battle.ends_at.toISOString() : null,
      nextLobbyId: battle.next_lobby_id,
      players,
      me: mine
        ? {
            seat: mine.seat,
            guesses: mine.guesses,
            keyboard: keyboardFromGuesses(mine.guesses),
            status: mine.status,
            solved: mine.solved,
            remainingAttempts: Math.max(0, MAX_ATTEMPTS - mine.guess_count),
          }
        : null,
      opponents: rows.rows
        .filter((r) => r.user_id !== userId)
        .map((r) => ({
          userId: seatId(r.seat),
          seat: r.seat,
          name: bySeat.get(r.seat)?.name ?? null,
          avatarUrl: bySeat.get(r.seat)?.avatarUrl ?? null,
          guessCount: r.guess_count,
          solved: r.solved,
          status: r.status,
          progress: r.progress,
          finished: r.status !== 'playing',
          gone: r.left_at !== null,
        })),
      target: battle.status === 'finished' ? battle.target : null,
    };
  }

  /**
   * Post-match results (finished only): all histories + word + placement + XP.
   * Scoped to participants — a non-participant gets `null` (never another match's
   * guess histories / answer word), same as an unknown id (BOLA protection).
   */
  async results(battleId: string, userId: string): Promise<BattleResults | null> {
    const b = await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId]);
    const battle = b.rows[0];
    if (!battle || battle.status !== 'finished') return null;
    const players = await this.pool.query<PlayerRow>(
      `SELECT * FROM wordle_battle_players WHERE battle_id = $1 AND NOT removed ORDER BY seat`,
      [battleId],
    );
    if (!players.rows.some((r) => r.user_id === userId)) return null; // participants only
    const ranked = rankBattle(players.rows.map((r) => this.toBattleResult(r)));
    const byId = new Map(players.rows.map((r) => [r.user_id, r]));
    const seen = new Map((await seatPlayers(this.pool, battle, players.rows, userId, this.publicUrl)).map((p) => [p.seat, p]));
    return {
      id: battle.id,
      target: battle.target,
      difficulty: battle.difficulty,
      ranking: ranked.map((r) => {
        const row = byId.get(r.userId)!;
        const who = seen.get(row.seat)!;
        return {
          userId: who.userId,
          seat: row.seat,
          name: who.name,
          avatarUrl: who.avatarUrl,
          isMe: who.isMe,
          rank: r.rank,
          solved: r.solved,
          guessCount: r.guesses,
          timeMs: row.time_ms,
          progress: r.progress,
          xpAwarded: row.xp_awarded,
          guesses: row.guesses,
        };
      }),
    };
  }

  /** In the battle (still there or gone), and not removed by the host. */
  async isMember(battleId: string, userId: string): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT 1 FROM wordle_battle_players WHERE battle_id = $1 AND user_id = $2 AND NOT removed`,
      [battleId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  // ---- playing again ----------------------------------------------------------

  /**
   * A two-player rematch both asked for (the play module keeps the offers): a
   * new battle with the same settings and both of them in it, started at once
   * — they both chose it. Still the join rule's call: a block since, or a
   * group one of them left, means no rematch. Asking twice gives the same one.
   */
  async startPairRematch(battleId: string): Promise<NextResult> {
    const old = (await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId])).rows[0];
    if (!old) return { ok: false, reason: 'not-found' };
    const picked = old.next_lobby_id ? null : await this.pickTarget(old.difficulty);
    const now = this.now();
    let created: string | null = null;
    const res = await this.tx<NextResult>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      if (battle.next_lobby_id) return { ok: true, id: battle.next_lobby_id };
      if (battle.status !== 'finished') return { ok: false, reason: 'not-finished' };
      const pair = inGame(await seatsOf(client, T, battleId));
      if (pair.length !== 2) return { ok: false, reason: 'not-pair' };
      if (!picked) return { ok: false, reason: 'empty-pool' };
      const host = pair.find((s) => s.user_id === battle.created_by) ?? pair[0]!;
      const other = pair.find((s) => s !== host)!;
      const access: GameAccess = battle.access === 'open' && (await mayHostOpen(client, host.user_id)) ? 'open' : 'friends';
      const allowed = await canJoin(client, {
        joinerId: other.user_id,
        hostId: host.user_id,
        access,
        memberIds: [host.user_id],
        chatGroupId: battle.chat_group_id,
        removed: false,
      });
      if (!allowed) return { ok: false, reason: 'not-found' };
      const b = await client.query<{ id: string }>(
        `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, max_players, access, chat_group_id,
                                     rematch_of, status, started_at, ends_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$9) RETURNING id`,
        [host.user_id, picked.difficulty, picked.target, toLetters(picked.target).length, battle.max_players, access,
          battle.chat_group_id, battleId, now, minutesAfter(now, BATTLE_MINUTES)],
      );
      created = b.rows[0]!.id;
      await client.query(
        `INSERT INTO wordle_battle_players (battle_id, user_id, seat, last_seen_at) VALUES ($1,$2,1,$4), ($1,$3,2,$4)`,
        [created, host.user_id, other.user_id, now],
      );
      await client.query(`UPDATE wordle_battles SET next_lobby_id = $2, updated_at = $3 WHERE id = $1`, [battleId, created, now]);
      return { ok: true, id: created };
    });
    if (created) {
      this.changed(battleId);
      this.changed(created);
    }
    return res;
  }

  /**
   * A bigger battle's "Play again": the host opens the next round — a new
   * lobby, same settings, only the host in it. Everyone else sees it on their
   * results and joins with one tap, through the join rule like any lobby;
   * nobody is put into a game they did not choose. Asking twice gives the
   * same round.
   */
  async openNextRound(hostId: string, battleId: string): Promise<NextResult> {
    const old = (await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId])).rows[0];
    if (!old) return { ok: false, reason: 'not-found' };
    const picked = old.next_lobby_id ? null : await this.pickTarget(old.difficulty);
    const now = this.now();
    let created: string | null = null;
    const res = await this.tx<NextResult>(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, battleId);
      if (!seats.some((s) => s.user_id === hostId && !s.removed)) return { ok: false, reason: 'not-found' };
      if (battle.next_lobby_id) return { ok: true, id: battle.next_lobby_id };
      if (battle.status !== 'finished') return { ok: false, reason: 'not-finished' };
      if (battle.created_by !== hostId) return { ok: false, reason: 'forbidden' };
      if (!picked) return { ok: false, reason: 'empty-pool' };
      const access: GameAccess = battle.access === 'open' && (await mayHostOpen(client, hostId)) ? 'open' : 'friends';
      const b = await client.query<{ id: string }>(
        `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, max_players, access, chat_group_id, rematch_of, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [hostId, picked.difficulty, picked.target, toLetters(picked.target).length, battle.max_players, access,
          battle.chat_group_id, battleId, now],
      );
      created = b.rows[0]!.id;
      await client.query(`INSERT INTO wordle_battle_players (battle_id, user_id, seat) VALUES ($1,$2,1)`, [created, hostId]);
      await client.query(`UPDATE wordle_battles SET next_lobby_id = $2, updated_at = $3 WHERE id = $1`, [battleId, created, now]);
      return { ok: true, id: created };
    });
    if (created) {
      this.changed(battleId);
      this.changed(created);
    }
    return res;
  }

  /** Wins between two players over a run of rematches ending in this battle. */
  async series(battleId: string, me: string, other: string): Promise<Series> {
    const chain = await rematchChain(this.pool, T, battleId);
    const rows = await this.pool.query<PlayerRow>(
      `SELECT p.* FROM wordle_battle_players p JOIN wordle_battles b ON b.id = p.battle_id
        WHERE p.battle_id = ANY($1::uuid[]) AND b.status = 'finished' AND NOT p.removed`,
      [chain],
    );
    const byBattle = new Map<string, PlayerRow[]>();
    for (const r of rows.rows) byBattle.set(r.battle_id, [...(byBattle.get(r.battle_id) ?? []), r]);
    return tallySeries(
      [...byBattle.values()].map((players) => ({
        players: players.map((p) => p.user_id),
        winners: rankBattle(players.map((p) => this.toBattleResult(p)))
          .filter((r) => r.rank === 1)
          .map((r) => r.userId),
      })),
      me,
      other,
    );
  }

  // ---- for the play layer -----------------------------------------------------

  async facts(battleId: string): Promise<LobbyFacts | null> {
    return loadFacts(this.pool, T, battleId, this.now());
  }

  async summary(battleId: string): Promise<InviteSummary | null> {
    const b = await this.pool.query<{ difficulty: Difficulty }>(`SELECT difficulty FROM wordle_battles WHERE id = $1`, [battleId]);
    return b.rows[0] ? { difficulty: b.rows[0].difficulty } : null;
  }

  async card(viewerId: string, battleId: string): Promise<LobbyCard> {
    return lobbyCard(this.pool, T, viewerId, battleId, (await this.summary(battleId)) ?? {}, this.now());
  }

  /** A host still inviting people keeps the lobby from idling out. */
  async touch(battleId: string): Promise<void> {
    await this.pool.query(`UPDATE wordle_battles SET updated_at = $2 WHERE id = $1 AND status = 'lobby'`, [battleId, this.now()]);
  }

  /**
   * Run on a timer: close lobbies nobody started, and end battles that are
   * over — out of time, or with nobody still racing around — when nobody's
   * poll got there first.
   */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const id of await cancelIdleLobbies(this.pool, T, now)) this.changed(id);
    const due = await this.pool.query<{ id: string }>(
      `SELECT b.id FROM wordle_battles b
        WHERE b.status = 'active'
          AND (b.ends_at <= $1 OR NOT EXISTS (
                SELECT 1 FROM wordle_battle_players p
                 WHERE p.battle_id = b.id AND p.status = 'playing' AND p.left_at IS NULL AND NOT p.removed
                   AND p.last_seen_at >= $1::timestamptz - ($2 || ' seconds')::interval))
        LIMIT 200`,
      [now, String(AWAY_SECONDS)],
    );
    for (const r of due.rows) await this.finalizeIfDue(r.id);
  }

  // ---- internals ------------------------------------------------------------

  /**
   * What a member's read does besides reading: note they are here (at most
   * every 15 s), end the battle if it is over, close the lobby if it idled
   * out. A plain read first, so the common case takes no lock.
   */
  private async settle(battle: BattleRow, userId: string, now: Date): Promise<void> {
    if (battle.status === 'lobby' && lobbyIdle(battle, now)) {
      const closed = await this.pool.query(
        `UPDATE wordle_battles SET status = 'cancelled', finished_at = $3, updated_at = $3
          WHERE id = $1 AND status = 'lobby' AND updated_at = $2`,
        [battle.id, battle.updated_at, now],
      );
      if (closed.rowCount) this.changed(battle.id);
      return;
    }
    if (battle.status !== 'active') return;
    await this.pool.query(
      `UPDATE wordle_battle_players SET last_seen_at = $3
        WHERE battle_id = $1 AND user_id = $2
          AND (last_seen_at IS NULL OR last_seen_at < $3::timestamptz - ($4 || ' seconds')::interval)`,
      [battle.id, userId, now, String(SEEN_EVERY_SECONDS)],
    );
    if ((battle.ends_at && now >= battle.ends_at) || (await this.racing(this.pool, battle.id, now)) === 0) {
      await this.finalizeIfDue(battle.id);
    }
  }

  /** Ends the battle if it is over, judged again on the locked row. */
  private async finalizeIfDue(battleId: string): Promise<void> {
    const now = this.now();
    const ended = await this.tx(async (client) => {
      const battle = await this.lock(client, battleId);
      if (!battle || battle.status !== 'active') return false;
      const over = (battle.ends_at !== null && now >= battle.ends_at) || (await this.racing(client, battleId, now)) === 0;
      if (over) await this.finalize(client, battleId, now);
      return over;
    });
    if (ended) this.changed(battleId);
  }

  /** Players still racing: not finished, not gone, and heard from lately. */
  private async racing(executor: Pick<pg.Pool, 'query'>, battleId: string, now: Date): Promise<number> {
    const r = await executor.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM wordle_battle_players
        WHERE battle_id = $1 AND status = 'playing' AND left_at IS NULL AND NOT removed
          AND last_seen_at >= $2::timestamptz - ($3 || ' seconds')::interval`,
      [battleId, now, String(AWAY_SECONDS)],
    );
    return r.rows[0]!.n;
  }

  /**
   * Rank the finished match, award placement XP idempotently, close the battle.
   * Anyone still 'playing' — away, or out of time — finishes where they are,
   * unsolved.
   */
  private async finalize(client: pg.PoolClient, battleId: string, now: Date): Promise<void> {
    await client.query(
      `UPDATE wordle_battle_players SET status = 'lost', finished_at = $2
        WHERE battle_id = $1 AND status = 'playing' AND NOT removed`,
      [battleId, now],
    );
    const players = await client.query<PlayerRow>(`SELECT * FROM wordle_battle_players WHERE battle_id = $1 AND NOT removed`, [battleId]);
    const ranked = rankBattle(players.rows.map((r) => this.toBattleResult(r)));
    const count = ranked.length;
    for (const r of ranked) {
      const xp = placementXp(r.rank, count);
      await this.xp.award({ userId: r.userId, source: 'wordle_battle', amount: xp, refId: `battle:${battleId}:${r.userId}` }, client);
      await client.query(`UPDATE wordle_battle_players SET xp_awarded = $3 WHERE battle_id = $1 AND user_id = $2`, [battleId, r.userId, xp]);
    }
    await client.query(`UPDATE wordle_battles SET status = 'finished', finished_at = $2, updated_at = $2 WHERE id = $1`, [battleId, now]);
  }

  /** A lobby called off: by its host leaving, or by nobody starting it. */
  private async cancelLobby(client: pg.PoolClient, battleId: string, now: Date): Promise<void> {
    await client.query(
      `UPDATE wordle_battles SET status = 'cancelled', finished_at = $2, updated_at = $2 WHERE id = $1 AND status = 'lobby'`,
      [battleId, now],
    );
  }

  private async lock(client: pg.PoolClient, battleId: string): Promise<BattleRow | null> {
    const b = await client.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1 FOR UPDATE`, [battleId]);
    return b.rows[0] ?? null;
  }

  private async tx<R>(fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private changed(battleId: string, opts?: LobbyChange): void {
    try {
      this.onChange(battleId, opts);
    } catch {
      // telling the players is never a reason to fail what they did
    }
  }

  private toBattleResult(r: PlayerRow): BattlePlayerResult {
    return { userId: r.user_id, solved: r.solved, guesses: r.guess_count, timeMs: r.time_ms ?? Number.MAX_SAFE_INTEGER, progress: r.progress };
  }

  private rehydrate(battle: BattleRow, player: PlayerRow): WordleGame {
    const base = initGame(battle.target_length);
    return { ...base, status: player.status, guesses: player.guesses, keyboard: keyboardFromGuesses(player.guesses) };
  }

  /**
   * Is this a word at all?
   *
   * Looked up by the folded key, not the one the guess was normalized with.
   * Almost every Kurmancî word carries a ç ê î ş or û, and an imported lexicon
   * stores those folded (1751000115000) — matching on the unfolded key would
   * reject hundreds of thousands of real words. A missing word is a correct
   * answer thrown out, which is the more annoying failure of the two.
   */
  private async wordExists(client: pg.PoolClient, normalized: string): Promise<boolean> {
    if (!normalized) return false;
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM dict_entries WHERE headword_folded = $1) AS exists`,
      [dictionaryKey(normalized)],
    );
    return res.rows[0]?.exists ?? false;
  }

  private async pickTarget(difficulty: Difficulty): Promise<{ target: string; difficulty: Difficulty } | null> {
    const order = [difficulty, ...HARDER_TO_EASIER.filter((d) => d !== difficulty)];
    // in_games only; guess validation stays over the whole dictionary
    const all = await this.pool.query<{ headword: string }>(
      `SELECT headword FROM dict_entries WHERE in_games ORDER BY id`,
    );
    const words = all.rows.map((r) => r.headword);
    for (const tier of order) {
      const pool = filterByDifficulty(words, tier);
      if (pool.length > 0) return { target: pool[Math.floor(Math.random() * pool.length)]!, difficulty: tier };
    }
    return null;
  }
}
