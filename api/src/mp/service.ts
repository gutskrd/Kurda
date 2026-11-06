import type pg from 'pg';
import {
  LOBBY_IDLE_MINUTES,
  MAX_HOSTED_GAMES,
  MIN_HUMANS_FOR_PLACEMENT_XP,
  gameCounted,
  limitDetails,
  paidPlacementXp,
  type InviteSummary,
  type LetterDialect,
  type LobbyCard,
  type LobbyCardStatus,
  type MultiGame,
  type MultiSeat,
  type MultiView,
  type RulesSeat,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { lockPersonFor } from '../limits/limits.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { canJoin, identities, mayHostOpen, maySitTogether, textApart } from '../play/access.js';
import { gameNotFound, openGamesAdultsOnly, parseSettings, setRatedError } from '../play/errors.js';
import { seatId, tallySeries } from '../play/lobby.js';
import type { JoinOutcome, LobbyChange, LobbyFacts, LobbyPhase, Series } from '../play/types.js';
import { ratedStateOf } from '../ranks/games.js';
import { RankService } from '../ranks/service.js';
import { XpService } from '../xp/service.js';
import { dropAfterCommit, runAfterCommit } from '../db/after-commit.js';
import { Presence } from '../story-games/presence.js';
import type { StoryGameNotifier } from '../story-games/notifier.js';
import { awayAfter, controllerOf, dueStep, isAway, lobbyClosesAt, nextDue, type EngineSeat } from './engine.js';
import { gateFreeText, type FreeTextDeps } from './free-text.js';
import type { AnyGameModule } from './module.js';
import { moduleOf } from './registry.js';

/** A long-poll waits at most this long for a change. */
export const POLL_WAIT_MS = 20_000;
/** A finished game stops being waited on this long after it ended. */
const FINISHED_POLL_MINUTES = 10;
/** A game under way that nothing has moved for this long is ended where it stands (every turn has a clock, so only a broken one gets here). */
const STUCK_MINUTES = 120;
/** What players typed is kept with their moves this long after a game ends, for a report; then cleared. */
export const MOVE_TEXT_RETENTION_DAYS = 30;
/** Called-off lobbies are deleted after this long, ended games after GAME_RETENTION_DAYS. */
const CANCELLED_RETENTION_DAYS = 7;
const GAME_RETENTION_DAYS = 400;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// a timer further out than this is re-armed when it fires, rather than trusted for long
const MAX_TIMER_MS = 60 * 60 * 1000;

type Executor = Pick<pg.Pool, 'query'>;
type Status = 'lobby' | 'active' | 'finished' | 'cancelled';

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

export interface LobbyRow {
  id: string;
  game: MultiGame;
  host_id: string | null;
  mode: 'group' | 'solo';
  status: Status;
  dialect: LetterDialect;
  settings: unknown;
  state: unknown;
  seed: string;
  version: number;
  due_at: Date | null;
  wait_since: Date | null;
  min_players: number;
  max_players: number;
  teams: number;
  seats_issued: number;
  access: 'friends' | 'open';
  chat_group_id: string | null;
  next_lobby_id: string | null;
  rematch_of: string | null;
  rated: boolean;
  rated_state: string | null;
  code: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface PlayerRow {
  lobby_id: string;
  seat: number;
  user_id: string | null;
  bot: string | null;
  team: number | null;
  joined_at: Date;
  last_seen_at: Date | null;
  left_at: Date | null;
  removed: boolean;
  away: boolean;
  missed_turns: number;
  moves: number;
  place: number | null;
  score: number | null;
  xp_awarded: number | null;
}

/** A game locked in a transaction, with what the engine reads. */
interface Tx {
  client: pg.PoolClient;
  lobby: LobbyRow;
  players: PlayerRow[];
  /** the database clock, read after the lock was taken */
  now: Date;
  changed: boolean;
  /** a change a chat card could show (who is in it, whether it started, ended or was called off) */
  card: boolean;
  /** someone no longer in it to tell this once (a player just removed) */
  also: string[];
  /** people whose word or text tripped the profanity filter, for the offense ladder after the commit */
  offenses: string[];
}

type RunResult<T> = { value: T } | 'busy' | 'missing';

export interface MultiplayerDeps {
  xp?: XpService;
  ranks?: RankService;
  /** long-poll waiters and the cross-instance wake-ups; none in a worker */
  notifier?: StoryGameNotifier | null;
  presence?: Presence;
  /** the chat pipeline, for games that take free text, and the offense ladder */
  freeText?: Omit<FreeTextDeps, 'db'>;
  /** after every committed change: the play layer's `play_changed` */
  onChange?: (game: MultiGame, lobbyId: string, opts?: LobbyChange) => void;
  publicUrl?: PublicUrl;
  log?: Log;
  /** arm deadline timers (off for a one-off use outside the API process, such as account deletion in the worker) */
  timers?: boolean;
  /** availability answers are cached here for a few minutes when there is a cache */
  cache?: { withCache<T>(domain: string, id: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> };
}

export interface MoveAnswer {
  view: MultiView;
  outcome: unknown;
}

/**
 * The engine every multiplayer learning game runs on (shared/src/games/multi):
 * lobbies and seats in three tables of their own, the play layer's lobby rules
 * (who may join, seats as "Player N", invites, codes, cards, rematches,
 * Rated/Friendly), and a phase engine generalised from the story games.
 *
 * The rules that keep it right with several API instances and a pool of ten
 * connections, as the story games' (story-games/service.ts):
 *
 * - Every change is one transaction that locks the lobby row first (`FOR
 *   UPDATE`), reads the database's clock after the lock, and only then checks
 *   who the caller is. Each bumps `version`; long-polls are woken after COMMIT.
 * - Deadlines are columns. `due_at` is the next instant something is due on a
 *   game, so a sweep on any replica finds what is due; on the instance that
 *   last touched a game a timer is armed for it too. An advance takes the row
 *   with `SKIP LOCKED` and judges due-ness on the locked row with the
 *   database's clock, so two replicas never both apply a timeout.
 * - A long-poll holds no connection while it waits.
 * - Placement XP, Game Ranks and the end of the game happen in the
 *   transaction that ends it, so nothing depends on anyone reading the result.
 * - Nothing waits on a pool connection while holding one: the free-text gate
 *   runs before the game's transaction, the dictionary lookups inside it on its
 *   own client. And the gate runs only for a member whose move it may be: who
 *   is asking, and whether it is their turn, is read first, cheaply and outside
 *   the lock (the rules judge again under it), so nobody's text reaches the
 *   chat pipeline, its classifier or its offense ladder for a move that would
 *   be refused anyway.
 * - A game that ends without counting (`counted` in its rules: called off,
 *   too few left) pays no placement and is closed for Game Ranks as void.
 * - Free text is never exchanged between two players who may not
 *   (`textApart`: a block, or a minor and someone not their friend): such a
 *   pair is never seated together in a game that takes it, what one writes is
 *   left out of the other's view, and a block made during a game takes the
 *   blocked player out of it (`onBlock`).
 */
export class MultiplayerService {
  readonly presence: Presence;
  private readonly xp: XpService;
  private readonly ranks: RankService;
  private readonly notifier: StoryGameNotifier | null;
  private readonly onChange: NonNullable<MultiplayerDeps['onChange']>;
  private readonly publicUrl: PublicUrl;
  private readonly log: Log;
  private readonly useTimers: boolean;
  private readonly timers = new Map<string, { at: number; timer: NodeJS.Timeout }>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly rerun = new Set<string>();
  private closing = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: MultiplayerDeps = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.ranks = deps.ranks ?? new RankService(pool);
    this.notifier = deps.notifier ?? null;
    this.presence = deps.presence ?? new Presence();
    this.onChange = deps.onChange ?? (() => undefined);
    this.publicUrl = deps.publicUrl ?? (() => null);
    this.log = deps.log ?? { warn: () => undefined };
    this.useTimers = deps.timers ?? true;
  }

  // -------------------------------------------------------------------------
  // making a game

  /**
   * A group lobby with its host in seat 1 (`POST /play/lobbies`, through the
   * game's adapter). Settings are the game's presets (400 otherwise); 'open'
   * only for a known adult; at most MAX_HOSTED_GAMES of this game at once, the
   * oldest lobby nobody started giving way.
   */
  async create(hostId: string, game: MultiGame, raw: unknown, opts: { chatGroupId: string | null; fromChat: boolean }): Promise<string> {
    const m = moduleOf(game);
    const choices = parseSettings(m.lobbySchema, raw);
    if (choices.access === 'open' && !(await mayHostOpen(this.pool, hostId))) throw openGamesAdultsOnly();
    // a game is made only where it is offered: a word chain on a dictionary too small to know people's words is no game
    if (!(await this.availability(game, choices.dialect)).group) throw new AppError('GAME_UNAVAILABLE', 404, 'this game is not offered in this dialect yet');
    if (m.offers && !(await m.offers(this.pool, choices))) throw new AppError('GAME_UNAVAILABLE', 404, 'this game is not offered with these choices yet');
    const rated =
      choices.rated ?? (await this.ranks.defaultRated(this.pool, hostId, game, { fromChat: opts.fromChat, access: choices.access }));
    const { id, closed } = await this.tx(async (client) => {
      const closed = await this.makeRoomToHost(client, game, hostId);
      const row = await client.query<{ id: string }>(
        `INSERT INTO game_lobbies (game, host_id, mode, dialect, settings, min_players, max_players, teams, access,
                                   chat_group_id, rated, seats_issued)
         VALUES ($1, $2, 'group', $3, $4, $5, $6, $7, $8, $9, $10, 1) RETURNING id`,
        [
          game,
          hostId,
          choices.dialect,
          JSON.stringify(choices.settings),
          m.minPlayers,
          Math.min(m.maxPlayers, choices.maxPlayers),
          m.teams,
          choices.access,
          opts.chatGroupId,
          rated,
        ],
      );
      const lobbyId = row.rows[0]!.id;
      await client.query(`INSERT INTO game_lobby_players (lobby_id, seat, user_id, team, last_seen_at) VALUES ($1, 1, $2, $3, now())`, [
        lobbyId,
        hostId,
        m.teams > 0 ? 1 : null,
      ]);
      if (choices.rated !== undefined) await this.ranks.rememberChoice(client, hostId, game, choices.rated);
      return { id: lobbyId, closed };
    });
    if (closed) this.tell(game, closed, { card: true });
    this.tell(game, id, { card: true });
    return id;
  }

  /**
   * One person against Hevalo (`POST /mp/:game/solo`): no lobby, nobody to
   * invite, started at once. Offered only where the game has the content
   * (`availability`). A person's earlier game against Hevalo of this game, if
   * one is still going, ends where it stands: one at a time.
   */
  async createSolo(userId: string, game: MultiGame, raw: unknown): Promise<MultiView> {
    const m = moduleOf(game);
    if (!m.solo) throw new AppError('NO_SOLO', 400, 'this game is played with people');
    const choices = parseSettings(m.lobbySchema, raw);
    if (!(await this.availability(game, choices.dialect)).solo) throw new AppError('GAME_UNAVAILABLE', 404, 'this game is not offered in this dialect yet');
    const ended: string[] = [];
    const id = await this.tx(async (client) => {
      await lockPersonFor(client, `solo:${game}`, userId);
      const old = await client.query<{ id: string }>(
        `SELECT l.id FROM game_lobbies l JOIN game_lobby_players p ON p.lobby_id = l.id
          WHERE l.game = $1 AND l.mode = 'solo' AND l.status = 'active' AND p.user_id = $2`,
        [game, userId],
      );
      for (const r of old.rows) ended.push(r.id);
      const row = await client.query<LobbyRow>(
        `INSERT INTO game_lobbies (game, host_id, mode, status, dialect, settings, min_players, max_players, rated, rated_state, seats_issued)
         VALUES ($1, $2, 'solo', 'active', $3, $4, 1, 2, false, 'solo', 2) RETURNING *`,
        [game, userId, choices.dialect, JSON.stringify(choices.settings)],
      );
      const lobby = row.rows[0]!;
      await client.query(
        `INSERT INTO game_lobby_players (lobby_id, seat, user_id, bot, last_seen_at) VALUES ($1, 1, $2, NULL, now()), ($1, 2, NULL, $3, NULL)`,
        [lobby.id, userId, m.solo!.bot],
      );
      return lobby.id;
    });
    for (const old of ended) {
      await this.run(old, async (t) => {
        if (t.lobby.status === 'active' && t.lobby.state) {
          await this.saveState(t, moduleOf(t.lobby.game).rules.end(t.lobby.state, t.now.getTime()));
          await this.settle(t);
        }
      });
    }
    await this.run(id, (t) => this.begin(t));
    return this.view(id, userId);
  }

  /** At most MAX_HOSTED_GAMES lobbies and games under way of this game that the host is in; the oldest unstarted lobby gives way. */
  private async makeRoomToHost(client: pg.PoolClient, game: MultiGame, hostId: string): Promise<string | null> {
    await lockPersonFor(client, `hosting:${game}`, hostId);
    const hosted = await client.query<{ id: string; status: Status }>(
      `SELECT l.id, l.status FROM game_lobbies l
        WHERE l.host_id = $1 AND l.game = $2 AND l.mode = 'group'
          AND ((l.status = 'lobby' AND l.updated_at > now() - make_interval(mins => $3))
            OR (l.status = 'active' AND l.updated_at > now() - make_interval(mins => $4)))
          AND EXISTS (SELECT 1 FROM game_lobby_players p WHERE p.lobby_id = l.id AND p.user_id = $1 AND p.left_at IS NULL AND NOT p.removed)
        ORDER BY l.created_at`,
      [hostId, game, LOBBY_IDLE_MINUTES, STUCK_MINUTES],
    );
    if (hosted.rows.length < MAX_HOSTED_GAMES) return null;
    const oldest = hosted.rows.find((g) => g.status === 'lobby');
    if (!oldest) throw new AppError('TOO_MANY_GAMES', 409, 'finish one of your games first', limitDetails('hosted_games'));
    const closed = await client.query<{ id: string }>(
      `UPDATE game_lobbies SET status = 'cancelled', finished_at = now(), updated_at = now(), version = version + 1
        WHERE id = $1 AND status = 'lobby' RETURNING id`,
      [oldest.id],
    );
    return closed.rows[0]?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // joining, leaving and the lobby

  /** The game's own join (the play layer's invites and codes come here): the join rule first, under the lobby's lock. */
  async join(userId: string, lobbyId: string): Promise<JoinOutcome> {
    if (!UUID_RE.test(lobbyId)) return 'not-found';
    const res = await this.run<JoinOutcome>(lobbyId, async (t) => {
      if (t.lobby.mode === 'solo') return 'not-found';
      const mine = t.players.find((p) => p.user_id === userId);
      if (mine && !mine.removed) return 'already';
      if (t.lobby.status === 'cancelled') return 'not-found';
      if (t.lobby.status === 'lobby' && this.idle(t)) {
        await this.cancel(t);
        return 'not-found';
      }
      if (!(await this.mayJoin(t.client, t.lobby, t.players, userId))) return 'not-found';
      if (t.lobby.status !== 'lobby') return 'started';
      if (this.people(t.players).filter((p) => p.left_at === null).length >= t.lobby.max_players) return 'full';
      const seat = await t.client.query<{ seat: number }>(
        `UPDATE game_lobbies SET seats_issued = seats_issued + 1 WHERE id = $1 RETURNING seats_issued AS seat`,
        [lobbyId],
      );
      const team = t.lobby.teams > 0 ? this.smallestTeam(t) : null;
      await t.client.query(`INSERT INTO game_lobby_players (lobby_id, seat, user_id, team, last_seen_at) VALUES ($1, $2, $3, $4, now())`, [
        lobbyId,
        seat.rows[0]!.seat,
        userId,
        team,
      ]);
      await this.bump(t, 'status = status', [], { card: true });
      return 'joined';
    });
    return res === 'missing' || res === 'busy' ? 'not-found' : res.value;
  }

  /**
   * Leave: a lobby (the host leaving calls it off — the others were let in as
   * the host's friends, so it cannot pass to someone else), or a game under
   * way (gone: their seat is out, a Rated game counts it as a leave, and with
   * every person gone the game ends).
   */
  async leave(lobbyId: string, userId: string): Promise<void> {
    await this.inLobby(lobbyId, async (t) => {
      const me = this.member(t, userId);
      if (t.lobby.status === 'lobby') {
        if (t.lobby.host_id === userId) return this.cancel(t);
        await t.client.query(`DELETE FROM game_lobby_players WHERE lobby_id = $1 AND user_id = $2`, [lobbyId, userId]);
        await this.reload(t);
        return this.bump(t, 'status = status', [], { card: true });
      }
      if (t.lobby.status !== 'active' || me.left_at !== null) return;
      if (t.lobby.mode === 'group') await this.ranks.recordLeave(t.client, t.lobby.game, lobbyId, userId);
      await t.client.query(`UPDATE game_lobby_players SET left_at = $3 WHERE lobby_id = $1 AND seat = $2`, [lobbyId, me.seat, t.now]);
      await this.reload(t);
      await this.recordMove(t, me.seat, userId, 'leave', null, {});
      const rules = moduleOf(t.lobby.game).rules;
      await this.saveState(t, rules.drop(t.lobby.state, me.seat, t.now.getTime()), { card: true });
      await this.settle(t);
    });
  }

  /** The host takes a player out of the lobby, by seat; they cannot come back to it. */
  async remove(lobbyId: string, hostId: string, seat: number): Promise<MultiView> {
    await this.inLobby(lobbyId, async (t) => {
      this.member(t, hostId);
      if (t.lobby.host_id !== hostId) throw new AppError('NOT_HOST', 403, 'only the host can do this');
      if (t.lobby.status !== 'lobby' || this.idle(t)) throw new AppError('GAME_STARTED', 409, 'only in the lobby');
      const target = t.players.find((p) => p.seat === seat && p.user_id !== null && !p.removed);
      if (!target || target.user_id === hostId) throw new AppError('NO_SEAT', 404, 'nobody in that seat');
      await t.client.query(`UPDATE game_lobby_players SET removed = true WHERE lobby_id = $1 AND seat = $2`, [lobbyId, seat]);
      t.also.push(target.user_id!);
      await this.reload(t);
      await this.bump(t, 'status = status', [], { card: true });
    });
    return this.view(lobbyId, hostId);
  }

  /** A seat goes to a team, in the lobby of a team game: the host may put anyone on one, a player only themselves. */
  async setTeam(lobbyId: string, userId: string, seat: number, team: number): Promise<MultiView> {
    await this.inLobby(lobbyId, async (t) => {
      const me = this.member(t, userId);
      if (t.lobby.host_id !== userId && me.seat !== seat) throw new AppError('NOT_HOST', 403, 'only the host can do this');
      if (t.lobby.status !== 'lobby') throw new AppError('GAME_STARTED', 409, 'only in the lobby');
      if (t.lobby.teams === 0 || team < 1 || team > t.lobby.teams) throw new AppError('BAD_TEAM', 400, 'no such team');
      const target = t.players.find((p) => p.seat === seat && !p.removed);
      if (!target) throw new AppError('NO_SEAT', 404, 'nobody in that seat');
      await t.client.query(`UPDATE game_lobby_players SET team = $3 WHERE lobby_id = $1 AND seat = $2`, [lobbyId, seat, team]);
      await this.reload(t);
      await this.bump(t, 'status = status');
    });
    return this.view(lobbyId, userId);
  }

  /** Rated or Friendly, in the lobby only, by the host (the play layer's toggle). */
  async setRated(hostId: string, lobbyId: string, rated: boolean): Promise<void> {
    const res = await this.run<'not-found' | 'forbidden' | 'not-lobby' | null>(lobbyId, async (t) => {
      const me = t.players.find((p) => p.user_id === hostId && !p.removed && p.left_at === null);
      if (!me || t.lobby.mode === 'solo') return 'not-found';
      if (t.lobby.host_id !== hostId) return 'forbidden';
      if (t.lobby.status !== 'lobby' || this.idle(t)) return 'not-lobby';
      await this.bump(t, 'rated = $3', [rated]);
      await this.ranks.rememberChoice(t.client, hostId, t.lobby.game, rated);
      return null;
    });
    const reason = res === 'missing' || res === 'busy' ? 'not-found' : res.value;
    if (reason) throw setRatedError(reason);
  }

  /** The host starts it, with at least the game's fewest players present. */
  async start(lobbyId: string, userId: string): Promise<MultiView> {
    await this.inLobby(lobbyId, async (t) => {
      this.member(t, userId);
      if (t.lobby.host_id !== userId) throw new AppError('NOT_HOST', 403, 'only the host can start the game');
      if (t.lobby.status !== 'lobby' || this.idle(t)) throw new AppError('GAME_STARTED', 409, 'this game has already started');
      const present = this.people(t.players).filter((p) => p.left_at === null);
      if (present.length < t.lobby.min_players) throw new AppError('NEED_PLAYERS', 409, `at least ${t.lobby.min_players} players`);
      // the game's own word on the seats as they stand (a team game's teams too small); teams left empty are filled at the start
      const problem = moduleOf(t.lobby.game).rules.startProblem?.(
        present.map((p) => ({ seat: p.seat, team: p.team ?? (t.lobby.teams > 0 ? this.smallestTeam(t) : null), bot: p.bot })),
      );
      if (problem) throw new AppError('CANNOT_START', 409, 'the seats cannot start this game as they stand', { reason: problem });
      await this.begin(t);
    });
    return this.view(lobbyId, userId);
  }

  /** The rules' first state, Rated decided on who is actually starting, the first deadline. */
  private async begin(t: Tx): Promise<void> {
    const m = moduleOf(t.lobby.game);
    if (t.lobby.teams > 0) {
      for (const p of t.players.filter((x) => !x.removed && x.team === null)) {
        await t.client.query(`UPDATE game_lobby_players SET team = $3 WHERE lobby_id = $1 AND seat = $2`, [t.lobby.id, p.seat, this.smallestTeam(t)]);
        await this.reload(t);
      }
    }
    const seated = t.players.filter((p) => !p.removed && p.left_at === null);
    const seats: RulesSeat[] = seated.map((p) => ({ seat: p.seat, team: p.team, bot: p.bot }));
    let decision = t.lobby.rated_state;
    if (t.lobby.mode === 'group') {
      decision = await this.ranks.decideAtStart(
        t.client,
        t.lobby.game,
        t.lobby.id,
        seated.filter((p) => p.user_id !== null).map((p) => ({ userId: p.user_id!, seat: p.seat })),
        t.lobby.rated,
      );
    }
    // what the game is dealt from approved content goes to the rules alone: never into the lobby's stored settings
    const settings = m.deal ? await m.deal(t.client, t.lobby.settings, { dialect: t.lobby.dialect, seed: t.lobby.seed, seats }) : t.lobby.settings;
    const state = m.rules.init(settings, seats, { now: t.now.getTime(), seed: t.lobby.seed });
    await this.bump(t, `status = 'active', started_at = $3, rated_state = $4`, [t.now, decision], { card: true });
    await this.saveState(t, state, { card: true });
  }

  // -------------------------------------------------------------------------
  // playing

  /**
   * A move by the player whose turn it is. What is due is applied first (a
   * move after the turn's time is a move into the next turn, and is refused
   * as not this player's), then the game's module prepares it, the rules judge
   * it, and the view comes back with what the mover alone is told.
   */
  async move(lobbyId: string, userId: string, body: unknown): Promise<MoveAnswer> {
    if (!UUID_RE.test(lobbyId)) throw gameNotFound();
    const head = await this.pool.query<LobbyRow>(`SELECT * FROM game_lobbies WHERE id = $1`, [lobbyId]);
    const lobby = head.rows[0];
    if (!lobby) throw gameNotFound();
    const m = moduleOf(lobby.game);
    const parsed = m.moveSchema.safeParse(body);
    if (!parsed.success) throw new AppError('BAD_MOVE', 400, 'not a move this game takes');
    const typed = m.freeText ? m.freeText.textOf(parsed.data) : null;
    // a game that takes free text is not played anywhere the chat pipeline is not
    if (typed !== null && !this.deps.freeText) throw new AppError('UNAVAILABLE', 503, 'this game cannot take text here');
    // who is asking, and whether the move is theirs to make, before the text goes anywhere
    if (typed !== null) await this.mayType(lobby, userId);
    // free text passes the chat pipeline before the game's lock is taken, and before anyone sees it
    const text =
      typed !== null && m.freeText && this.deps.freeText
        ? await gateFreeText({ db: this.pool, ...this.deps.freeText }, userId, typed, {
            maxLength: m.freeText.maxLength,
            contentRef: `${m.game}:${lobbyId}`,
          })
        : null;
    let outcome: unknown = null;
    // a refusal found after settling what was due is said once that has committed:
    // thrown inside, it would roll back a turn that had just run out
    let refusal: AppError | null = null;
    await this.inLobby(lobbyId, async (t) => {
      const me = this.member(t, userId);
      await this.settle(t);
      if (t.lobby.status !== 'active' || !t.lobby.state || me.left_at !== null) {
        refusal = new AppError('NOT_ACTIVE', 409, 'this game is not under way');
        return;
      }
      const rules = m.rules;
      const may = rules.mayMove ? rules.mayMove(t.lobby.state, me.seat) : rules.waitingFor(t.lobby.state).includes(me.seat);
      if (!may) {
        refusal = new AppError('NOT_YOUR_TURN', 409, 'it is not your turn');
        return;
      }
      const prepared = await m.prepare(t.client, t.lobby.state, me.seat, { raw: parsed.data, text });
      const applied = rules.apply(t.lobby.state, me.seat, prepared.move, t.now.getTime());
      if (!applied.ok) {
        refusal = new AppError('MOVE_REFUSED', 409, 'that move is not open now', { reason: applied.reason });
        return;
      }
      outcome = applied.outcome;
      if (prepared.offense) t.offenses.push(userId);
      await this.recordMove(t, me.seat, userId, 'move', text ?? prepared.text, { outcome: applied.outcome });
      await t.client.query(
        `UPDATE game_lobby_players SET moves = moves + 1, missed_turns = 0, away = false, last_seen_at = now() WHERE lobby_id = $1 AND seat = $2`,
        [lobbyId, me.seat],
      );
      await this.reload(t);
      await this.saveState(t, applied.state);
      await this.settle(t);
    });
    if (refusal) throw refusal;
    return { view: await this.view(lobbyId, userId), outcome };
  }

  /**
   * Before a move's text passes the free-text gate: the mover is a member
   * still in a game under way, and it is their move — read without the lock,
   * so it costs one query, and judged on the state as it stands unless
   * something is due on it (a turn run out, a seat to pass over), which only
   * the lock may settle and which may make it their move. The same refusals
   * the move would meet under the lock, said before anyone reads the text.
   */
  private async mayType(lobby: LobbyRow, userId: string): Promise<void> {
    const players = await this.loadPlayers(this.pool, lobby.id);
    const me = players.find((p) => p.user_id === userId && !p.removed);
    if (!me) throw gameNotFound();
    if (lobby.status !== 'active' || !lobby.state || me.left_at !== null) throw new AppError('NOT_ACTIVE', 409, 'this game is not under way');
    const rules = moduleOf(lobby.game).rules;
    const now = Date.now();
    const waitSince = (lobby.wait_since ?? lobby.started_at ?? new Date(now)).getTime();
    if (dueStep(rules, lobby.state, this.engineSeats(lobby, players), now, waitSince) !== null) return;
    const may = rules.mayMove ? rules.mayMove(lobby.state, me.seat) : rules.waitingFor(lobby.state).includes(me.seat);
    if (!may) throw new AppError('NOT_YOUR_TURN', 409, 'it is not your turn');
  }

  // -------------------------------------------------------------------------
  // reading

  /**
   * One game as `userId` may see it. A member sees it whole (as their seat);
   * someone the join rule would let in sees an open lobby, to join it, and is
   * told 'started' about a game under way; everyone else is told it does not
   * exist.
   */
  async view(lobbyId: string, userId: string): Promise<MultiView> {
    if (!UUID_RE.test(lobbyId)) throw gameNotFound();
    const l = await this.pool.query<LobbyRow>(`SELECT * FROM game_lobbies WHERE id = $1`, [lobbyId]);
    const lobby = l.rows[0];
    if (!lobby) throw gameNotFound();
    const players = await this.loadPlayers(this.pool, lobbyId);
    const mine = players.find((p) => p.user_id === userId);
    if (mine?.removed) throw gameNotFound();
    if (!mine) {
      if (lobby.mode === 'solo' || lobby.status === 'cancelled') throw gameNotFound();
      if (!(await this.mayJoin(this.pool, lobby, players, userId))) throw gameNotFound();
      if (lobby.status !== 'lobby' || Date.now() >= lobbyClosesAt(lobby.updated_at.getTime())) {
        if (lobby.status === 'lobby') throw gameNotFound();
        throw new AppError('GAME_STARTED', 409, 'this game has already started');
      }
    }
    return this.render(lobby, players, userId);
  }

  /**
   * `GET /mp/:game/:id?v=`: the view now when it moved past `v` (or no `v`
   * was given), else once it does — or after at most 20 s, or just after its
   * next deadline. As the story games' poll: the waiter is registered before
   * the one plain read of the version, nothing is held while it waits, and
   * something overdue is settled before answering.
   */
  async poll(lobbyId: string, userId: string, since: number | undefined, onClose: (stop: () => void) => void = () => undefined): Promise<MultiView | null> {
    if (!UUID_RE.test(lobbyId)) throw gameNotFound();
    const wait = this.notifier && since !== undefined ? this.notifier.register(lobbyId, userId, since) : null;
    let clientGone = false;
    try {
      const head = await this.pool.query<{
        status: Status;
        version: number;
        finished_at: Date | null;
        due_at: Date | null;
        removed: boolean;
        last_seen_at: Date | null;
        joined_at: Date;
        away: boolean;
      }>(
        `SELECT l.status, l.version, l.finished_at, l.due_at, p.removed, p.last_seen_at, p.joined_at, p.away
           FROM game_lobbies l LEFT JOIN game_lobby_players p ON p.lobby_id = l.id AND p.user_id = $2
          WHERE l.id = $1`,
        [lobbyId, userId],
      );
      const row = head.rows[0];
      if (!row || row.removed) throw gameNotFound();
      if (row.joined_at) this.touch(lobbyId, userId, row.last_seen_at ?? row.joined_at, row.away && row.status === 'active');
      const ended =
        row.status === 'cancelled' ||
        (row.status === 'finished' && row.finished_at !== null && Date.now() - row.finished_at.getTime() > FINISHED_POLL_MINUTES * 60_000);
      if (wait && row.version === since && !ended && !this.closing && row.joined_at) {
        const due = this.timers.get(lobbyId)?.at ?? row.due_at?.getTime() ?? null;
        if (due !== null && due <= Date.now()) {
          await this.advance(lobbyId);
        } else {
          onClose(() => {
            clientGone = true;
            wait.cancel('closed');
          });
          wait.arm(Math.min(POLL_WAIT_MS, due === null ? POLL_WAIT_MS : due - Date.now() + 750));
          await wait.done;
        }
      }
    } finally {
      wait?.cancel();
    }
    if (clientGone) return null;
    return this.view(lobbyId, userId);
  }

  /** What may be offered in a dialect now (Learn's list asks this), cached for a few minutes. */
  async availability(game: MultiGame, dialect: LetterDialect): Promise<{ group: boolean; solo: boolean } & Record<string, unknown>> {
    const m = moduleOf(game);
    if (!m.availability) return { group: true, solo: !!m.solo };
    const read = () => m.availability!(this.pool, dialect);
    const answer = this.deps.cache ? await this.deps.cache.withCache('mp-availability', `${game}:${dialect}`, 300, read) : await read();
    // what more the game says about it (the languages its cards are in) goes with the answer
    return { ...answer, group: answer.group, solo: answer.solo && !!m.solo };
  }

  // -------------------------------------------------------------------------
  // for the play layer

  async facts(lobbyId: string): Promise<LobbyFacts | null> {
    if (!UUID_RE.test(lobbyId)) return null;
    const l = await this.pool.query<LobbyRow>(`SELECT * FROM game_lobbies WHERE id = $1`, [lobbyId]);
    const lobby = l.rows[0];
    if (!lobby || lobby.mode === 'solo') return null;
    return this.factsOf(lobby, await this.loadPlayers(this.pool, lobbyId));
  }

  private factsOf(lobby: LobbyRow, players: readonly PlayerRow[]): LobbyFacts {
    const phase = this.phaseOf(lobby);
    const members = this.people(players);
    return {
      game: lobby.game,
      lobbyId: lobby.id,
      // after the start the host controls pass to a stand-in while the host is away or gone (never in the lobby: see leave)
      hostId: phase === 'lobby' || phase === 'cancelled' ? lobby.host_id : (controllerOf(lobby.host_id, this.engineSeats(lobby, players)) ?? lobby.host_id),
      phase,
      joinable: phase === 'lobby',
      access: lobby.access,
      chatGroupId: lobby.chat_group_id,
      maxPlayers: lobby.max_players,
      memberIds: members.map((p) => p.user_id!),
      activeIds: members.filter((p) => p.left_at === null).map((p) => p.user_id!),
      removedIds: players.filter((p) => p.removed && p.user_id).map((p) => p.user_id!),
      nextLobbyId: lobby.next_lobby_id,
      rematchOf: lobby.rematch_of,
      rematchKind: members.length > 2 ? 'round' : 'pair',
    };
  }

  async summary(lobbyId: string): Promise<InviteSummary | null> {
    if (!UUID_RE.test(lobbyId)) return null;
    const l = await this.pool.query<Pick<LobbyRow, 'game' | 'dialect' | 'settings' | 'rated'>>(
      `SELECT game, dialect, settings, rated FROM game_lobbies WHERE id = $1`,
      [lobbyId],
    );
    const row = l.rows[0];
    if (!row) return null;
    return { ...moduleOf(row.game).summary(row.dialect, row.settings), rated: row.rated };
  }

  /** A chat card, as one viewer sees it: live to members and to anyone the join rule lets in; 'unavailable' to everyone else. */
  async card(viewerId: string, game: MultiGame, lobbyId: string): Promise<LobbyCard> {
    const unavailable: LobbyCard = { game, lobbyId, status: 'unavailable', players: 0, maxPlayers: 0, summary: {}, canJoin: false, isMember: false };
    if (!UUID_RE.test(lobbyId)) return unavailable;
    const l = await this.pool.query<LobbyRow>(`SELECT * FROM game_lobbies WHERE id = $1 AND game = $2`, [lobbyId, game]);
    const lobby = l.rows[0];
    if (!lobby || lobby.mode === 'solo') return unavailable;
    const players = await this.loadPlayers(this.pool, lobbyId);
    const mine = players.find((p) => p.user_id === viewerId);
    if (mine?.removed) return unavailable;
    if (!mine && !(await this.mayJoin(this.pool, lobby, players, viewerId))) return unavailable;
    const facts = this.factsOf(lobby, players);
    const count = facts.activeIds.length;
    const status: LobbyCardStatus =
      facts.phase === 'cancelled' ? 'cancelled' : facts.phase === 'finished' ? 'finished' : facts.phase === 'started' ? 'started' : count >= lobby.max_players ? 'full' : 'open';
    return {
      game,
      lobbyId,
      status,
      players: count,
      maxPlayers: lobby.max_players,
      summary: (await this.summary(lobbyId)) ?? {},
      canJoin: !mine && status === 'open',
      isMember: !!mine,
    };
  }

  /** A host still inviting people keeps the lobby from going idle. */
  async touchLobby(lobbyId: string): Promise<void> {
    await this.pool.query(`UPDATE game_lobbies SET updated_at = now() WHERE id = $1 AND status = 'lobby'`, [lobbyId]);
  }

  /** A lobby whose card could not be posted: the host leaves it, which calls it off. */
  async cancelByHost(hostId: string, lobbyId: string): Promise<void> {
    await this.leave(lobbyId, hostId).catch(() => undefined);
  }

  /**
   * A two-player rematch both asked for: a new game with the same settings and
   * both in it, started at once — still the join rule's call. Asking twice
   * gives the same one.
   */
  async startPairRematch(lobbyId: string): Promise<string> {
    let created: string | null = null;
    await this.inLobby(lobbyId, async (t) => {
      if (t.lobby.next_lobby_id) {
        created = t.lobby.next_lobby_id;
        return;
      }
      if (t.lobby.status !== 'finished') throw new AppError('NOT_FINISHED', 409, 'this game has not finished');
      const pair = this.people(t.players);
      if (pair.length !== 2) throw new AppError('NOT_A_PAIR', 409, 'a rematch is for two players');
      const host = pair.find((p) => p.user_id === t.lobby.host_id) ?? pair[0]!;
      const other = pair.find((p) => p !== host)!;
      const access = t.lobby.access === 'open' && (await mayHostOpen(t.client, host.user_id!)) ? 'open' : 'friends';
      const allowed = await canJoin(t.client, {
        joinerId: other.user_id!,
        hostId: host.user_id,
        access,
        memberIds: [host.user_id!],
        chatGroupId: t.lobby.chat_group_id,
        removed: false,
      });
      if (!allowed || (moduleOf(t.lobby.game).freeText && !(await maySitTogether(t.client, other.user_id!, [host.user_id!])))) throw gameNotFound();
      const row = await t.client.query<LobbyRow>(
        `INSERT INTO game_lobbies (game, host_id, mode, dialect, settings, min_players, max_players, teams, access, chat_group_id,
                                   rematch_of, rated, seats_issued)
         VALUES ($1, $2, 'group', $3, $4, $5, $6, $7, $8, $9, $10, $11, 2) RETURNING *`,
        [t.lobby.game, host.user_id, t.lobby.dialect, JSON.stringify(t.lobby.settings), t.lobby.min_players, t.lobby.max_players, t.lobby.teams,
          access, t.lobby.chat_group_id, t.lobby.id, t.lobby.rated],
      );
      created = row.rows[0]!.id;
      await t.client.query(
        `INSERT INTO game_lobby_players (lobby_id, seat, user_id, team, last_seen_at) VALUES ($1, 1, $2, $4, now()), ($1, 2, $3, $5, now())`,
        [created, host.user_id, other.user_id, t.lobby.teams > 0 ? 1 : null, t.lobby.teams > 0 ? 2 : null],
      );
      await this.bump(t, 'next_lobby_id = $3', [created], { card: true });
      // the rematch starts at once: its first turn, decided in this transaction on its own row
      const next = await this.lockWith(t.client, created);
      if (next) await this.begin(next);
    });
    if (created) {
      const game = await this.gameOf(created);
      if (game) this.tell(game, created, { card: true });
      await this.arm(created);
    }
    return created!;
  }

  /** A bigger game's "Play again": the next round, the host (or the stand-in) alone in it, the others join with one tap. */
  async openNextRound(userId: string, lobbyId: string): Promise<string> {
    let created: string | null = null;
    await this.inLobby(lobbyId, async (t) => {
      this.member(t, userId);
      if (t.lobby.next_lobby_id) {
        created = t.lobby.next_lobby_id;
        return;
      }
      if (t.lobby.status !== 'finished') throw new AppError('NOT_FINISHED', 409, 'this game has not finished');
      const controller = this.factsOf(t.lobby, t.players).hostId;
      if (controller !== userId) throw new AppError('NOT_HOST', 403, 'only the host can open the next round');
      const access = t.lobby.access === 'open' && (await mayHostOpen(t.client, userId)) ? 'open' : 'friends';
      const row = await t.client.query<{ id: string }>(
        `INSERT INTO game_lobbies (game, host_id, mode, dialect, settings, min_players, max_players, teams, access, chat_group_id,
                                   rematch_of, rated, seats_issued)
         VALUES ($1, $2, 'group', $3, $4, $5, $6, $7, $8, $9, $10, $11, 1) RETURNING id`,
        [t.lobby.game, userId, t.lobby.dialect, JSON.stringify(t.lobby.settings), t.lobby.min_players, t.lobby.max_players, t.lobby.teams,
          access, t.lobby.chat_group_id, t.lobby.id, t.lobby.rated],
      );
      created = row.rows[0]!.id;
      await t.client.query(`INSERT INTO game_lobby_players (lobby_id, seat, user_id, team, last_seen_at) VALUES ($1, 1, $2, $3, now())`, [
        created,
        userId,
        t.lobby.teams > 0 ? 1 : null,
      ]);
      await this.bump(t, 'next_lobby_id = $3', [created], { card: true });
    });
    if (created) this.tell((await this.gameOf(created))!, created, { card: true });
    return created!;
  }

  /** Wins between two players over a run of rematches ending in this game: first place wins, a shared first is a draw. */
  async series(lobbyId: string, me: string, other: string): Promise<Series> {
    const chain = await this.pool.query<{ id: string }>(
      `WITH RECURSIVE chain(id, rematch_of, depth) AS (
         SELECT id, rematch_of, 1 FROM game_lobbies WHERE id = $1
         UNION ALL
         SELECT g.id, g.rematch_of, c.depth + 1 FROM game_lobbies g JOIN chain c ON g.id = c.rematch_of WHERE c.depth < 100
       )
       SELECT id FROM chain`,
      [lobbyId],
    );
    const rows = await this.pool.query<{ lobby_id: string; user_id: string; place: number | null }>(
      `SELECT p.lobby_id, p.user_id, p.place FROM game_lobby_players p JOIN game_lobbies l ON l.id = p.lobby_id
        WHERE p.lobby_id = ANY($1::uuid[]) AND l.status = 'finished' AND NOT p.removed AND p.user_id IS NOT NULL`,
      [chain.rows.map((r) => r.id)],
    );
    const byGame = new Map<string, Array<{ user_id: string; place: number | null }>>();
    for (const r of rows.rows) byGame.set(r.lobby_id, [...(byGame.get(r.lobby_id) ?? []), r]);
    return tallySeries(
      [...byGame.values()].map((players) => ({
        players: players.map((p) => p.user_id),
        winners: players.filter((p) => p.place === 1).map((p) => p.user_id),
      })),
      me,
      other,
    );
  }

  // -------------------------------------------------------------------------
  // the clock: timers, the advance and the sweeps

  /**
   * Apply whatever is due on a game, once per game per instance at a time.
   * Skips a game another transaction holds (SKIP LOCKED) and tries again in
   * 250 ms rather than parking a connection behind it.
   */
  advance(lobbyId: string): Promise<void> {
    const running = this.inflight.get(lobbyId);
    if (running) {
      this.rerun.add(lobbyId);
      return running;
    }
    const p = this.doAdvance(lobbyId).finally(() => {
      this.inflight.delete(lobbyId);
      if (this.rerun.delete(lobbyId)) void this.advance(lobbyId);
    });
    this.inflight.set(lobbyId, p);
    return p;
  }

  private async doAdvance(lobbyId: string): Promise<void> {
    if (this.closing) return;
    try {
      const res = await this.run(lobbyId, (t) => this.settle(t), { skipLocked: true });
      if (res === 'busy') this.armAt(lobbyId, Date.now() + 250);
    } catch (err) {
      this.log.warn({ err, lobbyId }, 'multiplayer game advance failed');
      this.armAt(lobbyId, Date.now() + 30_000);
    }
  }

  /**
   * On the play layer's timer, on every replica: lobbies nobody started are
   * closed, games whose next deadline has passed are advanced (each with SKIP
   * LOCKED, so the replicas share the work and none applies a deadline twice),
   * and a game nothing has moved for STUCK_MINUTES ends where it stands.
   */
  async sweep(game: MultiGame): Promise<void> {
    const idle = await this.pool.query<{ id: string; game: MultiGame; version: number }>(
      `UPDATE game_lobbies SET status = 'cancelled', finished_at = now(), updated_at = now(), version = version + 1
        WHERE id IN (SELECT id FROM game_lobbies WHERE game = $2 AND status = 'lobby' AND updated_at <= now() - make_interval(mins => $1)
                      ORDER BY updated_at LIMIT 200 FOR UPDATE SKIP LOCKED)
        RETURNING id, game, version`,
      [LOBBY_IDLE_MINUTES, game],
    );
    for (const r of idle.rows) {
      this.notifier?.notify(r.id, r.version);
      this.tell(r.game, r.id, { card: true });
    }
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM game_lobbies WHERE status = 'active' AND due_at <= now() AND game = $1 ORDER BY due_at LIMIT 100`,
      [game],
    );
    for (const r of due.rows) await this.advance(r.id);
    const stuck = await this.pool.query<{ id: string }>(
      `SELECT id FROM game_lobbies WHERE status = 'active' AND game = $2 AND updated_at <= now() - make_interval(mins => $1) LIMIT 50`,
      [STUCK_MINUTES, game],
    );
    for (const r of stuck.rows) {
      await this.run(
        r.id,
        async (t) => {
          if (t.lobby.status !== 'active' || !t.lobby.state) return;
          await this.saveState(t, moduleOf(t.lobby.game).rules.end(t.lobby.state, t.now.getTime()), { card: true });
          await this.settle(t);
        },
        { skipLocked: true },
      ).catch((err) => this.log.warn({ err, lobbyId: r.id }, 'a stuck multiplayer game could not be ended'));
    }
  }

  /**
   * Every few hours: what players typed is cleared from games that ended a
   * month ago (a report files its own copy when it is made), called-off
   * lobbies go after a week and ended games after GAME_RETENTION_DAYS.
   */
  async housekeeping(): Promise<{ cleared: number; deleted: number }> {
    const cleared = await this.pool.query(
      `UPDATE game_moves m SET text = NULL, payload = '{}'::jsonb
        WHERE m.text IS NOT NULL AND m.lobby_id IN (
          SELECT id FROM game_lobbies WHERE finished_at < now() - make_interval(days => $1) LIMIT 2000)`,
      [MOVE_TEXT_RETENTION_DAYS],
    );
    const deleted = await this.pool.query(
      `DELETE FROM game_lobbies WHERE id IN (
         SELECT id FROM game_lobbies
          WHERE (status = 'cancelled' AND COALESCE(finished_at, updated_at) < now() - make_interval(days => $1))
             OR (status = 'finished' AND finished_at < now() - make_interval(days => $2))
          LIMIT 2000)`,
      [CANCELLED_RETENTION_DAYS, GAME_RETENTION_DAYS],
    );
    this.presence.prune(24 * 60 * 60 * 1000);
    return { cleared: cleared.rowCount ?? 0, deleted: deleted.rowCount ?? 0 };
  }

  /**
   * A block was made (after it committed): the pair are parted in every lobby
   * and game they share. In a lobby the one who goes is the blocked player
   * (the blocker, when the blocked player hosts it): the join rule would not
   * have let them in together. In a game under way that takes free text, the
   * blocked player is taken out of it — gone from the table, as a leave is,
   * but neither rated nor paid for it, since it was not their choice — so the
   * two stop seeing each other's text and stop playing together; the rules go
   * on without them (`drop`). A game without free text plays on.
   */
  async onBlock(blockerId: string, blockedId: string): Promise<void> {
    const shared = await this.pool.query<{ id: string }>(
      `SELECT l.id FROM game_lobbies l
        WHERE l.status IN ('lobby', 'active')
          AND EXISTS (SELECT 1 FROM game_lobby_players p WHERE p.lobby_id = l.id AND p.user_id = $1 AND NOT p.removed AND p.left_at IS NULL)
          AND EXISTS (SELECT 1 FROM game_lobby_players p WHERE p.lobby_id = l.id AND p.user_id = $2 AND NOT p.removed AND p.left_at IS NULL)
        ORDER BY l.id`,
      [blockerId, blockedId],
    );
    for (const { id } of shared.rows) {
      await this.run(id, async (t) => {
        const seated = (userId: string) => t.players.find((p) => p.user_id === userId && !p.removed && p.left_at === null);
        if (!seated(blockerId) || !seated(blockedId)) return;
        if (t.lobby.status === 'lobby') {
          const goes = t.lobby.host_id === blockedId ? blockerId : blockedId;
          await t.client.query(`DELETE FROM game_lobby_players WHERE lobby_id = $1 AND user_id = $2`, [id, goes]);
          t.also.push(goes);
          await this.reload(t);
          await this.bump(t, 'status = status', [], { card: true });
          return;
        }
        const m = moduleOf(t.lobby.game);
        if (t.lobby.status !== 'active' || !t.lobby.state || !m.freeText) return;
        const out = seated(blockedId)!;
        // taken out, as the host takes a player out of a lobby: no place, no pay, no rating, and nothing more of the game to see
        await t.client.query(`UPDATE game_lobby_players SET left_at = $3, removed = true WHERE lobby_id = $1 AND seat = $2`, [id, out.seat, t.now]);
        t.also.push(blockedId);
        await this.reload(t);
        await this.recordMove(t, out.seat, blockedId, 'leave', null, { reason: 'block' });
        await this.saveState(t, m.rules.drop(t.lobby.state, out.seat, t.now.getTime()), { card: true });
        await this.settle(t);
      }).catch((err) => this.log.warn({ err, lobbyId: id }, 'could not part a blocked pair in a multiplayer game'));
    }
  }

  /** An account closing: out of every lobby and game it is in, through the normal leave. */
  async leaveAll(userId: string): Promise<void> {
    const live = await this.pool.query<{ lobby_id: string }>(
      `SELECT p.lobby_id FROM game_lobby_players p JOIN game_lobbies l ON l.id = p.lobby_id
        WHERE p.user_id = $1 AND NOT p.removed AND p.left_at IS NULL AND l.status IN ('lobby','active')`,
      [userId],
    );
    for (const r of live.rows) {
      await this.leave(r.lobby_id, userId).catch((err) => this.log.warn({ err, lobbyId: r.lobby_id }, 'could not leave a multiplayer game'));
    }
  }

  /** On shutdown: no new timers, answer the waiting polls. */
  close(): void {
    this.closing = true;
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.notifier?.close();
  }

  /** Test seam: the instant a game's timer is armed for, if it is. */
  armedAt(lobbyId: string): number | null {
    return this.timers.get(lobbyId)?.at ?? null;
  }

  private async arm(lobbyId: string): Promise<void> {
    const r = await this.pool.query<{ due_at: Date | null }>(`SELECT due_at FROM game_lobbies WHERE id = $1 AND status = 'active'`, [lobbyId]);
    this.armAt(lobbyId, r.rows[0]?.due_at?.getTime() ?? null);
  }

  private armAt(lobbyId: string, at: number | null): void {
    const existing = this.timers.get(lobbyId);
    if (at === null || this.closing || !this.useTimers) {
      if (existing) clearTimeout(existing.timer);
      this.timers.delete(lobbyId);
      return;
    }
    if (existing?.at === at) return;
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(
      () => {
        this.timers.delete(lobbyId);
        void this.advance(lobbyId);
      },
      Math.min(Math.max(0, at - Date.now()), MAX_TIMER_MS),
    );
    timer.unref?.();
    this.timers.set(lobbyId, { at, timer });
  }

  // -------------------------------------------------------------------------
  // the engine, inside a game's transaction

  /** Apply every step that is due, in order (dueStep, engine.ts). */
  private async settle(t: Tx): Promise<void> {
    for (let i = 0; i < 16; i++) {
      if (t.lobby.status === 'lobby') {
        if (this.idle(t)) await this.cancel(t);
        return;
      }
      if (t.lobby.status !== 'active' || !t.lobby.state) return;
      const m = moduleOf(t.lobby.game);
      const now = t.now.getTime();
      const step = dueStep(m.rules, t.lobby.state, this.engineSeats(t.lobby, t.players), now, this.waitSince(t));
      if (!step) return;
      switch (step.kind) {
        case 'finish':
          await this.finish(t, m);
          return;
        case 'end':
          await this.saveState(t, m.rules.end(t.lobby.state, now), { card: true });
          break;
        case 'bot': {
          const move = m.bot ? await m.bot(t.client, t.lobby.state, step.seat) : null;
          const applied = move ? m.rules.apply(t.lobby.state, step.seat, move, now) : null;
          if (applied?.ok) {
            // Hevalo's move is curated content: kept whole in the payload, no typed text
            await this.recordMove(t, step.seat, null, 'move', null, { outcome: applied.outcome, move });
            await this.saveState(t, applied.state);
          } else {
            await this.recordMove(t, step.seat, null, 'timeout', null, {});
            await this.saveState(t, m.rules.timeout(t.lobby.state, [step.seat], now));
          }
          break;
        }
        case 'timeout':
        case 'skip': {
          for (const seat of step.seats) {
            const p = t.players.find((x) => x.seat === seat);
            await this.recordMove(t, seat, p?.user_id ?? null, step.kind, null, {});
            if (!p) continue;
            // two turns in a row run out, and the next are passed over until they are back
            await t.client.query(
              `UPDATE game_lobby_players SET missed_turns = missed_turns + 1, away = away OR $3 WHERE lobby_id = $1 AND seat = $2`,
              [t.lobby.id, seat, awayAfter(p.missed_turns + 1)],
            );
          }
          await this.reload(t);
          await this.saveState(t, m.rules.timeout(t.lobby.state, step.seats, now));
          break;
        }
      }
    }
  }

  /**
   * The end, in the transaction that reached it: each seat's place and score,
   * placement XP (only with at least two people who played to the end, less
   * against the same people again today), what a game against Hevalo pays, and
   * Game Ranks. A game its rules say did not count (`counted`: called off,
   * too few left, the impostor gone) shows its places but pays no placement
   * and is closed for Game Ranks as void: everyone still seated would
   * otherwise share first place for a game nobody finished.
   */
  private async finish(t: Tx, m: AnyGameModule): Promise<void> {
    const placed = m.rules.places(t.lobby.state);
    for (const p of placed) {
      await t.client.query(`UPDATE game_lobby_players SET place = $3, score = $4 WHERE lobby_id = $1 AND seat = $2`, [t.lobby.id, p.seat, p.place, p.score]);
    }
    await this.reload(t);
    const award = (input: { userId: string; source: string; amount: number; refId: string }) => this.xp.award(input, t.client);
    const people = this.people(t.players);
    // called off, or too few left to go on: a game nobody played out pays no placement and rates nobody
    const counted = gameCounted(m.rules, t.lobby.state);
    if (t.lobby.mode === 'group' && !counted) {
      await this.ranks.closeUncounted(t.client, t.lobby.game, t.lobby.id);
    } else if (t.lobby.mode === 'group') {
      // played to the end: still in it, and made at least one move of their own
      const active = people.filter((p) => p.left_at === null && p.moves > 0);
      if (active.length >= MIN_HUMANS_FOR_PLACEMENT_XP) {
        for (const p of active) {
          const placeOf = placed.find((x) => x.seat === p.seat);
          if (!placeOf) continue;
          const opponents = active.filter((o) => o !== p).map((o) => o.user_id!);
          const earlier = await this.gamesTodayWith(t, p.user_id!, opponents);
          const amount = paidPlacementXp(placeOf.place, placed.length, earlier);
          const paid = amount > 0 ? await award({ userId: p.user_id!, source: m.xpSource, amount, refId: `mp:${t.lobby.id}:${p.user_id}` }) : 0;
          await t.client.query(`UPDATE game_lobby_players SET xp_awarded = $3 WHERE lobby_id = $1 AND seat = $2`, [t.lobby.id, p.seat, paid]);
        }
      }
      await this.ranks.finish(
        t.client,
        t.lobby.game,
        t.lobby.id,
        people.flatMap((p) => {
          const placeOf = placed.find((x) => x.seat === p.seat);
          return placeOf ? [{ userId: p.user_id!, place: placeOf.place }] : [];
        }),
      );
    } else if (m.payAgainstHevalo) {
      const me = people[0];
      if (me && me.moves > 0) {
        const paid = await m.payAgainstHevalo(t.client, { lobbyId: t.lobby.id, userId: me.user_id!, seat: me.seat, dialect: t.lobby.dialect, now: t.now, award }, t.lobby.state);
        await t.client.query(`UPDATE game_lobby_players SET xp_awarded = $3 WHERE lobby_id = $1 AND seat = $2`, [t.lobby.id, me.seat, paid]);
      }
    }
    await this.reload(t);
    await this.bump(t, `status = 'finished', finished_at = $3, due_at = NULL`, [t.now], { card: true });
  }

  /** Finished games of this game today (UTC) in which this person played with any of these people. */
  private async gamesTodayWith(t: Tx, userId: string, others: readonly string[]): Promise<number> {
    const r = await t.client.query<{ n: number }>(
      `SELECT count(DISTINCT l.id)::int AS n FROM game_lobbies l
         JOIN game_lobby_players me ON me.lobby_id = l.id AND me.user_id = $1 AND NOT me.removed
         JOIN game_lobby_players o ON o.lobby_id = l.id AND o.user_id = ANY($2::uuid[]) AND NOT o.removed
        WHERE l.game = $3 AND l.mode = 'group' AND l.status = 'finished' AND l.id <> $4
          AND l.finished_at >= date_trunc('day', $5::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [userId, others, t.lobby.game, t.lobby.id, t.now],
    );
    return r.rows[0]?.n ?? 0;
  }

  /** The rules' new state, with when the present wait began and the next deadline. */
  private async saveState(t: Tx, state: unknown, opts: { card?: boolean } = {}): Promise<void> {
    const rules = moduleOf(t.lobby.game).rules;
    const before = t.lobby.state ? rules.waitingFor(t.lobby.state).join(',') : null;
    const after = rules.waitingFor(state).join(',');
    const waitSince = before === after && t.lobby.wait_since ? t.lobby.wait_since : t.now;
    const due = nextDue(rules, state, this.engineSeats(t.lobby, t.players), waitSince.getTime());
    await this.bump(t, `state = $3::jsonb, wait_since = $4, due_at = $5`, [JSON.stringify(state), waitSince, due === null ? null : new Date(due)], opts);
  }

  private async recordMove(t: Tx, seat: number, userId: string | null, kind: 'move' | 'timeout' | 'skip' | 'leave', text: string | null, payload: object): Promise<void> {
    await t.client.query(
      `INSERT INTO game_moves (lobby_id, seq, seat, user_id, kind, text, payload)
       VALUES ($1, (SELECT COALESCE(max(seq), 0) + 1 FROM game_moves WHERE lobby_id = $1), $2, $3, $4, $5, $6::jsonb)`,
      [t.lobby.id, seat, userId, kind, text === null ? null : text.slice(0, 300), JSON.stringify(payload)],
    );
  }

  private async cancel(t: Tx): Promise<void> {
    await this.bump(t, `status = 'cancelled', finished_at = $3, due_at = NULL`, [t.now], { card: true });
  }

  private idle(t: Tx): boolean {
    return t.lobby.status === 'lobby' && t.now.getTime() >= lobbyClosesAt(t.lobby.updated_at.getTime());
  }

  private waitSince(t: Tx): number {
    return (t.lobby.wait_since ?? t.lobby.started_at ?? t.now).getTime();
  }

  /**
   * Bump the version with an update of the locked row. Every update carries
   * the version it was decided on, so one that somehow did not hold the lock
   * changes nothing rather than something else.
   */
  private async bump(t: Tx, set: string, params: unknown[] = [], opts: { card?: boolean } = {}): Promise<void> {
    const res = await t.client.query<LobbyRow>(
      `UPDATE game_lobbies SET ${set}, version = version + 1, updated_at = now() WHERE id = $1 AND version = $2 RETURNING *`,
      [t.lobby.id, t.lobby.version, ...params],
    );
    if (!res.rows[0]) throw new Error(`game ${t.lobby.id} moved under its lock`);
    t.lobby = res.rows[0];
    t.changed = true;
    t.card ||= opts.card ?? false;
  }

  // -------------------------------------------------------------------------
  // transactions

  private async inLobby(lobbyId: string, fn: (t: Tx) => Promise<void>): Promise<void> {
    if (!UUID_RE.test(lobbyId)) throw gameNotFound();
    const res = await this.run(lobbyId, fn);
    if (res === 'missing' || res === 'busy') throw gameNotFound();
  }

  /**
   * One transaction on one game: lock it (waiting up to 5 s; the advance skips
   * instead), run `fn`, commit; then, outside the transaction, wake the
   * waiters, tell the play layer, arm the timer and record any offense. A
   * deadlock or serialization failure is retried once.
   */
  private async run<T>(lobbyId: string, fn: (t: Tx) => Promise<T>, opts: { skipLocked?: boolean } = {}): Promise<RunResult<T>> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      let skipped = false;
      try {
        await client.query('BEGIN');
        dropAfterCommit(client);
        await client.query(`SET LOCAL lock_timeout = '${opts.skipLocked ? 2 : 5}s'`);
        const t = await this.lockWith(client, lobbyId, opts.skipLocked);
        if (!t) {
          await client.query('ROLLBACK');
          if (!opts.skipLocked) return 'missing';
          skipped = true;
        } else {
          const value = await fn(t);
          await client.query('COMMIT');
          runAfterCommit(client);
          this.afterCommit(t);
          return { value };
        }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        dropAfterCommit(client);
        const code = (err as { code?: string }).code;
        if (attempt === 0 && (code === '40P01' || code === '40001')) continue;
        if (code === '55P03') throw new AppError('GAME_BUSY', 503, 'the game is busy, try again');
        throw err;
      } finally {
        client.release();
      }
      if (skipped) {
        const exists = await this.pool.query(`SELECT 1 FROM game_lobbies WHERE id = $1`, [lobbyId]);
        if (exists.rowCount) return 'busy';
        this.armAt(lobbyId, null);
        return 'missing';
      }
    }
  }

  private async lockWith(client: pg.PoolClient, lobbyId: string, skipLocked = false): Promise<Tx | null> {
    const l = await client.query<LobbyRow>(`SELECT * FROM game_lobbies WHERE id = $1 FOR UPDATE${skipLocked ? ' SKIP LOCKED' : ''}`, [lobbyId]);
    const lobby = l.rows[0];
    if (!lobby) return null;
    // the clock is read after the lock: a transaction that waited for it must not judge a deadline by the moment it began
    const clock = await client.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
    return {
      client,
      lobby,
      players: await this.loadPlayers(client, lobbyId),
      now: clock.rows[0]!.now,
      changed: false,
      card: false,
      also: [],
      offenses: [],
    };
  }

  private afterCommit(t: Tx): void {
    if (t.changed) {
      this.notifier?.notify(t.lobby.id, t.lobby.version);
      this.tell(t.lobby.game, t.lobby.id, { card: t.card, also: t.also });
    }
    this.armAt(t.lobby.id, t.lobby.status === 'active' ? (t.lobby.due_at?.getTime() ?? null) : null);
    if (t.lobby.status === 'finished' || t.lobby.status === 'cancelled') this.presence.drop(t.lobby.id);
    for (const userId of t.offenses) {
      void this.deps.freeText?.moderation.recordOffense(userId).catch(() => undefined);
    }
  }

  private tell(game: MultiGame, lobbyId: string, opts: LobbyChange): void {
    if (this.closing) return;
    try {
      this.onChange(game, lobbyId, opts);
    } catch {
      // telling the players is never a reason to fail what they did
    }
  }

  private async loadPlayers(db: Executor, lobbyId: string): Promise<PlayerRow[]> {
    const r = await db.query<PlayerRow>(`SELECT * FROM game_lobby_players WHERE lobby_id = $1 ORDER BY seat`, [lobbyId]);
    return r.rows;
  }

  private async reload(t: Tx): Promise<void> {
    t.players = await this.loadPlayers(t.client, t.lobby.id);
  }

  private async gameOf(lobbyId: string): Promise<MultiGame | null> {
    const r = await this.pool.query<{ game: MultiGame }>(`SELECT game FROM game_lobbies WHERE id = $1`, [lobbyId]);
    return r.rows[0]?.game ?? null;
  }

  // -------------------------------------------------------------------------
  // seats, presence and the view

  /** People, not computer seats, the host has not removed — still there or gone. */
  private people(players: readonly PlayerRow[]): PlayerRow[] {
    return players.filter((p) => p.user_id !== null && !p.removed);
  }

  private member(t: Tx, userId: string): PlayerRow {
    const me = t.players.find((p) => p.user_id === userId && !p.removed);
    if (!me) throw gameNotFound();
    return me;
  }

  private smallestTeam(t: Tx): number {
    const counts = Array.from({ length: t.lobby.teams }, (_, i) => ({
      team: i + 1,
      n: t.players.filter((p) => !p.removed && p.team === i + 1).length,
    }));
    return counts.sort((a, b) => a.n - b.n || a.team - b.team)[0]?.team ?? 1;
  }

  /**
   * The join rule (`canJoin`), and for a game where players write to each
   * other, that the joiner may exchange text with everyone at the table
   * (`maySitTogether`): a minor sits only with their friends, and nobody sits
   * with a minor who is not theirs. Refused the same way as any other no.
   */
  private async mayJoin(db: Executor, lobby: LobbyRow, players: readonly PlayerRow[], userId: string): Promise<boolean> {
    const memberIds = this.people(players).map((p) => p.user_id!);
    const allowed = await canJoin(db, {
      joinerId: userId,
      hostId: lobby.host_id,
      access: lobby.access,
      memberIds,
      chatGroupId: lobby.chat_group_id,
      removed: players.some((p) => p.user_id === userId && p.removed),
    });
    if (!allowed || !moduleOf(lobby.game).freeText) return allowed;
    return maySitTogether(db, userId, memberIds);
  }

  private phaseOf(lobby: LobbyRow): LobbyPhase {
    if (lobby.status === 'cancelled') return 'cancelled';
    if (lobby.status === 'lobby') return Date.now() >= lobbyClosesAt(lobby.updated_at.getTime()) ? 'cancelled' : 'lobby';
    if (lobby.status === 'active') return 'started';
    return 'finished';
  }

  private engineSeats(lobby: Pick<LobbyRow, 'id'>, players: readonly PlayerRow[]): EngineSeat[] {
    return players.map((p) => {
      const seen = p.last_seen_at ?? p.joined_at;
      return {
        seat: p.seat,
        userId: p.user_id,
        bot: p.bot,
        joinedAt: p.joined_at.getTime(),
        left: p.left_at !== null,
        removed: p.removed,
        away: p.away,
        silent: p.user_id !== null && this.presence.isAway(lobby.id, p.user_id, seen),
        silentAt: p.user_id !== null ? this.presence.awayAt(lobby.id, p.user_id, seen) : Number.MAX_SAFE_INTEGER,
      };
    });
  }

  /**
   * A member was heard from. The database copy of when is written at most
   * every 15 s (Presence); a player who had been away is back at once — their
   * turns are no longer passed over, and everyone's view says so.
   */
  private touch(lobbyId: string, userId: string, dbSeenAt: Date | null, storedAway: boolean): void {
    const { write, wasAway } = this.presence.touch(lobbyId, userId, dbSeenAt);
    if (storedAway || wasAway) {
      void this.run(lobbyId, async (t) => {
        await t.client.query(
          `UPDATE game_lobby_players SET away = false, missed_turns = 0, last_seen_at = now() WHERE lobby_id = $1 AND user_id = $2`,
          [lobbyId, userId],
        );
        await this.reload(t);
        if (t.lobby.status === 'active' && t.lobby.state) await this.saveState(t, t.lobby.state);
      }).catch((err) => this.log.warn({ err, lobbyId }, 'could not mark a player back'));
      return;
    }
    if (write) {
      void this.pool
        .query(`UPDATE game_lobby_players SET last_seen_at = now() WHERE lobby_id = $1 AND user_id = $2`, [lobbyId, userId])
        .catch((err) => this.log.warn({ err, lobbyId }, 'could not record a presence'));
    }
  }

  /** The view as `viewerId` may see it: names by the identity rule, the board by the rules' `viewFor` for their seat. */
  private async render(lobby: LobbyRow, players: readonly PlayerRow[], viewerId: string): Promise<MultiView> {
    const m = moduleOf(lobby.game);
    const listed = players.filter((p) => !p.removed && !(lobby.status === 'lobby' && p.left_at !== null));
    const shown = await identities(
      this.pool,
      viewerId,
      listed.filter((p) => p.user_id !== null).map((p) => p.user_id!),
      lobby.access,
      this.publicUrl,
    );
    // in a game of free text, what the seats this viewer may not exchange text with wrote is left out of their view
    const apart =
      m.freeText && lobby.state
        ? await textApart(
            this.pool,
            viewerId,
            players.filter((p) => p.user_id !== null && p.user_id !== viewerId).map((p) => p.user_id!),
          )
        : new Set<string>();
    const hidden = players.filter((p) => p.user_id !== null && apart.has(p.user_id)).map((p) => p.seat);
    const engine = this.engineSeats(lobby, players);
    const controller = lobby.status === 'lobby' ? lobby.host_id : controllerOf(lobby.host_id, engine);
    const seats: MultiSeat[] = listed.map((p) => {
      const isMe = p.user_id === viewerId;
      const who = p.user_id && !isMe ? shown.get(p.user_id) : undefined;
      const e = engine.find((x) => x.seat === p.seat)!;
      return {
        seat: p.seat,
        userId: isMe ? viewerId : seatId(p.seat),
        name: who?.name ?? null,
        avatarUrl: who?.avatarUrl ?? null,
        isMe,
        isHost: p.user_id !== null && p.user_id === lobby.host_id,
        gone: p.left_at !== null,
        away: lobby.status === 'active' && p.user_id !== null && !e.left && isAway(e),
        team: p.team,
        bot: p.bot,
      };
    });
    const mine = players.find((p) => p.user_id === viewerId && !p.removed) ?? null;
    const host = players.find((p) => p.user_id !== null && p.user_id === lobby.host_id);
    const idle = lobby.status === 'lobby' && Date.now() >= lobbyClosesAt(lobby.updated_at.getTime());
    const finished = lobby.status === 'finished';
    return {
      id: lobby.id,
      game: lobby.game,
      mode: lobby.mode,
      status: idle ? 'cancelled' : lobby.status,
      version: lobby.version,
      serverNow: new Date().toISOString(),
      dialect: lobby.dialect,
      settings: m.publicSettings(lobby.settings),
      access: lobby.access,
      code: lobby.status === 'lobby' && !idle ? lobby.code : null,
      rated: ratedStateOf(lobby),
      minPlayers: lobby.min_players,
      maxPlayers: lobby.max_players,
      teams: lobby.teams,
      isHost: lobby.host_id === viewerId,
      canControl: controller === viewerId,
      createdBy: lobby.host_id === viewerId ? viewerId : host ? seatId(host.seat) : seatId(0),
      nextLobbyId: lobby.next_lobby_id,
      players: seats,
      me: mine ? { seat: mine.seat, team: mine.team } : null,
      startedAt: lobby.started_at?.toISOString() ?? null,
      finishedAt: lobby.finished_at?.toISOString() ?? null,
      results: finished
        ? players
            .filter((p) => !p.removed && p.place !== null)
            .sort((a, b) => a.place! - b.place! || a.seat - b.seat)
            .map((p) => ({ seat: p.seat, place: p.place!, score: p.score ?? 0, xpAwarded: p.user_id ? p.xp_awarded : null }))
        : null,
      // nothing of the game before it starts; after, only what this seat may see
      board: lobby.state ? m.rules.viewFor(lobby.state, mine && !mine.removed ? mine.seat : null, hidden) : null,
    };
  }

  /** A transaction of its own, for making a lobby (there is no row to lock yet). */
  private async tx<R>(fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      dropAfterCommit(client);
      const result = await fn(client);
      await client.query('COMMIT');
      runAfterCommit(client);
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      dropAfterCommit(client);
      throw err;
    } finally {
      client.release();
    }
  }
}
