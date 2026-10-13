import type pg from 'pg';
import { dictionaryKey, type GameAccess, type InviteSummary, type LobbyCard } from '@kurda/shared';
import { pickRhymePrompt } from './rhyme-prompt.js';
import { XpService } from '../xp/service.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { canJoin, mayHostOpen } from '../play/access.js';
import {
  RHYME_MATCHES as T,
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
  seatPlayers,
  seatsOf,
  tallySeries,
  type LobbyRow,
  type SeatPlayer,
  type SeatRow,
} from '../play/lobby.js';
import type { LobbyChange, LobbyFacts, Series } from '../play/types.js';
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

export type CreateResult = { ok: true; match: RhymeMatchState } | { ok: false; reason: 'empty-lexicon' | 'open-needs-adult' };
export type JoinResult =
  | { ok: true; match: RhymeMatchState }
  | { ok: false; reason: 'not-found' | 'not-open' | 'full' | 'already-joined' };
export type StartResult =
  | { ok: true; match: RhymeMatchState }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'not-lobby' | 'need-two' };
export type SubmitResult =
  | { ok: true; match: RhymeMatchState; result: { accepted: boolean; quality: RhymeQuality; points: number; normalized: string; reason?: RhymeReject | 'window-closed' } }
  | { ok: false; reason: 'not-found' | 'not-active' | 'not-in-match' };
export type ReadResult = { ok: true; match: RhymeMatchState } | { ok: false; reason: 'not-found' | 'started' };
export type LeaveResult = { ok: true } | { ok: false; reason: 'not-found' };
export type RemoveResult =
  | { ok: true; match: RhymeMatchState }
  | { ok: false; reason: 'not-found' | 'forbidden' | 'not-lobby' | 'no-seat' };
export type NextResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not-found' | 'not-finished' | 'not-pair' | 'forbidden' | 'empty-lexicon' };

type Scored = Extract<SubmitResult, { ok: true }>['result'];

export interface RhymeScoreboardEntry {
  /** the viewer's own id on their own entry, `seat:N` on everyone else's */
  userId: string;
  seat: number;
  /** null unless the viewer may see it (a friend, or anyone in an open match) */
  name: string | null;
  avatarUrl: string | null;
  score: number;
  accepted: number;
  /** left the match */
  gone: boolean;
}

export interface RhymeMatchState {
  id: string;
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  dialect: Dialect;
  /** revealed once the match starts (hidden in the lobby) */
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  /** the host: the viewer's own id when they host, else the host's `seat:N` */
  createdBy: string;
  isHost: boolean;
  access: GameAccess;
  /** the rematch or next round, once there is one */
  nextLobbyId: string | null;
  /** everyone in it, by seat, as this viewer may see them */
  players: SeatPlayer[];
  me: { seat: number; score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: RhymeScoreboardEntry[];
}

export interface RhymeMatchResults {
  id: string;
  prompt: string;
  dialect: Dialect;
  ranking: Array<{
    userId: string;
    seat: number;
    name: string | null;
    avatarUrl: string | null;
    isMe: boolean;
    rank: number;
    score: number;
    accepted: number;
    xpAwarded: number | null;
    usedWords: string[];
  }>;
}

interface MatchRow extends LobbyRow {
  dialect: Dialect;
  prompt: string;
  window_ms: number;
  started_at: Date | null;
  finished_at: Date | null;
}
interface PlayerRow extends SeatRow {
  match_id: string;
  used_words: string[];
  score: number;
  accepted: number;
  xp_awarded: number | null;
}

export interface RhymeMatchDeps {
  xp?: XpService;
  now?: () => Date;
  /**
   * called after every committed change (the play module's `play_changed`); `also` is someone just
   * removed, `card: false` a scored word that ended nothing, which no chat card shows
   */
  onChange?: (matchId: string, opts?: LobbyChange) => void;
  publicUrl?: PublicUrl;
}

/**
 * Rhyme multiplayer 1v1 / free-for-all (KUR-299) — server-authoritative match
 * service parallel to Wordle Battle (#306). Every player races the same server-held
 * prompt within one shared window; each submission is validated + scored by the
 * #298 engine here (client never decides). When the window elapses the match
 * finalizes: rank by score (pure `rhyme-match.ts`) → placement XP. Poll-safe, so
 * the whole flow is integration-testable without the realtime gateway.
 *
 * Joining, seeing each other and leaving follow the rules every online game
 * shares (play/access.ts, play/lobby.ts), as Wordle Battle does. The prompt is
 * drawn from the match's own dialect.
 */
export class RhymeMatchService {
  private readonly xp: XpService;
  private readonly now: () => Date;
  private readonly onChange: (matchId: string, opts?: LobbyChange) => void;
  private readonly publicUrl: PublicUrl;

