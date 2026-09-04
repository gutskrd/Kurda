import type pg from 'pg';
import { XpService } from '../xp/service.js';
import {
  evaluateSubmission,
  normalizeWord,
  InMemoryLexicon,
  type Dialect,
  type RhymeQuality,
  type RhymeReject,
} from './rhyme.js';
import { rankRhyme, rhymePlacementXp, type RhymeMatchPlayerResult } from './rhyme-match.js';

const DEFAULT_WINDOW_MS = 60_000;
const MIN_WINDOW_MS = 30_000;
const MAX_WINDOW_MS = 180_000;

export type CreateResult = { ok: true; match: RhymeMatchState } | { ok: false; reason: 'empty-lexicon' };
export type JoinResult =
  | { ok: true; match: RhymeMatchState }
  | { ok: false; reason: 'not-found' | 'not-open' | 'full' | 'already-joined' };
export type StartResult =
  | { ok: true; match: RhymeMatchState }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'not-lobby' | 'need-two' };
export type SubmitResult =
  | { ok: true; match: RhymeMatchState; result: { accepted: boolean; quality: RhymeQuality; points: number; normalized: string; reason?: RhymeReject | 'window-closed' } }
  | { ok: false; reason: 'not-found' | 'not-active' | 'not-in-match' };

export interface RhymeScoreboardEntry {
  userId: string;
  score: number;
  accepted: number;
}

export interface RhymeMatchState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  dialect: Dialect;
  /** revealed once the match starts (hidden in the lobby) */
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  createdBy: string;
  me: { score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: RhymeScoreboardEntry[];
}

export interface RhymeMatchResults {
  id: string;
  prompt: string;
  dialect: Dialect;
  ranking: Array<{ userId: string; rank: number; score: number; accepted: number; xpAwarded: number | null; usedWords: string[] }>;
}

interface MatchRow {
  id: string;
  created_by: string;
  dialect: Dialect;
  prompt: string;
  window_ms: number;
  max_players: number;
  status: 'lobby' | 'active' | 'finished';
  started_at: Date | null;
  finished_at: Date | null;
}
interface PlayerRow {
  match_id: string;
  user_id: string;
  used_words: string[];
  score: number;
  accepted: number;
  xp_awarded: number | null;
}

/**
 * Rhyme multiplayer 1v1 / free-for-all (KUR-299) — server-authoritative match
 * service parallel to Wordle Battle (#306). Every player races the same server-held
 * prompt within one shared window; each submission is validated + scored by the
 * #298 engine here (client never decides). When the window elapses the match
 * finalizes: rank by score (pure `rhyme-match.ts`) → placement XP. Poll-safe, so
 * the whole flow is integration-testable without the realtime gateway.
 */
export class RhymeMatchService {
  private readonly xp: XpService;
  private readonly now: () => Date;

  constructor(private readonly pool: pg.Pool, deps: { xp?: XpService; now?: () => Date } = {}) {
    this.xp = deps.xp ?? new XpService(pool);
    this.now = deps.now ?? (() => new Date());
  }

