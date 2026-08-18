import type pg from 'pg';
import { XpService } from '../xp/service.js';
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

export type CreateResult = { ok: true; battle: BattleState } | { ok: false; reason: 'empty-pool' };
export type JoinResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: 'not-found' | 'not-open' | 'full' | 'already-joined' };
export type StartResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'not-lobby' | 'need-two' };
export type GuessResult =
  | { ok: true; battle: BattleState }
  | { ok: false; reason: GuessRejection | 'not-found' | 'not-active' | 'finished' | 'not-in-match' };

/** Opponent info shown mid-match: progress + finish status only, never letters. */
export interface OpponentView {
  userId: string;
  guessCount: number;
  solved: boolean;
  status: GameStatus;
  progress: number;
  finished: boolean;
}

/** A player's own live match view (their guesses carry feedback, not the target). */
export interface BattleState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  difficulty: Difficulty;
  targetLength: number;
  maxPlayers: number;
  createdBy: string;
  me: {
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
    userId: string;
    rank: number;
    solved: boolean;
    guessCount: number;
    timeMs: number | null;
    progress: number;
    xpAwarded: number | null;
    guesses: GuessRow[];
  }>;
}

interface BattleRow {
  id: string;
  created_by: string;
  difficulty: Difficulty;
  target: string;
  target_length: number;
  max_players: number;
  status: 'lobby' | 'active' | 'finished';
  started_at: Date | null;
  finished_at: Date | null;
}
interface PlayerRow {
  battle_id: string;
  user_id: string;
  guesses: GuessRow[];
  status: GameStatus;
  solved: boolean;
  guess_count: number;
  progress: number;
  time_ms: number | null;
  xp_awarded: number | null;
  finished_at: Date | null;
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

/**
 * Wordle Battle mode (KUR-306) — server-authoritative match service. Every player
 * races the same server-held word; guesses are scored here (via the #303 engine)
 * and only a player's own feedback + opponents' progress are ever returned.
 * Placement (first-solve → fewest-guesses → fastest-time) and XP are computed by
 * the pure `wordle-battle.ts` ranker when the last player finishes. Poll-safe, so
 * the flow is fully integration-testable without the realtime gateway.
 */
export class WordleBattleService {
  private readonly xp: XpService;
  private readonly now: () => Date;

  constructor(private readonly pool: pg.Pool, deps: { xp?: XpService; now?: () => Date } = {}) {
    this.xp = deps.xp ?? new XpService(pool);
    this.now = deps.now ?? (() => new Date());
  }

  async create(userId: string, opts: { difficulty: Difficulty; maxPlayers?: number }): Promise<CreateResult> {
    const picked = await this.pickTarget(opts.difficulty);
    if (!picked) return { ok: false, reason: 'empty-pool' };
    const maxPlayers = Math.min(8, Math.max(2, opts.maxPlayers ?? 8));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const b = await client.query<BattleRow>(
        `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, max_players)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [userId, picked.difficulty, picked.target, toLetters(picked.target).length, maxPlayers],
      );
      await client.query(`INSERT INTO wordle_battle_players (battle_id, user_id) VALUES ($1,$2)`, [b.rows[0]!.id, userId]);
      await client.query('COMMIT');
      return { ok: true, battle: await this.state(b.rows[0]!.id, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async join(battleId: string, userId: string): Promise<JoinResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const b = await client.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1 FOR UPDATE`, [battleId]);
      const battle = b.rows[0];
      if (!battle) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (battle.status !== 'lobby') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-open' }; }
      const players = await client.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM wordle_battle_players WHERE battle_id = $1`, [battleId]);
      const already = await client.query(`SELECT 1 FROM wordle_battle_players WHERE battle_id = $1 AND user_id = $2`, [battleId, userId]);
      if ((already.rowCount ?? 0) > 0) { await client.query('ROLLBACK'); return { ok: false, reason: 'already-joined' }; }
      if (Number(players.rows[0]!.count) >= battle.max_players) { await client.query('ROLLBACK'); return { ok: false, reason: 'full' }; }
      await client.query(`INSERT INTO wordle_battle_players (battle_id, user_id) VALUES ($1,$2)`, [battleId, userId]);
      await client.query('COMMIT');
      return { ok: true, battle: await this.state(battleId, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** The creator starts the match once ≥2 players have joined (lobby → active). */
  async start(battleId: string, userId: string): Promise<StartResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const b = await client.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1 FOR UPDATE`, [battleId]);
      const battle = b.rows[0];
      if (!battle) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (battle.created_by !== userId) { await client.query('ROLLBACK'); return { ok: false, reason: 'forbidden' }; }
      if (battle.status !== 'lobby') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-lobby' }; }
      const players = await client.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM wordle_battle_players WHERE battle_id = $1`, [battleId]);
      if (Number(players.rows[0]!.count) < 2) { await client.query('ROLLBACK'); return { ok: false, reason: 'need-two' }; }
      await client.query(`UPDATE wordle_battles SET status = 'active', started_at = now() WHERE id = $1`, [battleId]);
      await client.query('COMMIT');
      return { ok: true, battle: await this.state(battleId, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async guess(battleId: string, userId: string, word: string): Promise<GuessResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const b = await client.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1 FOR UPDATE`, [battleId]);
      const battle = b.rows[0];
      if (!battle) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (battle.status === 'finished') { await client.query('ROLLBACK'); return { ok: false, reason: 'finished' }; }
      if (battle.status !== 'active') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-active' }; }