  constructor(private readonly pool: pg.Pool, deps: RhymeMatchDeps = {}) {
    this.xp = deps.xp ?? new XpService(pool);
    this.now = deps.now ?? (() => new Date());
    this.onChange = deps.onChange ?? (() => undefined);
    this.publicUrl = deps.publicUrl ?? (() => null);
  }

  async create(
    userId: string,
    opts: { dialect?: Dialect; maxPlayers?: number; windowMs?: number; access?: GameAccess; chatGroupId?: string | null },
  ): Promise<CreateResult> {
    const access = opts.access ?? 'friends';
    if (access === 'open' && !(await mayHostOpen(this.pool, userId))) return { ok: false, reason: 'open-needs-adult' };
    const dialect = opts.dialect ?? 'kurmanci';
    const prompt = await pickRhymePrompt(this.pool, dialect);
    if (!prompt) return { ok: false, reason: 'empty-lexicon' };
    const windowMs = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, opts.windowMs ?? DEFAULT_WINDOW_MS));
    const maxPlayers = Math.min(8, Math.max(2, opts.maxPlayers ?? 8));
    const id = await this.tx(async (client) => {
      const m = await client.query<MatchRow>(
        `INSERT INTO rhyme_matches (created_by, dialect, prompt, window_ms, max_players, access, chat_group_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [userId, dialect, prompt, windowMs, maxPlayers, access, opts.chatGroupId ?? null, this.now()],
      );
      await client.query(`INSERT INTO rhyme_match_players (match_id, user_id, seat) VALUES ($1,$2,1)`, [m.rows[0]!.id, userId]);
      return m.rows[0]!.id;
    });
    this.changed(id);
    return { ok: true, match: await this.state(id, userId) };
  }

  /** Join an open lobby: every refusal of the join rule is 'not-found', and comes first. */
  async join(matchId: string, userId: string): Promise<JoinResult> {
    const now = this.now();
    let cancelled = false;
    const res = await this.tx<JoinResult | null>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, matchId);
      const mine = seats.find((s) => s.user_id === userId);
      if (mine && !mine.removed) return { ok: false, reason: 'already-joined' };
      if (match.status === 'cancelled') return { ok: false, reason: 'not-found' };
      if (lobbyIdle(match, now)) {
        await this.cancelLobby(client, matchId, now);
        cancelled = true;
        return { ok: false, reason: 'not-found' };
      }
      if (!(await mayJoin(client, match, seats, userId))) return { ok: false, reason: 'not-found' };
      if (match.status !== 'lobby') return { ok: false, reason: 'not-open' };
      if (present(seats).length >= match.max_players) return { ok: false, reason: 'full' };
      const seat = await nextSeat(client, T, matchId);
      await client.query(`INSERT INTO rhyme_match_players (match_id, user_id, seat) VALUES ($1,$2,$3)`, [matchId, userId, seat]);
      await client.query(`UPDATE rhyme_matches SET updated_at = $2 WHERE id = $1`, [matchId, now]);
      return null;
    });
    if (cancelled) this.changed(matchId);
    if (res) return res;
    this.changed(matchId);
    return { ok: true, match: await this.state(matchId, userId) };
  }

  async start(matchId: string, userId: string): Promise<StartResult> {
    const now = this.now();
    const res = await this.tx<StartResult | null>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, matchId);
      if (!present(seats).some((s) => s.user_id === userId)) return { ok: false, reason: 'not-found' };
      if (match.created_by !== userId) return { ok: false, reason: 'forbidden' };
      if (match.status !== 'lobby' || lobbyIdle(match, now)) return { ok: false, reason: 'not-lobby' };
      if (present(seats).length < 2) return { ok: false, reason: 'need-two' };
      // started_at comes from the service clock (injectable) so the timed window is
      // deterministic in tests and correct (real Date) in production.
      await client.query(`UPDATE rhyme_matches SET status = 'active', started_at = $2, updated_at = $2 WHERE id = $1`, [matchId, now]);
      return null;
    });
    if (res) return res;
    this.changed(matchId);
    return { ok: true, match: await this.state(matchId, userId) };
  }

  async submit(matchId: string, userId: string, word: string): Promise<SubmitResult> {
    const now = this.now();
    const res = await this.tx<Extract<SubmitResult, { ok: false }> | { ok: true; result: Scored; ended: boolean }>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      const p = await client.query<PlayerRow>(`SELECT * FROM rhyme_match_players WHERE match_id = $1 AND user_id = $2 FOR UPDATE`, [matchId, userId]);
      const player = p.rows[0];
      // to anyone not in it, the match does not exist
      if (!player || player.removed) return { ok: false, reason: 'not-found' };
      if (match.status !== 'active') return { ok: false, reason: 'not-active' };
      if (player.left_at) return { ok: false, reason: 'not-in-match' };

      const elapsedMs = Math.max(0, now.getTime() - (match.started_at ?? now).getTime());
      // window closed → finalize the whole match; this submission does not score
      if (elapsedMs >= match.window_ms) {
        await this.finalize(client, matchId, now);
        return {
          ok: true,
          ended: true,
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
      return { ok: true, ended: false, result };
    });
    if (!res.ok) return res;
    // a scored word moves the scoreboard (which no chat card shows); an ended
    // window ends the match
    if (res.ended || res.result.accepted) this.changed(matchId, { card: res.ended });
    return { ok: true, match: await this.state(matchId, userId), result: res.result };
  }

  /**
   * `GET /rhyme/matches/:id`: a member's live view (finished lazily once the
   * window has passed). Someone the join rule would let in sees an open lobby,
   * and is told 'started' about a match under way — a latecomer's "this match
   * has already started", not the "time's up" they used to get. Everyone else
   * is told it does not exist.
   */
  async read(matchId: string, userId: string): Promise<ReadResult> {
    const now = this.now();
    const m = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    const match = m.rows[0];
    if (!match) return { ok: false, reason: 'not-found' };
    const seats = await seatsOf(this.pool, T, matchId);
    if (seats.some((s) => s.user_id === userId && !s.removed)) {
      await this.settle(match, now);
      return { ok: true, match: await this.state(matchId, userId) };
    }
    if (!(await mayJoin(this.pool, match, seats, userId))) return { ok: false, reason: 'not-found' };
    if (match.status === 'lobby' && !lobbyIdle(match, now)) return { ok: true, match: await this.state(matchId, userId) };
    if (match.status === 'active' || match.status === 'finished') return { ok: false, reason: 'started' };
    return { ok: false, reason: 'not-found' };
  }

  /**
   * Leave: a lobby (the host leaving calls it off), or a match under way —
   * marked gone, their score stands, and they can still read it.
   */
  async leave(matchId: string, userId: string): Promise<LeaveResult> {
    const now = this.now();
    const res = await this.tx<LeaveResult>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, matchId);
      const mine = seats.find((s) => s.user_id === userId && !s.removed);
      if (!mine) return { ok: false, reason: 'not-found' };
      if (match.status === 'lobby') {
        if (match.created_by === userId) await this.cancelLobby(client, matchId, now);
        else {
          await client.query(`DELETE FROM rhyme_match_players WHERE match_id = $1 AND user_id = $2`, [matchId, userId]);
          await client.query(`UPDATE rhyme_matches SET updated_at = $2 WHERE id = $1`, [matchId, now]);
        }
      } else if (match.status === 'active' && mine.left_at === null) {
        await client.query(`UPDATE rhyme_match_players SET left_at = $3 WHERE match_id = $1 AND user_id = $2`, [matchId, userId, now]);
      }
      return { ok: true };
    });
    if (res.ok) this.changed(matchId);
    return res;
  }

  /** The host takes a player out of the lobby, by seat (see WordleBattleService.remove). */
  async remove(matchId: string, hostId: string, seat: number): Promise<RemoveResult> {
    const now = this.now();
    let removed: string | null = null;
    const res = await this.tx<RemoveResult | null>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, matchId);
      if (!seats.some((s) => s.user_id === hostId && !s.removed)) return { ok: false, reason: 'not-found' };
      if (match.created_by !== hostId) return { ok: false, reason: 'forbidden' };
      if (match.status !== 'lobby' || lobbyIdle(match, now)) return { ok: false, reason: 'not-lobby' };
      const target = seats.find((s) => s.seat === seat && !s.removed);
      if (!target || target.user_id === hostId) return { ok: false, reason: 'no-seat' };
      await client.query(`UPDATE rhyme_match_players SET removed = true WHERE match_id = $1 AND user_id = $2`, [matchId, target.user_id]);
      await client.query(`UPDATE rhyme_matches SET updated_at = $2 WHERE id = $1`, [matchId, now]);
      removed = target.user_id;
      return null;
    });
    if (res) return res;
    this.changed(matchId, removed ? { also: [removed] } : undefined);
    return { ok: true, match: await this.state(matchId, hostId) };
  }

  /**
   * The view, as `userId` may see it: own score/used words + the shared
   * scoreboard by seat + remaining time. Callers decide who may have it
   * (`read`); this builds it, finishing the match first if its window passed.
   */
  async state(matchId: string, userId: string): Promise<RhymeMatchState> {
    const now = this.now();
    let m = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    if (this.elapsed(m.rows[0]!, now)) {
      await this.finalizeIfElapsed(matchId);
      m = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    }
    const match = m.rows[0]!;
    const rows = await this.pool.query<PlayerRow>(
      `SELECT * FROM rhyme_match_players WHERE match_id = $1 AND NOT removed ORDER BY seat`,
      [matchId],
    );
    const players = await seatPlayers(this.pool, match, rows.rows, userId, this.publicUrl);
    const bySeat = new Map(players.map((p) => [p.seat, p]));
    const mine = rows.rows.find((r) => r.user_id === userId) ?? null;
    return {
      id: match.id,
      status: match.status,
      dialect: match.dialect,
      prompt: match.status === 'active' || match.status === 'finished' ? match.prompt : null,
      windowMs: match.window_ms,
      remainingMs: this.remainingMs(match, now),
      maxPlayers: match.max_players,
      createdBy: hostRef(match, rows.rows, userId),
      isHost: match.created_by === userId,
      access: match.access,
      nextLobbyId: match.next_lobby_id,
      players,
      me: mine ? { seat: mine.seat, score: mine.score, accepted: mine.accepted, usedWords: mine.used_words } : null,
      scoreboard: rows.rows.map((r) => {
        const who = bySeat.get(r.seat)!;
        return {
          userId: who.userId,
          seat: r.seat,
          name: who.name,
          avatarUrl: who.avatarUrl,
          score: r.score,
          accepted: r.accepted,
          gone: r.left_at !== null,
        };
      }),
    };
  }

  async results(matchId: string, userId: string): Promise<RhymeMatchResults | null> {
    const now = this.now();
    const m0 = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    if (m0.rows[0] && this.elapsed(m0.rows[0], now)) await this.finalizeIfElapsed(matchId);
    const m = await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId]);
    const match = m.rows[0];
    if (!match || match.status !== 'finished') return null;
    const players = await this.pool.query<PlayerRow>(
      `SELECT * FROM rhyme_match_players WHERE match_id = $1 AND NOT removed ORDER BY seat`,
      [matchId],
    );
    // participants only — a non-participant gets null, never another match's used
    // words / placement / XP (BOLA protection)
    if (!players.rows.some((r) => r.user_id === userId)) return null;
    const ranked = rankRhyme(players.rows.map((r) => this.toResult(r)));
    const byId = new Map(players.rows.map((r) => [r.user_id, r]));
    const seen = new Map((await seatPlayers(this.pool, match, players.rows, userId, this.publicUrl)).map((p) => [p.seat, p]));
    return {
      id: match.id,
      prompt: match.prompt,
      dialect: match.dialect,
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
          score: r.score,
          accepted: r.accepted,
          xpAwarded: row.xp_awarded,
          usedWords: row.used_words,
        };
      }),
    };
  }

  /** In the match (still there or gone), and not removed by the host. */
  async isMember(matchId: string, userId: string): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT 1 FROM rhyme_match_players WHERE match_id = $1 AND user_id = $2 AND NOT removed`,
      [matchId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  // ---- playing again ----------------------------------------------------------

  /**
   * A two-player rematch both asked for: a new match with the same settings
   * (a new prompt of the same dialect) and both in it, started at once. Still
   * the join rule's call. Asking twice gives the same one.
   */
  async startPairRematch(matchId: string): Promise<NextResult> {
    const old = (await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId])).rows[0];
    if (!old) return { ok: false, reason: 'not-found' };
    const prompt = old.next_lobby_id ? null : await pickRhymePrompt(this.pool, old.dialect);
    const now = this.now();
    let created: string | null = null;
    const res = await this.tx<NextResult>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      if (match.next_lobby_id) return { ok: true, id: match.next_lobby_id };
      if (match.status !== 'finished') return { ok: false, reason: 'not-finished' };
      const pair = inGame(await seatsOf(client, T, matchId));
      if (pair.length !== 2) return { ok: false, reason: 'not-pair' };
      if (!prompt) return { ok: false, reason: 'empty-lexicon' };
      const host = pair.find((s) => s.user_id === match.created_by) ?? pair[0]!;
      const other = pair.find((s) => s !== host)!;
      const access: GameAccess = match.access === 'open' && (await mayHostOpen(client, host.user_id)) ? 'open' : 'friends';
      const allowed = await canJoin(client, {
        joinerId: other.user_id,
        hostId: host.user_id,
        access,
        memberIds: [host.user_id],
        chatGroupId: match.chat_group_id,
        removed: false,
      });
      if (!allowed) return { ok: false, reason: 'not-found' };
      const m = await client.query<{ id: string }>(
        `INSERT INTO rhyme_matches (created_by, dialect, prompt, window_ms, max_players, access, chat_group_id,
                                    rematch_of, status, started_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$9) RETURNING id`,
        [host.user_id, match.dialect, prompt, match.window_ms, match.max_players, access, match.chat_group_id, matchId, now],
      );
      created = m.rows[0]!.id;
      await client.query(
        `INSERT INTO rhyme_match_players (match_id, user_id, seat) VALUES ($1,$2,1), ($1,$3,2)`,
        [created, host.user_id, other.user_id],
      );
      await client.query(`UPDATE rhyme_matches SET next_lobby_id = $2, updated_at = $3 WHERE id = $1`, [matchId, created, now]);
      return { ok: true, id: created };
    });
    if (created) {
      this.changed(matchId);
      this.changed(created);
    }
    return res;
  }