  async create(userId: string, opts: { dialect?: Dialect; maxPlayers?: number; windowMs?: number }): Promise<CreateResult> {
    const picked = await this.pool.query<{ headword: string }>(
      `SELECT headword FROM dict_entries
        WHERE headword_normalized <> ''
          -- prefer curated prompts; fall back to any word while none are marked,
          -- so rounds keep working before anyone has curated
          AND (is_rhyme_prompt OR NOT EXISTS (SELECT 1 FROM dict_entries WHERE is_rhyme_prompt))
        ORDER BY random() LIMIT 1`,
    );
    const prompt = picked.rows[0]?.headword;
    if (!prompt) return { ok: false, reason: 'empty-lexicon' };
    const windowMs = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, opts.windowMs ?? DEFAULT_WINDOW_MS));
    const maxPlayers = Math.min(8, Math.max(2, opts.maxPlayers ?? 8));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const m = await client.query<MatchRow>(
        `INSERT INTO rhyme_matches (created_by, dialect, prompt, window_ms, max_players)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [userId, opts.dialect ?? 'kurmanci', prompt, windowMs, maxPlayers],
      );
      await client.query(`INSERT INTO rhyme_match_players (match_id, user_id) VALUES ($1,$2)`, [m.rows[0]!.id, userId]);
      await client.query('COMMIT');
      return { ok: true, match: await this.state(m.rows[0]!.id, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async join(matchId: string, userId: string): Promise<JoinResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const m = await client.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1 FOR UPDATE`, [matchId]);
      const match = m.rows[0];
      if (!match) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (match.status !== 'lobby') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-open' }; }
      const already = await client.query(`SELECT 1 FROM rhyme_match_players WHERE match_id = $1 AND user_id = $2`, [matchId, userId]);
      if ((already.rowCount ?? 0) > 0) { await client.query('ROLLBACK'); return { ok: false, reason: 'already-joined' }; }
      const players = await client.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM rhyme_match_players WHERE match_id = $1`, [matchId]);
      if (Number(players.rows[0]!.count) >= match.max_players) { await client.query('ROLLBACK'); return { ok: false, reason: 'full' }; }
      await client.query(`INSERT INTO rhyme_match_players (match_id, user_id) VALUES ($1,$2)`, [matchId, userId]);
      await client.query('COMMIT');
      return { ok: true, match: await this.state(matchId, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async start(matchId: string, userId: string): Promise<StartResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const m = await client.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1 FOR UPDATE`, [matchId]);
      const match = m.rows[0];
      if (!match) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (match.created_by !== userId) { await client.query('ROLLBACK'); return { ok: false, reason: 'forbidden' }; }
      if (match.status !== 'lobby') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-lobby' }; }
      const players = await client.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM rhyme_match_players WHERE match_id = $1`, [matchId]);
      if (Number(players.rows[0]!.count) < 2) { await client.query('ROLLBACK'); return { ok: false, reason: 'need-two' }; }
      // started_at comes from the service clock (injectable) so the timed window is
      // deterministic in tests and correct (real Date) in production.
      await client.query(`UPDATE rhyme_matches SET status = 'active', started_at = $2 WHERE id = $1`, [matchId, this.now()]);
      await client.query('COMMIT');
      return { ok: true, match: await this.state(matchId, userId) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async submit(matchId: string, userId: string, word: string): Promise<SubmitResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const m = await client.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1 FOR UPDATE`, [matchId]);
      const match = m.rows[0];
      if (!match) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (match.status !== 'active') { await client.query('ROLLBACK'); return { ok: false, reason: 'not-active' }; }

      const p = await client.query<PlayerRow>(`SELECT * FROM rhyme_match_players WHERE match_id = $1 AND user_id = $2 FOR UPDATE`, [matchId, userId]);
      const player = p.rows[0];
      if (!player) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-in-match' }; }

      const elapsedMs = Math.max(0, this.now().getTime() - (match.started_at ?? this.now()).getTime());
      // window closed → finalize the whole match; this submission does not score
      if (elapsedMs >= match.window_ms) {
        await this.finalize(client, matchId);
        await client.query('COMMIT');
        return {
          ok: true,
          match: await this.state(matchId, userId),
          result: { accepted: false, quality: 'none', points: 0, normalized: normalizeWord(word), reason: 'window-closed' },
        };
      }

      const normalized = normalizeWord(word);
      const known = await this.wordExists(client, normalized);
      const lexicon = new InMemoryLexicon(known ? [{ word: normalized, dialect: match.dialect }] : []);

      // an admin's explicit verdict for this exact pair, if one exists
      const override = await client.query<{ quality: string }>(
        `SELECT quality FROM rhyme_overrides WHERE prompt_normalized = $1 AND rhyme_normalized = $2`,
        [normalizeWord(match.prompt), normalized],
      );
      const overrideQuality = override.rows[0]
        ? () => override.rows[0]!.quality as RhymeQuality
        : undefined;
      const result = evaluateSubmission(
        { prompt: match.prompt, submission: word, elapsedMs, windowMs: match.window_ms, dialect: match.dialect, usedWords: player.used_words },
        { lexicon, overrideQuality },
      );

      if (result.accepted) {
        await client.query(
          `UPDATE rhyme_match_players SET used_words = $3::jsonb, score = score + $4, accepted = accepted + 1
           WHERE match_id = $1 AND user_id = $2`,
          [matchId, userId, JSON.stringify([...player.used_words, result.normalized]), result.points],
        );
      }

      await client.query('COMMIT');
      return { ok: true, match: await this.state(matchId, userId), result };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Live view: own score/used words + the shared scoreboard + remaining time.
   *  Finalizes lazily if the window has elapsed (so pollers converge to results). */
  async state(matchId: string, userId: string): Promise<RhymeMatchState> {
    await this.finalizeIfElapsed(matchId);
    const m = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    const match = m.rows[0]!;
    const players = await this.pool.query<PlayerRow>(`SELECT * FROM rhyme_match_players WHERE match_id = $1 ORDER BY joined_at`, [matchId]);
    const mine = players.rows.find((r) => r.user_id === userId) ?? null;
    const remainingMs = this.remainingMs(match);
    return {
      id: match.id,
      status: match.status,
      dialect: match.dialect,
      prompt: match.status === 'lobby' ? null : match.prompt,
      windowMs: match.window_ms,
      remainingMs,
      maxPlayers: match.max_players,
      createdBy: match.created_by,
      me: mine ? { score: mine.score, accepted: mine.accepted, usedWords: mine.used_words } : null,
      scoreboard: players.rows.map((r) => ({ userId: r.user_id, score: r.score, accepted: r.accepted })),
    };
  }

  async results(matchId: string, userId: string): Promise<RhymeMatchResults | null> {
    await this.finalizeIfElapsed(matchId);
    const m = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    const match = m.rows[0];
    if (!match || match.status !== 'finished') return null;
    const players = await this.pool.query<PlayerRow>(`SELECT * FROM rhyme_match_players WHERE match_id = $1`, [matchId]);
    // participants only — a non-participant gets null, never another match's used
    // words / placement / XP (BOLA protection)
    if (!players.rows.some((r) => r.user_id === userId)) return null;
    const ranked = rankRhyme(players.rows.map((r) => this.toResult(r)));
    const byId = new Map(players.rows.map((r) => [r.user_id, r]));
    return {
      id: match.id,
      prompt: match.prompt,
      dialect: match.dialect,
      ranking: ranked.map((r) => ({
        userId: r.userId,
        rank: r.rank,
        score: r.score,
        accepted: r.accepted,
        xpAwarded: byId.get(r.userId)?.xp_awarded ?? null,
        usedWords: byId.get(r.userId)?.used_words ?? [],
      })),
    };
  }

  // ---- internals ------------------------------------------------------------

  private remainingMs(match: MatchRow): number {
    if (match.status !== 'active' || !match.started_at) return match.status === 'lobby' ? match.window_ms : 0;
    return Math.max(0, match.window_ms - (this.now().getTime() - match.started_at.getTime()));
  }

  /** Finalize the match if it's active and its window has elapsed. */
  private async finalizeIfElapsed(matchId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const m = await client.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1 FOR UPDATE`, [matchId]);
      const match = m.rows[0];
      if (match && match.status === 'active' && match.started_at && this.now().getTime() - match.started_at.getTime() >= match.window_ms) {
        await this.finalize(client, matchId);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async finalize(client: pg.PoolClient, matchId: string): Promise<void> {
    const players = await client.query<PlayerRow>(`SELECT * FROM rhyme_match_players WHERE match_id = $1`, [matchId]);
    const ranked = rankRhyme(players.rows.map((r) => this.toResult(r)));
    const count = ranked.length;
    for (const r of ranked) {
      const xp = rhymePlacementXp(r.rank, count);
      await this.xp.award({ userId: r.userId, source: 'rhyme_match', amount: xp, refId: `match:${matchId}:${r.userId}` }, client);
      await client.query(`UPDATE rhyme_match_players SET xp_awarded = $3 WHERE match_id = $1 AND user_id = $2`, [matchId, r.userId, xp]);
    }
    await client.query(`UPDATE rhyme_matches SET status = 'finished', finished_at = now() WHERE id = $1`, [matchId]);
  }

  private toResult(r: PlayerRow): RhymeMatchPlayerResult {
    return { userId: r.user_id, score: r.score, accepted: r.accepted };
  }

  private async wordExists(client: pg.PoolClient, normalized: string): Promise<boolean> {
    if (!normalized) return false;
    const res = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $1) AS exists`,
      [normalized],
    );
    return res.rows[0]?.exists ?? false;
  }
}