      const p = await client.query<PlayerRow>(`SELECT * FROM wordle_battle_players WHERE battle_id = $1 AND user_id = $2 FOR UPDATE`, [battleId, userId]);
      const player = p.rows[0];
      if (!player) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-in-match' }; }
      if (player.status !== 'playing') { await client.query('ROLLBACK'); return { ok: false, reason: 'finished' }; }

      const game = this.rehydrate(battle, player);
      const normalized = normalizeWord(word);
      const dict = new InMemoryDictionary((await this.wordExists(client, normalized)) ? [normalized] : []);
      const applied = applyGuess(game, battle.target, word, dict);
      if (!applied.ok) { await client.query('ROLLBACK'); return { ok: false, reason: applied.reason }; }

      const next = applied.game;
      const finished = next.status !== 'playing';
      const startedAt = battle.started_at ?? this.now();
      const timeMs = finished ? Math.max(0, this.now().getTime() - startedAt.getTime()) : null;

      await client.query(
        `UPDATE wordle_battle_players
         SET guesses = $3::jsonb, status = $4, solved = $5, guess_count = $6, progress = $7,
             time_ms = COALESCE($8, time_ms),
             finished_at = CASE WHEN $9::boolean THEN now() ELSE finished_at END
         WHERE battle_id = $1 AND user_id = $2`,
        [battleId, userId, JSON.stringify(next.guesses), next.status, next.status === 'won', next.guesses.length, greenProgress(next.guesses), timeMs, finished],
      );

      // finalize when every player has finished (won or exhausted attempts)
      if (finished) {
        const remaining = await client.query<{ count: string }>(
          `SELECT COUNT(*)::int AS count FROM wordle_battle_players WHERE battle_id = $1 AND status = 'playing'`,
          [battleId],
        );
        if (Number(remaining.rows[0]!.count) === 0) await this.finalize(client, battleId);
      }

      await client.query('COMMIT');
      return { ok: true, battle: await this.state(battleId, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** A player's live view: own guesses + opponents' progress (never their letters). */
  async state(battleId: string, userId: string): Promise<BattleState> {
    const b = await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId]);
    const battle = b.rows[0]!;
    const players = await this.pool.query<PlayerRow>(`SELECT * FROM wordle_battle_players WHERE battle_id = $1 ORDER BY joined_at`, [battleId]);
    const mine = players.rows.find((r) => r.user_id === userId) ?? null;
    return {
      id: battle.id,
      status: battle.status,
      difficulty: battle.difficulty,
      targetLength: battle.target_length,
      maxPlayers: battle.max_players,
      createdBy: battle.created_by,
      me: mine
        ? {
            guesses: mine.guesses,
            keyboard: keyboardFromGuesses(mine.guesses),
            status: mine.status,
            solved: mine.solved,
            remainingAttempts: Math.max(0, MAX_ATTEMPTS - mine.guess_count),
          }
        : null,
      opponents: players.rows
        .filter((r) => r.user_id !== userId)
        .map((r) => ({
          userId: r.user_id,
          guessCount: r.guess_count,
          solved: r.solved,
          status: r.status,
          progress: r.progress,
          finished: r.status !== 'playing',
        })),
      target: battle.status === 'finished' ? battle.target : null,
    };
  }