  /** A bigger match's "Play again": the host's next round, only the host in it (see WordleBattleService). */
  async openNextRound(hostId: string, matchId: string): Promise<NextResult> {
    const old = (await this.pool.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1`, [matchId])).rows[0];
    if (!old) return { ok: false, reason: 'not-found' };
    const prompt = old.next_lobby_id ? null : await pickRhymePrompt(this.pool, old.dialect);
    const now = this.now();
    let created: string | null = null;
    const res = await this.tx<NextResult>(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match) return { ok: false, reason: 'not-found' };
      const seats = await seatsOf(client, T, matchId);
      if (!seats.some((s) => s.user_id === hostId && !s.removed)) return { ok: false, reason: 'not-found' };
      if (match.next_lobby_id) return { ok: true, id: match.next_lobby_id };
      if (match.status !== 'finished') return { ok: false, reason: 'not-finished' };
      if (match.created_by !== hostId) return { ok: false, reason: 'forbidden' };
      if (!prompt) return { ok: false, reason: 'empty-lexicon' };
      const access: GameAccess = match.access === 'open' && (await mayHostOpen(client, hostId)) ? 'open' : 'friends';
      const m = await client.query<{ id: string }>(
        `INSERT INTO rhyme_matches (created_by, dialect, prompt, window_ms, max_players, access, chat_group_id, rematch_of, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [hostId, match.dialect, prompt, match.window_ms, match.max_players, access, match.chat_group_id, matchId, now],
      );
      created = m.rows[0]!.id;
      await client.query(`INSERT INTO rhyme_match_players (match_id, user_id, seat) VALUES ($1,$2,1)`, [created, hostId]);
      await client.query(`UPDATE rhyme_matches SET next_lobby_id = $2, updated_at = $3 WHERE id = $1`, [matchId, created, now]);
      return { ok: true, id: created };
    });
    if (created) {
      this.changed(matchId);
      this.changed(created);
    }
    return res;
  }

  /** Wins between two players over a run of rematches ending in this match. */
  async series(matchId: string, me: string, other: string): Promise<Series> {
    const chain = await rematchChain(this.pool, T, matchId);
    const rows = await this.pool.query<PlayerRow>(
      `SELECT p.* FROM rhyme_match_players p JOIN rhyme_matches m ON m.id = p.match_id
        WHERE p.match_id = ANY($1::uuid[]) AND m.status = 'finished' AND NOT p.removed`,
      [chain],
    );
    const byMatch = new Map<string, PlayerRow[]>();
    for (const r of rows.rows) byMatch.set(r.match_id, [...(byMatch.get(r.match_id) ?? []), r]);
    return tallySeries(
      [...byMatch.values()].map((players) => ({
        players: players.map((p) => p.user_id),
        winners: rankRhyme(players.map((p) => this.toResult(p)))
          .filter((r) => r.rank === 1)
          .map((r) => r.userId),
      })),
      me,
      other,
    );
  }

  // ---- for the play layer -----------------------------------------------------

  async facts(matchId: string): Promise<LobbyFacts | null> {
    return loadFacts(this.pool, T, matchId, this.now());
  }

  async summary(matchId: string): Promise<InviteSummary | null> {
    const m = await this.pool.query<{ dialect: Dialect }>(`SELECT dialect FROM rhyme_matches WHERE id = $1`, [matchId]);
    return m.rows[0] ? { dialect: m.rows[0].dialect } : null;
  }

  async card(viewerId: string, matchId: string): Promise<LobbyCard> {
    return lobbyCard(this.pool, T, viewerId, matchId, (await this.summary(matchId)) ?? {}, this.now());
  }

  async touch(matchId: string): Promise<void> {
    await this.pool.query(`UPDATE rhyme_matches SET updated_at = $2 WHERE id = $1 AND status = 'lobby'`, [matchId, this.now()]);
  }

  /** Run on a timer: close lobbies nobody started, finish matches whose window passed unread. */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const id of await cancelIdleLobbies(this.pool, T, now)) this.changed(id);
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM rhyme_matches
        WHERE status = 'active' AND started_at + window_ms * interval '1 millisecond' <= $1
        LIMIT 200`,
      [now],
    );
    for (const r of due.rows) await this.finalizeIfElapsed(r.id);
  }

  // ---- internals ------------------------------------------------------------

  private elapsed(match: MatchRow, now: Date): boolean {
    return match.status === 'active' && match.started_at !== null && now.getTime() - match.started_at.getTime() >= match.window_ms;
  }

  /** A member's read: closes an idle lobby; a passed window is finished by `state`. */
  private async settle(match: MatchRow, now: Date): Promise<void> {
    if (!lobbyIdle(match, now)) return;
    const closed = await this.pool.query(
      `UPDATE rhyme_matches SET status = 'cancelled', finished_at = $3, updated_at = $3
        WHERE id = $1 AND status = 'lobby' AND updated_at = $2`,
      [match.id, match.updated_at, now],
    );
    if (closed.rowCount) this.changed(match.id);
  }

  private remainingMs(match: MatchRow, now: Date): number {
    if (match.status !== 'active' || !match.started_at) return match.status === 'lobby' ? match.window_ms : 0;
    return Math.max(0, match.window_ms - (now.getTime() - match.started_at.getTime()));
  }

  /**
   * Finalize the match if it's active and its window has elapsed. Only ever
   * called once a plain read found it due, so a poll of a running match takes
   * no lock; this judges again on the locked row.
   */
  private async finalizeIfElapsed(matchId: string): Promise<void> {
    const now = this.now();
    const ended = await this.tx(async (client) => {
      const match = await this.lock(client, matchId);
      if (!match || !this.elapsed(match, now)) return false;
      await this.finalize(client, matchId, now);
      return true;
    });
    if (ended) this.changed(matchId);
  }

  private async finalize(client: pg.PoolClient, matchId: string, now: Date): Promise<void> {
    const players = await client.query<PlayerRow>(`SELECT * FROM rhyme_match_players WHERE match_id = $1 AND NOT removed`, [matchId]);
    const ranked = rankRhyme(players.rows.map((r) => this.toResult(r)));
    const count = ranked.length;
    for (const r of ranked) {
      const xp = rhymePlacementXp(r.rank, count);
      await this.xp.award({ userId: r.userId, source: 'rhyme_match', amount: xp, refId: `match:${matchId}:${r.userId}` }, client);
      await client.query(`UPDATE rhyme_match_players SET xp_awarded = $3 WHERE match_id = $1 AND user_id = $2`, [matchId, r.userId, xp]);
    }
    await client.query(`UPDATE rhyme_matches SET status = 'finished', finished_at = $2, updated_at = $2 WHERE id = $1`, [matchId, now]);
  }

  private async cancelLobby(client: pg.PoolClient, matchId: string, now: Date): Promise<void> {
    await client.query(
      `UPDATE rhyme_matches SET status = 'cancelled', finished_at = $2, updated_at = $2 WHERE id = $1 AND status = 'lobby'`,
      [matchId, now],
    );
  }

  private async lock(client: pg.PoolClient, matchId: string): Promise<MatchRow | null> {
    const m = await client.query<MatchRow>(`SELECT * FROM rhyme_matches WHERE id = $1 FOR UPDATE`, [matchId]);
    return m.rows[0] ?? null;
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

  private changed(matchId: string, opts?: LobbyChange): void {
    try {
      this.onChange(matchId, opts);
    } catch {
      // telling the players is never a reason to fail what they did
    }
  }

  private toResult(r: PlayerRow): RhymeMatchPlayerResult {
    return { userId: r.user_id, score: r.score, accepted: r.accepted };
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
}