  /** Post-match results (finished only): all histories + word + placement + XP. */
  async results(battleId: string): Promise<BattleResults | null> {
    const b = await this.pool.query<BattleRow>(`SELECT * FROM wordle_battles WHERE id = $1`, [battleId]);
    const battle = b.rows[0];
    if (!battle || battle.status !== 'finished') return null;
    const players = await this.pool.query<PlayerRow>(`SELECT * FROM wordle_battle_players WHERE battle_id = $1`, [battleId]);
    const ranked = rankBattle(players.rows.map((r) => this.toBattleResult(r)));
    const byId = new Map(players.rows.map((r) => [r.user_id, r]));
    return {
      id: battle.id,
      target: battle.target,
      difficulty: battle.difficulty,
      ranking: ranked.map((r) => ({
        userId: r.userId,
        rank: r.rank,
        solved: r.solved,
        guessCount: r.guesses,
        timeMs: byId.get(r.userId)?.time_ms ?? null,
        progress: r.progress,
        xpAwarded: byId.get(r.userId)?.xp_awarded ?? null,
        guesses: byId.get(r.userId)?.guesses ?? [],
      })),
    };
  }

  // ---- internals ------------------------------------------------------------

  /** Rank the finished match, award placement XP idempotently, close the battle. */
  private async finalize(client: pg.PoolClient, battleId: string): Promise<void> {
    const players = await client.query<PlayerRow>(`SELECT * FROM wordle_battle_players WHERE battle_id = $1`, [battleId]);
    const ranked = rankBattle(players.rows.map((r) => this.toBattleResult(r)));
    const count = ranked.length;
    for (const r of ranked) {
      const xp = placementXp(r.rank, count);
      await this.xp.award({ userId: r.userId, source: 'wordle_battle', amount: xp, refId: `battle:${battleId}:${r.userId}` }, client);
      await client.query(`UPDATE wordle_battle_players SET xp_awarded = $3 WHERE battle_id = $1 AND user_id = $2`, [battleId, r.userId, xp]);
    }
    await client.query(`UPDATE wordle_battles SET status = 'finished', finished_at = now() WHERE id = $1`, [battleId]);
  }

  private toBattleResult(r: PlayerRow): BattlePlayerResult {
    return { userId: r.user_id, solved: r.solved, guesses: r.guess_count, timeMs: r.time_ms ?? Number.MAX_SAFE_INTEGER, progress: r.progress };
  }

  private rehydrate(battle: BattleRow, player: PlayerRow): WordleGame {
    const base = initGame(battle.target_length);
    return { ...base, status: player.status, guesses: player.guesses, keyboard: keyboardFromGuesses(player.guesses) };
  }

  private async wordExists(client: pg.PoolClient, normalized: string): Promise<boolean> {
    if (!normalized) return false;
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $1) AS exists`,
      [normalized],
    );
    return res.rows[0]?.exists ?? false;
  }

  private async pickTarget(difficulty: Difficulty): Promise<{ target: string; difficulty: Difficulty } | null> {
    const order = [difficulty, ...HARDER_TO_EASIER.filter((d) => d !== difficulty)];
    const all = await this.pool.query<{ headword: string }>(`SELECT headword FROM dict_entries ORDER BY id`);
    const words = all.rows.map((r) => r.headword);
    for (const tier of order) {
      const pool = filterByDifficulty(words, tier);
      if (pool.length > 0) return { target: pool[Math.floor(Math.random() * pool.length)]!, difficulty: tier };
    }
    return null;
  }
}
