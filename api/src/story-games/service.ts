import { randomInt } from 'node:crypto';
import type pg from 'pg';
import {
  ANSWER_GRACE_MS,
  DEFAULT_QUESTION_COUNT,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  POINTS_PER_CORRECT,
  isAllowedQuestionCount,
  lessonAudioKey,
  normalizeJoinCode,
  readingHardCapSeconds,
  readingMinutes,
  readingSoftCapSeconds,
  storyAudioSentences,
  storyParagraphs,
  type GameAccess,
  type InviteSummary,
  type LobbyCard,
  type LobbyCardStatus,
  type QuestionCount,
  type StoryDetail,
  type StoryDialect,
  type StoryGameMode,
  type StoryGameStatus,
  type StoryGameSummary,
  type StoryGameView,
  type StoryLength,
  type StoryLevel,
  type StoryProgress,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { resolveAvatarUrl } from '../cosmetics/access.js';
import { areFriendsSql } from '../users/age.js';
import { XpService } from '../xp/service.js';
import { StreakService } from '../streaks/service.js';
import { DailyGoalService } from '../goals/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { buildPlan, type StorySnapshot } from './plan.js';
import {
  controllerOf,
  dueTransition,
  inGame as stillIn,
  isActive,
  nextDueAt,
  questionDeadline,
  questionEndsAt,
  revealEndsAt,
  type PhasePlayer,
} from './logic.js';
import { canJoin, isKnownAdult, joinFacts } from './join-rule.js';
import { LocalStoryCatalog, type GameStory, type StoryCatalog } from './stories-source.js';
import { payRewards, type Reward } from './rewards.js';
import { Presence } from './presence.js';
import type { StoryGameNotifier } from './notifier.js';
import { phaseGame, renderView, type GameRow, type PlayerRow, type ViewAnswer, type ViewPlayer } from './view.js';

/** A long-poll waits at most this long for a change. */
export const POLL_WAIT_MS = 20_000;
/** A finished game stops being waited on this long after it ended. */
export const FINISHED_POLL_MINUTES = 10;
/** Unfinished duo/group games one person may host at once. */
export const MAX_HOSTED_GAMES = 3;
/** A lobby or reading phase nobody touched for this long is closed by the sweep. */
export const STALE_HOURS = 6;
/** A game's questions, answers and text are cleared this long after it ended. */
export const PLAN_RETENTION_HOURS = 48;
/** Ended games are deleted after this long (their totals feed history and quests until then). */
export const GAME_RETENTION_DAYS = 400;

const LIVE: readonly StoryGameStatus[] = ['lobby', 'reading', 'question', 'reveal'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// a timer further out than this is re-armed when it fires, rather than trusted for days
const MAX_TIMER_MS = 60 * 60 * 1000;

type Executor = Pick<pg.Pool, 'query'>;

interface Log {
  warn: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

export interface StoryGamesDeps {
  /** the stories (API-stories' StoriesService once merged; a local reader until then) */
  stories?: StoryCatalog;
  /** long-poll waiters and the cross-instance wake-ups; none in a worker */
  notifier?: StoryGameNotifier | null;
  presence?: Presence;
  xp?: XpService;
  streaks?: StreakService;
  goals?: DailyGoalService;
  milestones?: Pick<MilestoneRecorder, 'recordStreak'>;
  log?: Log;
  publicUrl?: (key: string) => string | null;
  /**
   * Arm deadline timers (default true). Off for a one-off use outside the API
   * process — account deletion in the worker — where nothing would be left to
   * run them for.
   */
  timers?: boolean;
}

/** Settings a game is created with. */
export interface CreateGameInput {
  mode: StoryGameMode;
  storyId?: string;
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
  questionCount: QuestionCount;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
  access: GameAccess;
  /** solo only: the reader has just read the story; go straight to the questions */
  skipReading?: boolean;
  /** this player wants double time on timed questions */
  extraTime?: boolean;
  /** the host shared the game into this group chat (the play module sets it) */
  chatGroupId?: string | null;
}

export interface SettingsPatch {
  storyId?: string;
  questionCount?: QuestionCount;
  timerSeconds?: TimerSeconds;
  textDuring?: TextDuring;
  access?: GameAccess;
}

export type JoinTarget = { code: string } | { id: string };

/** A game locked in a transaction, with what the rules read. */
interface Tx {
  client: pg.PoolClient;
  game: GameRow;
  players: PlayerRow[];
  /** who has answered the current question */
  answered: Set<string>;
  /** the database clock, read after the lock was taken */
  now: Date;
  changed: boolean;
  rewards: Reward[];
  /** other games this transaction created or changed, notified with it */
  others: Tx[];
}

/** Something a game transaction found but did not do. */
type RunResult<T> = { value: T } | 'busy' | 'missing';

const notFound = () => new AppError('GAME_NOT_FOUND', 404, 'no such game');

/**
 * Story games: solo, duo and group quizzes on a story.
 *
 * The rules that keep it correct with several API instances and a pool of ten
 * connections (contract §A3):
 *
 * - Every change happens in a transaction that locks the game row first
 *   (`SELECT … FOR UPDATE`), then checks who the caller is — never the other
 *   way round, or "host leaves" races "start". Each one bumps `version`, and
 *   the waiting long-polls are woken only after COMMIT.
 * - Deadlines are columns. On each instance one timer per game is armed at
 *   the next instant something becomes due (a question closing, a reveal
 *   ending, the reading cap, a lobby going idle, a player turning away); when
 *   it fires, one advance per game runs — `SKIP LOCKED`, so an instance that
 *   finds another one already at it re-arms in 250 ms instead of queueing a
 *   connection behind it — and judges due-ness from the locked row with the
 *   database clock read after the lock.
 * - A long-poll holds nothing while it waits: a promise in the notifier.
 * - Scoring and rewards happen in the transaction that closes the last
 *   question, so nothing depends on anyone reading the results.
 */
export class StoryGamesService {
  private readonly stories: StoryCatalog;
  private readonly notifier: StoryGameNotifier | null;
  readonly presence: Presence;
  private readonly rewardDeps: { xp: XpService; streaks: StreakService; goals: DailyGoalService };
  private readonly milestones?: Pick<MilestoneRecorder, 'recordStreak'>;
  private readonly log: Log;
  private readonly publicUrl: (key: string) => string | null;
  private readonly timers = new Map<string, { at: number; timer: NodeJS.Timeout }>();
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly rerun = new Set<string>();
  /** the away players each game's last version was decided with, to notice someone leaving or coming back */
  private readonly awaySnap = new Map<string, { version: number; away: string }>();
  /** what this instance last read of each game it has a timer for */
  private readonly lastState = new Map<string, { game: GameRow; players: PlayerRow[]; answered: Set<string> }>();
  private closing = false;
  private readonly useTimers: boolean;

  constructor(
    private readonly pool: pg.Pool,
    deps: StoryGamesDeps = {},
  ) {
    this.stories = deps.stories ?? new LocalStoryCatalog(pool);
    this.notifier = deps.notifier ?? null;
    this.presence = deps.presence ?? new Presence();
    this.rewardDeps = {
      xp: deps.xp ?? new XpService(pool),
      streaks: deps.streaks ?? new StreakService(pool),
      goals: deps.goals ?? new DailyGoalService(pool),
    };
    this.milestones = deps.milestones;
    this.log = deps.log ?? { warn: () => undefined };
    this.publicUrl = deps.publicUrl ?? (() => null);
    this.useTimers = deps.timers ?? true;
  }

  // -------------------------------------------------------------------------
  // creating and joining

  /** What the setup screen may offer this person: 'open' games only to known adults. */
  async options(userId: string): Promise<{ canHostOpen: boolean }> {
    return { canHostOpen: await isKnownAdult(this.pool, userId) };
  }

  /** `POST /story-games`: a new game, with its creator in it. */
  async create(userId: string, input: CreateGameInput): Promise<StoryGameView> {
    const gameId = await this.createGame(userId, input);
    return this.view(gameId, userId);
  }

  /**
   * For the play module (an invite, a game shared into a chat): a duo or group
   * lobby with the host in it. Same rules as `create`.
   */
  async createFromInvite(hostId: string, input: CreateGameInput): Promise<{ gameId: string }> {
    if (input.mode === 'solo') throw new AppError('BAD_SETTINGS', 400, 'a solo game has nobody to invite');
    return { gameId: await this.createGame(hostId, input) };
  }

  private async createGame(userId: string, input: CreateGameInput): Promise<string> {
    let storyId = input.storyId;
    if (!storyId) {
      if (!input.dialect || !input.length) throw new AppError('BAD_SETTINGS', 400, 'pick a story, or a variety and a length');
      if (!isAllowedQuestionCount(input.length, input.questionCount)) {
        throw new AppError('BAD_SETTINGS', 400, 'that many questions is not offered for this length');
      }
      storyId =
        (await this.stories.pickRandomPublished({
          dialect: input.dialect,
          length: input.length,
          level: input.level,
          minQuestions: input.questionCount,
          preferUnseenBy: [userId],
        })) ?? undefined;
      if (!storyId) throw new AppError('NO_STORY', 404, 'no story of that kind yet');
    }
    const story = await this.stories.getPublishedForGame(storyId);
    if (!story) throw new AppError('NO_STORY', 404, 'no such story');
    if (!isAllowedQuestionCount(story.length, input.questionCount)) {
      throw new AppError('BAD_SETTINGS', 400, 'that many questions is not offered for this length');
    }
    const solo = input.mode === 'solo';
    const access: GameAccess = solo ? 'friends' : input.access;
    if (access === 'open' && !(await isKnownAdult(this.pool, userId))) {
      throw new AppError('OPEN_NOT_ALLOWED', 403, 'only an adult can open a game to people who are not friends');
    }

    if (solo) {
      // a quiz alone on a story you are being asked about in a group right now
      // would show you the group's answers
      const busy = await this.pool.query(
        `SELECT 1 FROM story_game_players p JOIN story_games g ON g.id = p.game_id
          WHERE p.user_id = $1 AND NOT p.removed AND p.left_at IS NULL AND g.story_id = $2
            AND g.mode <> 'solo' AND g.status = ANY($3::text[]) AND g.finished_at IS NULL
          LIMIT 1`,
        [userId, story.id, LIVE],
      );
      if (busy.rowCount) throw new AppError('IN_GAME', 409, 'you are in a game on this story');
      if (story.questions.length < input.questionCount) {
        throw new AppError('STORY_UNAVAILABLE', 409, 'this story does not have that many questions');
      }
      // Starting again on a story replaces the unfinished game on it — the
      // client asks first. One whose last question has closed is finished
      // properly instead: its results stand.
      const old = await this.pool.query<{ id: string }>(
        `SELECT g.id FROM story_games g JOIN story_game_players p ON p.game_id = g.id AND p.user_id = $1
          WHERE g.mode = 'solo' AND g.story_id = $2 AND g.status = ANY($3::text[]) ORDER BY g.id`,
        [userId, story.id, LIVE],
      );
      for (const row of old.rows) {
        await this.run(row.id, async (t) => {
          if (LIVE.includes(t.game.status)) await this.endEarly(t);
        });
      }
    }

    const client = await this.pool.connect();
    const touched: Tx[] = [];
    try {
      await client.query('BEGIN');
      // closing the host's oldest lobby locks it: wait no longer than any game transaction does
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      const t = await this.insertGame(client, touched, userId, story, {
        ...input,
        access,
        chatGroupId: solo ? null : (input.chatGroupId ?? null),
      });
      if (solo) await this.beginGame(t, story, input.skipReading === true);
      await client.query('COMMIT');
      this.afterCommit(touched);
      return t.game.id;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw busyOr(err);
    } finally {
      client.release();
    }
  }

  /**
   * Insert a game and its host, inside the caller's transaction. Duo and group
   * games count against the host's limit of unfinished games: a fourth closes
   * the oldest lobby, or is refused when none of the three is a lobby.
   */
  private async insertGame(
    client: pg.PoolClient,
    touched: Tx[],
    hostId: string,
    story: GameStory,
    input: CreateGameInput & { access: GameAccess; chatGroupId: string | null },
  ): Promise<Tx> {
    const solo = input.mode === 'solo';
    if (!solo) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('story-host:' || $1, 0))`, [hostId]);
      const hosted = await client.query<{ id: string; status: StoryGameStatus }>(
        `SELECT id, status FROM story_games
          WHERE host_id = $1 AND mode <> 'solo' AND status = ANY($2::text[]) AND finished_at IS NULL
            AND updated_at > now() - make_interval(hours => $3)
          ORDER BY created_at`,
        [hostId, LIVE, STALE_HOURS],
      );
      if (hosted.rows.length >= MAX_HOSTED_GAMES) {
        const oldestLobby = hosted.rows.find((g) => g.status === 'lobby');
        if (!oldestLobby) throw new AppError('TOO_MANY_GAMES', 409, 'finish one of your games first');
        const t = await this.lockWith(client, oldestLobby.id);
        if (t && t.game.status === 'lobby') {
          await this.endEarly(t);
          touched.push(t);
        }
      }
    }

    let row: GameRow | undefined;
    for (let attempt = 0; !row; attempt++) {
      const code = solo ? null : newJoinCode();
      await client.query('SAVEPOINT story_code');
      try {
        const res = await client.query<GameRow>(
          `INSERT INTO story_games (code, mode, host_id, story_id, dialect, level, length, question_count,
                                    timer_seconds, text_during, access, chat_group_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
          [
            code,
            input.mode,
            hostId,
            story.id,
            story.dialect,
            story.level,
            story.length,
            input.questionCount,
            input.timerSeconds,
            input.textDuring,
            input.access,
            input.chatGroupId,
          ],
        );
        await client.query('RELEASE SAVEPOINT story_code');
        row = res.rows[0]!;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT story_code');
        // a code already in use: draw another
        if ((err as { code?: string }).code !== '23505' || attempt >= 5) throw err;
      }
    }
    await client.query(
      `INSERT INTO story_game_players (game_id, user_id, seat, extra_time, last_seen_at) VALUES ($1, $2, 1, $3, now())`,
      [row.id, hostId, input.extraTime === true],
    );
    this.presence.touch(row.id, hostId);
    const now = (await client.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0]!.now;
    const t: Tx = {
      client,
      game: row,
      players: await this.loadPlayers(client, row.id),
      answered: new Set(),
      now,
      changed: true,
      rewards: [],
      others: [],
    };
    touched.push(t);
    return t;
  }

  /**
   * `POST /story-games/join {code} | {id}`. Everything that would tell the
   * joiner something about the people in the game — not found, not allowed,
   * removed, blocked, a cancelled game — is the same 404; only then whether the
   * questions have started (joining while people read is fine) or it is full.
   */
  async join(userId: string, target: JoinTarget, opts: { extraTime?: boolean } = {}): Promise<StoryGameView> {
    let gameId: string | null = null;
    if ('code' in target) {
      const code = normalizeJoinCode(target.code);
      if (code) {
        const res = await this.pool.query<{ id: string }>(`SELECT id FROM story_games WHERE code = $1`, [code]);
        gameId = res.rows[0]?.id ?? null;
      }
    } else if (UUID_RE.test(target.id)) {
      gameId = target.id;
    }
    if (!gameId) throw notFound();
    const id = gameId;

    await this.inGame(id, async (t) => {
      await this.settle(t);
      const mine = t.players.find((p) => p.user_id === userId);
      if (mine && !mine.removed && !mine.left_at) {
        // already in it: joining again is a no-op
        await this.touchInTx(t, userId);
        return;
      }
      if (t.game.mode === 'solo' || t.game.status === 'cancelled') throw notFound();
      const facts = await joinFacts(
        t.client,
        { id, hostId: t.game.host_id, access: t.game.access, chatGroupId: t.game.chat_group_id },
        userId,
      );
      if (!canJoin(facts)) throw notFound();
      if (t.game.status !== 'lobby' && t.game.status !== 'reading') {
        throw new AppError('GAME_STARTED', 409, 'this game has already started');
      }
      const inIt = t.players.filter((p) => stillIn(phaseLite(p))).length;
      if (inIt >= MAX_PLAYERS[t.game.mode]) throw new AppError('GAME_FULL', 409, 'this game is full');

      if (mine) {
        // back during reading after leaving: same seat, same row
        await t.client.query(
          `UPDATE story_game_players SET left_at = NULL, last_seen_at = now() WHERE game_id = $1 AND user_id = $2`,
          [id, userId],
        );
      } else {
        await t.client.query(
          `INSERT INTO story_game_players (game_id, user_id, seat, extra_time, last_seen_at)
           SELECT $1, $2, COALESCE(max(seat), 0) + 1, $3, now() FROM story_game_players WHERE game_id = $1`,
          [id, userId, opts.extraTime === true],
        );
      }
      this.presence.touch(id, userId);
      await this.bump(t, `status = status`);
      await this.reloadPlayers(t);
      await this.settle(t);
    });
    return this.view(id, userId);
  }

  // -------------------------------------------------------------------------
  // reading a game

  /** One member's view of a game, from fresh reads. */
  async view(gameId: string, userId: string): Promise<StoryGameView> {
    if (!UUID_RE.test(gameId)) throw notFound();
    const g = await this.pool.query<GameRow & { s_title: string | null; s_slug: string | null }>(
      `SELECT g.*, s.title AS s_title, s.slug AS s_slug
         FROM story_games g LEFT JOIN stories s ON s.id = g.story_id WHERE g.id = $1`,
      [gameId],
    );
    const game = g.rows[0];
    if (!game) throw notFound();
    const players = await this.pool.query<
      PlayerRow & {
        username: string;
        display_name: string | null;
        profile_photo_key: string | null;
        selected_avatar_key: string | null;
        deleted: boolean;
        friend: boolean;
        blocked: boolean;
      }
    >(
      `SELECT p.*, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key,
              u.deleted_at IS NOT NULL AS deleted,
              (p.user_id <> $2 AND ${areFriendsSql('p.user_id', '$2::uuid')}) AS friend,
              EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = p.user_id AND b.blocked_id = $2)
                          OR (b.blocker_id = $2 AND b.blocked_id = p.user_id)) AS blocked
         FROM story_game_players p JOIN users u ON u.id = p.user_id
        WHERE p.game_id = $1 ORDER BY p.seat`,
      [gameId, userId],
    );
    const me = players.rows.find((p) => p.user_id === userId);
    if (!me || me.removed) throw notFound();
    const answers = await this.pool.query<ViewAnswer>(
      `SELECT user_id, question_index, choice, correct FROM story_game_answers
        WHERE game_id = $1 AND (question_index = $2 OR user_id = $3)`,
      [gameId, game.current_index, userId],
    );
    const viewPlayers: ViewPlayer[] = players.rows.map((p) => {
      const seen = p.last_seen_at ?? p.joined_at;
      return {
        ...p,
        displayName: p.deleted ? null : p.display_name || p.username,
        avatarUrl: p.deleted ? null : resolveAvatarUrl(p.profile_photo_key, p.selected_avatar_key, this.publicUrl),
        away: this.presence.isAway(gameId, p.user_id, seen),
        awayAt: this.presence.awayAt(gameId, p.user_id, seen),
      };
    });
    return renderView({
      game,
      storyTitle: game.story_snapshot?.title ?? game.s_title ?? '',
      storySlug: game.story_snapshot?.slug ?? game.s_slug ?? '',
      players: viewPlayers,
      viewerId: userId,
      answers: answers.rows,
      now: new Date(),
    });
  }

  /**
   * `GET /story-games/:id?v=`: the view now if it moved past `v` (or none was
   * given), else once it does — or after at most 20 s, or at the next deadline.
   *
   * The order matters (lost wakeups, a pinned pool): register the waiter, then
   * ONE plain query (no lock, no transaction) for membership and the version,
   * then wait holding nothing, then deregister and build the view with fresh
   * reads. `onClose` hands over a way to stop waiting when the client goes
   * away; null is returned then, there being nobody to answer.
   */
  async poll(
    gameId: string,
    userId: string,
    since: number | undefined,
    onClose: (stop: () => void) => void = () => undefined,
  ): Promise<StoryGameView | null> {
    if (!UUID_RE.test(gameId)) throw notFound();
    const wait = this.notifier && since !== undefined ? this.notifier.register(gameId, userId, since) : null;
    let clientGone = false;
    try {
      const head = await this.pool.query<{
        status: StoryGameStatus;
        version: number;
        finished_at: Date | null;
        removed: boolean;
        last_seen_at: Date | null;
        joined_at: Date;
      }>(
        `SELECT g.status, g.version, g.finished_at, p.removed, p.last_seen_at, p.joined_at
           FROM story_games g JOIN story_game_players p ON p.game_id = g.id AND p.user_id = $2
          WHERE g.id = $1`,
        [gameId, userId],
      );
      const row = head.rows[0];
      if (!row || row.removed) throw notFound();
      this.touch(gameId, userId, row.last_seen_at ?? row.joined_at);

      const ended =
        row.status === 'cancelled' ||
        (row.finished_at !== null &&
          row.status === 'finished' &&
          Date.now() - row.finished_at.getTime() > FINISHED_POLL_MINUTES * 60_000);
      if (wait && row.version === since && !ended && !this.closing) {
        const due = await this.dueAt(gameId);
        if (due !== null && due <= Date.now()) {
          // something is overdue: settle it before answering
          await this.advance(gameId);
        } else {
          onClose(() => {
            clientGone = true;
            wait.cancel('closed');
          });
          wait.arm(Math.min(POLL_WAIT_MS, due === null ? POLL_WAIT_MS : due - Date.now() + 1_000));
          await wait.done;
        }
      }
    } finally {
      wait?.cancel();
    }
    if (clientGone) return null;
    return this.view(gameId, userId);
  }

  /**
   * `GET /story-games/:id/story`: the text the game is played on, for its
   * members — the game's own copy once the questions are built, whatever has
   * happened to the story since (a reviewer unpublishing it to fix a typo must
   * not take the text away mid-game); before that, and after the copy is
   * cleared, the story as published. Recordings are looked up now.
   */
  async story(gameId: string, userId: string): Promise<StoryDetail> {
    if (!UUID_RE.test(gameId)) throw notFound();
    const res = await this.pool.query<{
      story_id: string;
      story_snapshot: StorySnapshot | null;
      dialect: StoryDialect;
      level: StoryLevel;
      length: StoryLength;
    }>(
      `SELECT g.story_id, g.story_snapshot, g.dialect, g.level, g.length
         FROM story_games g JOIN story_game_players p ON p.game_id = g.id AND p.user_id = $2 AND NOT p.removed
        WHERE g.id = $1`,
      [gameId, userId],
    );
    const row = res.rows[0];
    if (!row) throw notFound();
    let detail: Omit<StoryDetail, 'audio' | 'fullyNarrated'>;
    if (row.story_snapshot) {
      const s = row.story_snapshot;
      detail = {
        id: row.story_id,
        slug: s.slug,
        title: s.title,
        summary: s.summary,
        dialect: row.dialect,
        level: row.level,
        length: row.length,
        wordCount: s.wordCount,
        readingMinutes: readingMinutes(row.dialect, s.wordCount),
        paragraphs: s.paragraphs,
        glossary: s.glossary,
      };
    } else {
      const live = await this.stories.getPublishedForGame(row.story_id);
      if (!live) throw new AppError('STORY_UNAVAILABLE', 404, 'this story is being updated');
      detail = {
        id: live.id,
        slug: live.slug,
        title: live.title,
        summary: live.summary,
        dialect: live.dialect,
        level: live.level,
        length: live.length,
        wordCount: live.wordCount,
        readingMinutes: readingMinutes(live.dialect, live.wordCount),
        paragraphs: storyParagraphs(live.body),
        glossary: live.glossary,
      };
    }
    const keys = [...new Set(detail.paragraphs.flatMap((p) => storyAudioSentences(p)).map((s) => lessonAudioKey(s)))];
    const audio: Record<string, string> = {};
    if (keys.length) {
      const rec = await this.pool.query<{ key: string; url: string }>(
        `SELECT key, url FROM lesson_audio WHERE key = ANY($1::text[])`,
        [keys],
      );
      for (const r of rec.rows) audio[r.key] = r.url;
    }
    return { ...detail, audio, fullyNarrated: keys.length > 0 && keys.every((k) => audio[k] !== undefined) };
  }

  /** `GET /story-games/active`: the caller's unfinished games, to go back to. */
  async active(userId: string): Promise<StoryGameSummary[]> {
    const res = await this.pool.query<{
      id: string;
      mode: StoryGameMode;
      status: StoryGameStatus;
      title: string | null;
      dialect: StoryDialect;
      current_index: number;
      question_count: number;
    }>(
      `SELECT g.id, g.mode, g.status, COALESCE(g.story_snapshot->>'title', s.title) AS title, g.dialect,
              g.current_index, g.question_count
         FROM story_game_players p JOIN story_games g ON g.id = p.game_id
         LEFT JOIN stories s ON s.id = g.story_id
        WHERE p.user_id = $1 AND NOT p.removed AND p.left_at IS NULL AND g.status = ANY($2::text[])
        ORDER BY g.updated_at DESC LIMIT 20`,
      [userId, LIVE],
    );
    return res.rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      storyTitle: r.title ?? '',
      dialect: r.dialect,
      currentIndex: r.status === 'question' || r.status === 'reveal' ? r.current_index : 0,
      total: r.question_count,
    }));
  }

  /** `GET /story-games/history`: the caller's best result per story, for "Done · 4/5". */
  async history(userId: string): Promise<StoryProgress[]> {
    const res = await this.pool.query<{ story_id: string; correct: number; total: number; last: Date }>(
      `SELECT DISTINCT ON (g.story_id) g.story_id, p.correct, g.question_count AS total,
              max(g.finished_at) OVER (PARTITION BY g.story_id) AS last
         FROM story_game_players p JOIN story_games g ON g.id = p.game_id
        WHERE p.user_id = $1 AND NOT p.removed AND g.finished_at IS NOT NULL
          AND (p.left_at IS NULL OR p.left_at >= g.finished_at)
        ORDER BY g.story_id, p.correct::float / g.question_count DESC, g.finished_at DESC
        LIMIT 500`,
      [userId],
    );
    return res.rows.map((r) => ({
      storyId: r.story_id,
      bestCorrect: r.correct,
      total: r.total,
      lastFinishedAt: r.last.toISOString(),
    }));
  }

  // -------------------------------------------------------------------------
  // playing

  /** `PATCH /story-games/:id/settings`: the host, in the lobby, from the presets. */
  async updateSettings(gameId: string, userId: string, patch: SettingsPatch): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (t.game.status !== 'lobby') throw new AppError('GAME_STARTED', 409, 'the game has already started');
      this.requireController(t, userId);

      let story: GameStory | null = null;
      if (patch.storyId !== undefined && patch.storyId !== t.game.story_id) {
        story = await this.stories.getPublishedForGame(patch.storyId, t.client);
        if (!story) throw new AppError('NO_STORY', 404, 'no such story');
      }
      const length = story?.length ?? t.game.length;
      let count = patch.questionCount ?? t.game.question_count;
      if (!isAllowedQuestionCount(length, count)) {
        // a new story of another length keeps its default rather than refusing
        if (patch.questionCount !== undefined) {
          throw new AppError('BAD_SETTINGS', 400, 'that many questions is not offered for this length');
        }
        count = DEFAULT_QUESTION_COUNT[length];
      }
      const access = patch.access ?? t.game.access;
      if (access === 'open' && t.game.access !== 'open') {
        // Opening a lobby to strangers is only for an adult host — and only
        // while nobody else is in it: the friends already there may be
        // children, and the refusal must not depend on whether they are.
        const others = t.players.filter((p) => !p.removed && p.user_id !== userId);
        if (others.length > 0 || !(await isKnownAdult(t.client, userId))) {
          throw new AppError('OPEN_NOT_ALLOWED', 403, 'a game can be opened only by an adult host, before anyone joins');
        }
      }
      await this.bump(
        t,
        `story_id = $3, dialect = $4, level = $5, length = $6, question_count = $7, timer_seconds = $8,
         text_during = $9, access = $10`,
        [
          story?.id ?? t.game.story_id,
          story?.dialect ?? t.game.dialect,
          story?.level ?? t.game.level,
          length,
          count,
          patch.timerSeconds ?? t.game.timer_seconds,
          patch.textDuring ?? t.game.text_during,
          access,
        ],
      );
    });
    return this.view(gameId, userId);
  }

  /** `POST /:id/start`: the host (or the stand-in) starts the reading. */
  async start(gameId: string, userId: string): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (t.game.status !== 'lobby') return;
      this.requireController(t, userId);
      const active = this.phasePlayers(t).filter(isActive).length;
      if (active < MIN_PLAYERS_TO_START[t.game.mode]) {
        throw new AppError('NOT_ENOUGH_PLAYERS', 409, 'more players are needed to start');
      }
      // the story has to be published now, and have enough questions now —
      // not just when it was chosen. Refused, the lobby stays for another pick.
      const story = await this.stories.getPublishedForGame(t.game.story_id, t.client);
      if (!story || story.questions.length < t.game.question_count || !isAllowedQuestionCount(story.length, t.game.question_count)) {
        throw new AppError('STORY_UNAVAILABLE', 409, 'this story cannot be played right now; pick another');
      }
      await this.beginGame(t, story, false);
    });
    return this.view(gameId, userId);
  }

  /** `POST /:id/done-reading`. Repeating it changes nothing. */
  async doneReading(gameId: string, userId: string): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      const me = this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (t.game.status !== 'reading' || me.left_at || me.done_reading_at) return;
      await t.client.query(`UPDATE story_game_players SET done_reading_at = $3 WHERE game_id = $1 AND user_id = $2`, [
        gameId,
        userId,
        t.now,
      ]);
      await this.bump(t, `status = status`);
      await this.reloadPlayers(t);
      await this.settle(t);
    });
    return this.view(gameId, userId);
  }

  /**
   * `POST /:id/answers {index, choice}`. `receipt` is taken at the top of the
   * handler, before anything is awaited. A right answer and a wrong one do the
   * same work — one row — so neither the response time nor anyone's score
   * gives the answer away before the reveal.
   */
  async answer(gameId: string, userId: string, index: number, choice: number, receipt: number): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      const me = this.member(t, userId);
      await this.touchInTx(t, userId);
      // No settling first: an answer received in time counts even if the
      // question became due to close while this request waited for the lock —
      // it had not closed, so nobody has seen its answer.
      const exists = await t.client.query(
        `SELECT 1 FROM story_game_answers WHERE game_id = $1 AND user_id = $2 AND question_index = $3`,
        [gameId, userId, index],
      );
      if (exists.rowCount) throw new AppError('ALREADY_ANSWERED', 409, 'you have already answered this question');
      if (me.left_at || index !== t.game.current_index) {
        throw new AppError('NOT_CURRENT', 409, 'that is not the open question');
      }
      if (t.game.status !== 'question') {
        if (t.game.status === 'reveal' || t.game.status === 'finished') {
          throw new AppError('TOO_LATE', 409, 'the question closed before the answer arrived');
        }
        throw new AppError('NOT_CURRENT', 409, 'that is not the open question');
      }
      const planned = t.game.plan?.[index];
      if (!planned || choice >= planned.options.length) throw new AppError('BAD_CHOICE', 400, 'no such option');
      const deadline = questionDeadline(phaseGame(t.game), me.extra_time);
      if (deadline !== null && receipt > deadline + ANSWER_GRACE_MS) {
        throw new AppError('TOO_LATE', 409, 'the time ran out before the answer arrived');
      }
      const started = t.game.phase_started_at!.getTime();
      const elapsed = Math.max(0, Math.min(receipt - started, deadline === null ? 2_147_483_647 : deadline - started));
      await t.client.query(
        `INSERT INTO story_game_answers (game_id, user_id, question_index, choice, correct, elapsed_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [gameId, userId, index, choice, choice === planned.correctIndex, Math.round(elapsed)],
      );
      t.answered.add(userId);
      await this.bump(t, `status = status`);
      await this.settle(t);
    });
    return this.view(gameId, userId);
  }

  /** `POST /:id/continue {index}`: past a reveal. Solo's "Next". */
  async continueAfter(gameId: string, userId: string, index: number): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      const me = this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (t.game.status !== 'reveal' || t.game.current_index !== index || me.left_at) return;
      if (me.continued_index === index) return;
      await t.client.query(`UPDATE story_game_players SET continued_index = $3 WHERE game_id = $1 AND user_id = $2`, [
        gameId,
        userId,
        index,
      ]);
      await this.bump(t, `status = status`);
      await this.reloadPlayers(t);
      await this.settle(t);
    });
    return this.view(gameId, userId);
  }

  /**
   * `POST /:id/advance {from}`: the host moves the game on early — the
   * questions after the reading's soft cap, "Reveal now" on an untimed
   * question. A reveal is never skipped for anyone (solo's own Next is
   * `continue`). The control carries the state it was pressed on: if the game
   * has moved on since, it does nothing, so a tap racing a deadline cannot
   * reveal the next question unread.
   */
  async advanceByHost(
    gameId: string,
    userId: string,
    from: { status: StoryGameStatus; index: number },
  ): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (t.game.status !== from.status || t.game.current_index !== from.index) return;
      this.requireController(t, userId);
      const solo = t.game.mode === 'solo';
      if (t.game.status === 'reading') {
        const soft = t.game.reading_soft_cap_at?.getTime() ?? 0;
        if (!solo && t.now.getTime() < soft) throw new AppError('TOO_EARLY', 409, 'give everyone time to read first');
        await this.openQuestion(t, 0);
      } else if (t.game.status === 'question' && !solo && t.game.timer_seconds === 0) {
        await this.closeQuestion(t);
      } else {
        throw new AppError('CANNOT_ADVANCE', 409, 'this part of the game moves on by itself');
      }
      await this.settle(t);
    });
    return this.view(gameId, userId);
  }

  /** `POST /:id/extra-time {on}`: double time on timed questions; nobody else is told. */
  async setExtraTime(gameId: string, userId: string, on: boolean): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      this.member(t, userId);
      await this.touchInTx(t, userId);
      await t.client.query(`UPDATE story_game_players SET extra_time = $3 WHERE game_id = $1 AND user_id = $2`, [
        gameId,
        userId,
        on,
      ]);
      await this.reloadPlayers(t);
      await this.settle(t);
    });
    return this.view(gameId, userId);
  }

  /**
   * `POST /:id/leave`. Leaving a lobby takes you out of it (you never played),
   * and the host leaving closes it: who could join was decided against that
   * host. Leaving a started game keeps your seat, score and read access, as
   * gone; when nobody is left in it, it ends. Solo: the game ends.
   */
  async leave(gameId: string, userId: string): Promise<void> {
    await this.inGame(gameId, async (t) => {
      const me = this.member(t, userId);
      await this.settle(t);
      if (!LIVE.includes(t.game.status) || me.left_at) return;
      if (t.game.status === 'lobby') {
        if (t.game.host_id === userId) {
          await this.endEarly(t);
          return;
        }
        await t.client.query(`DELETE FROM story_game_players WHERE game_id = $1 AND user_id = $2`, [gameId, userId]);
      } else {
        await t.client.query(`UPDATE story_game_players SET left_at = $3 WHERE game_id = $1 AND user_id = $2`, [
          gameId,
          userId,
          t.now,
        ]);
      }
      await this.bump(t, `status = status`);
      await this.reloadPlayers(t);
      if (t.game.status !== 'lobby' && !t.players.some((p) => !p.removed && !p.left_at)) {
        await this.endEarly(t);
        return;
      }
      await this.settle(t);
    });
  }

  /** `POST /:id/remove {seat}`: the host takes someone out, in the lobby or the game. */
  async remove(gameId: string, userId: string, seat: number): Promise<StoryGameView> {
    await this.inGame(gameId, async (t) => {
      this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (!LIVE.includes(t.game.status)) throw new AppError('GAME_OVER', 409, 'this game has ended');
      this.requireController(t, userId);
      const target = t.players.find((p) => p.seat === seat && !p.removed);
      if (!target) throw new AppError('NO_SUCH_SEAT', 404, 'nobody is in that seat');
      if (target.user_id === userId) throw new AppError('CANNOT_REMOVE_SELF', 400, 'leave the game instead');
      // the stand-in holds the controls while the host's phone is locked — not
      // the power to take the game away from them
      if (target.user_id === t.game.host_id) throw new AppError('NOT_HOST', 403, 'the host cannot be removed');
      await this.removeInTx(t, target.user_id);
    });
    return this.view(gameId, userId);
  }

  private async removeInTx(t: Tx, userId: string): Promise<void> {
    await t.client.query(`UPDATE story_game_players SET removed = true WHERE game_id = $1 AND user_id = $2`, [
      t.game.id,
      userId,
    ]);
    await this.bump(t, `status = status`);
    await this.reloadPlayers(t);
    if (t.game.status !== 'lobby' && !t.players.some((p) => !p.removed && !p.left_at)) {
      await this.endEarly(t);
      return;
    }
    await this.settle(t);
  }

  // -------------------------------------------------------------------------
  // for the play module (invites, chat cards, playing again) — contract §B3

  /** What an invite banner says about a game. */
  async summary(gameId: string): Promise<InviteSummary> {
    if (!UUID_RE.test(gameId)) throw notFound();
    const res = await this.pool.query<{
      mode: StoryGameMode;
      dialect: StoryDialect;
      length: StoryLength;
      question_count: number;
      title: string | null;
    }>(
      `SELECT g.mode, g.dialect, g.length, g.question_count, COALESCE(g.story_snapshot->>'title', s.title) AS title
         FROM story_games g LEFT JOIN stories s ON s.id = g.story_id WHERE g.id = $1`,
      [gameId],
    );
    const r = res.rows[0];
    if (!r) throw notFound();
    return {
      mode: r.mode,
      dialect: r.dialect,
      length: r.length,
      questionCount: r.question_count,
      storyTitle: r.title ?? undefined,
    };
  }

  /**
   * A game card as one viewer sees it: its live state for members and for
   * people the join rule lets in; for anyone else, 'unavailable' — the same as
   * a game that does not exist.
   */
  async card(viewerId: string, gameId: string): Promise<LobbyCard> {
    const unavailable: LobbyCard = {
      game: 'stories',
      lobbyId: gameId,
      status: 'unavailable',
      players: 0,
      maxPlayers: 0,
      summary: {},
      canJoin: false,
      isMember: false,
    };
    if (!UUID_RE.test(gameId)) return unavailable;
    const res = await this.pool.query<{
      mode: StoryGameMode;
      status: StoryGameStatus;
      host_id: string | null;
      access: GameAccess;
      chat_group_id: string | null;
      finished_at: Date | null;
      in_game: number;
      me: boolean | null;
    }>(
      `SELECT g.mode, g.status, g.host_id, g.access, g.chat_group_id, g.finished_at,
              (SELECT count(*)::int FROM story_game_players p WHERE p.game_id = g.id AND NOT p.removed AND p.left_at IS NULL) AS in_game,
              (SELECT NOT p.removed FROM story_game_players p WHERE p.game_id = g.id AND p.user_id = $2) AS me
         FROM story_games g WHERE g.id = $1`,
      [gameId, viewerId],
    );
    const g = res.rows[0];
    if (!g || g.mode === 'solo' || g.me === false) return unavailable;
    const isMember = g.me === true;
    const allowed =
      isMember ||
      canJoin(await joinFacts(this.pool, { id: gameId, hostId: g.host_id, access: g.access, chatGroupId: g.chat_group_id }, viewerId));
    if (!allowed) return unavailable;
    const max = MAX_PLAYERS[g.mode];
    const joinable = g.status === 'lobby' || g.status === 'reading';
    let status: LobbyCardStatus;
    if (g.status === 'cancelled') status = 'cancelled';
    else if (g.status === 'finished' || g.finished_at) status = 'finished';
    else if (!joinable) status = 'started';
    else status = g.in_game >= max ? 'full' : 'open';
    return {
      game: 'stories',
      lobbyId: gameId,
      status,
      players: g.in_game,
      maxPlayers: max,
      summary: await this.summary(gameId),
      canJoin: !isMember && status === 'open',
      isMember,
    };
  }

  /** The members (not removed) of a game, for the play module's `play_changed`. */
  async memberIds(gameId: string): Promise<string[]> {
    if (!UUID_RE.test(gameId)) return [];
    const res = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM story_game_players WHERE game_id = $1 AND NOT removed ORDER BY seat`,
      [gameId],
    );
    return res.rows.map((r) => r.user_id);
  }

  /** Called after every change committed on this instance (the play module's `play_changed`). */
  onChange(listener: (gameId: string, version: number) => void): void {
    this.notifier?.onChange(listener);
  }

  /**
   * A group's "Play again": the host (or the stand-in) opens the next round —
   * a new lobby with the same settings and only themselves in it. Everyone else
   * sees `nextGameId` and joins with one tap, through the join rule like any
   * game; nobody is put into a game they did not choose. Asking twice returns
   * the same round. The story is the one asked for, else the same one if it is
   * still published, else another of the same variety and length.
   */
  async openNextRound(userId: string, gameId: string, opts: { storyId?: string } = {}): Promise<{ gameId: string }> {
    let next = '';
    await this.inGame(gameId, async (t) => {
      this.member(t, userId);
      await this.touchInTx(t, userId);
      await this.settle(t);
      if (t.game.mode === 'solo') throw new AppError('NOT_A_ROUND', 409, 'start a new game instead');
      if (!t.game.finished_at) throw new AppError('NOT_FINISHED', 409, 'this game has not finished');
      if (t.game.next_game_id) {
        next = t.game.next_game_id;
        return;
      }
      this.requireController(t, userId);
      const story = await this.nextStory(t, opts.storyId, [userId]);
      const access: GameAccess = t.game.access === 'open' && (await isKnownAdult(t.client, userId)) ? 'open' : 'friends';
      const me = t.players.find((p) => p.user_id === userId)!;
      const round = await this.insertGame(t.client, t.others, userId, story, {
        mode: t.game.mode,
        questionCount: t.game.question_count,
        timerSeconds: t.game.timer_seconds,
        textDuring: t.game.text_during,
        access,
        chatGroupId: t.game.chat_group_id,
        extraTime: me.extra_time,
      });
      next = round.game.id;
      await this.bump(t, `next_game_id = $3`, [next]);
    });
    return { gameId: next };
  }

  /**
   * A duo's rematch, once both players asked for it (the play module keeps the
   * offers): a new game with the same settings and both of them in it, started
   * at once — they both chose it. The next story is the one asked for, else
   * another of the same variety and length that neither has finished, if there
   * is one. Asking twice returns the same game.
   */
  async startPairRematch(gameId: string, opts: { storyId?: string } = {}): Promise<{ gameId: string }> {
    let next = '';
    await this.inGame(gameId, async (t) => {
      await this.settle(t);
      if (t.game.next_game_id) {
        next = t.game.next_game_id;
        return;
      }
      const pair = t.players.filter((p) => !p.removed).sort((a, b) => a.seat - b.seat);
      if (t.game.mode === 'solo' || pair.length !== 2) throw new AppError('NOT_A_PAIR', 409, 'a rematch is for two players');
      if (!t.game.finished_at) throw new AppError('NOT_FINISHED', 409, 'this game has not finished');
      const ids = pair.map((p) => p.user_id);
      const ok = await t.client.query<{ ok: boolean }>(
        `SELECT (SELECT count(*) FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL) = 2
            AND NOT EXISTS (SELECT 1 FROM blocks WHERE blocker_id = ANY($1::uuid[]) AND blocked_id = ANY($1::uuid[])) AS ok`,
        [ids],
      );
      if (!ok.rows[0]!.ok) throw notFound();
      const host = pair.find((p) => p.user_id === t.game.host_id) ?? pair[0]!;
      const other = pair.find((p) => p !== host)!;
      const story = await this.nextStory(t, opts.storyId, ids, true);
      const access: GameAccess =
        t.game.access === 'open' && (await isKnownAdult(t.client, host.user_id)) ? 'open' : 'friends';
      const rematch = await this.insertGame(t.client, t.others, host.user_id, story, {
        mode: t.game.mode,
        questionCount: t.game.question_count,
        timerSeconds: t.game.timer_seconds,
        textDuring: t.game.text_during,
        access,
        chatGroupId: t.game.chat_group_id,
        extraTime: host.extra_time,
      });
      await t.client.query(
        `INSERT INTO story_game_players (game_id, user_id, seat, extra_time, last_seen_at) VALUES ($1, $2, 2, $3, now())`,
        [rematch.game.id, other.user_id, other.extra_time],
      );
      this.presence.touch(rematch.game.id, other.user_id);
      await this.reloadPlayers(rematch);
      await this.beginGame(rematch, story, false);
      next = rematch.game.id;
      await this.bump(t, `next_game_id = $3`, [next]);
    });
    return { gameId: next };
  }

  // the story for the next game: asked for, else (a pair) one nobody has
  // finished, else the same one, else any of the same variety and length
  private async nextStory(t: Tx, storyId: string | undefined, people: string[], preferNew = false): Promise<GameStory> {
    const count = t.game.question_count;
    const usable = (s: GameStory | null): s is GameStory =>
      !!s && s.questions.length >= count && isAllowedQuestionCount(s.length, count);
    if (storyId) {
      const asked = await this.stories.getPublishedForGame(storyId, t.client);
      if (!usable(asked)) throw new AppError('NO_STORY', 404, 'no such story');
      return asked;
    }
    const pick = async () => {
      const id = await this.stories.pickRandomPublished(
        { dialect: t.game.dialect, length: t.game.length, minQuestions: count, preferUnseenBy: people },
        t.client,
      );
      return id ? this.stories.getPublishedForGame(id, t.client) : null;
    };
    const candidates = preferNew
      ? [pick, () => this.stories.getPublishedForGame(t.game.story_id, t.client)]
      : [() => this.stories.getPublishedForGame(t.game.story_id, t.client), pick];
    for (const get of candidates) {
      const s = await get();
      if (usable(s)) return s;
    }
    throw new AppError('NO_STORY', 404, 'no story of that kind yet');
  }

  // -------------------------------------------------------------------------
  // blocks, account deletion, housekeeping

  /**
   * After a block between A (who blocked) and B commits: in every lobby with
   * both of them, B is taken out — A, if B is the host — exactly as a host's
   * removal looks, so nobody learns of the block. In a started game nobody is
   * removed (that would tell); their names are hidden from each other by the
   * identity rule, and neither can join a lobby the other is in. Game rows are
   * locked one at a time in id order, never inside the block's transaction.
   *
   * There is no such hook for an account found to be a minor's, on purpose: a
   * birth month is set once (from none, never changed), and creating or joining
   * a game needs one, so nobody already in a game can later turn out to be a
   * minor. A hook for it would be code that never runs.
   */
  async onBlock(blockerId: string, blockedId: string): Promise<void> {
    const games = await this.pool.query<{ id: string }>(
      `SELECT g.id FROM story_games g
        WHERE g.status = 'lobby'
          AND EXISTS (SELECT 1 FROM story_game_players p WHERE p.game_id = g.id AND p.user_id = $1 AND NOT p.removed)
          AND EXISTS (SELECT 1 FROM story_game_players p WHERE p.game_id = g.id AND p.user_id = $2 AND NOT p.removed)
        ORDER BY g.id`,
      [blockerId, blockedId],
    );
    for (const { id } of games.rows) {
      try {
        await this.run(id, async (t) => {
          if (t.game.status !== 'lobby') return;
          const both = [blockerId, blockedId].every((u) => t.players.some((p) => p.user_id === u && !p.removed));
          if (!both) return;
          await this.removeInTx(t, t.game.host_id === blockedId ? blockerId : blockedId);
        });
      } catch (err) {
        this.log.warn({ err, gameId: id }, 'could not separate a blocked pair in a story lobby');
      }
    }
  }

  /**
   * Take someone out of every game they are still in, through the leave path
   * (account deletion: before their rows are erased, so the others' games carry
   * on without waiting for a player who will never come back).
   */
  async leaveAll(userId: string): Promise<void> {
    const games = await this.pool.query<{ id: string }>(
      `SELECT g.id FROM story_games g JOIN story_game_players p ON p.game_id = g.id AND p.user_id = $1
        WHERE NOT p.removed AND p.left_at IS NULL AND g.status = ANY($2::text[]) ORDER BY g.id`,
      [userId, LIVE],
    );
    for (const { id } of games.rows) {
      try {
        await this.leave(id, userId);
      } catch (err) {
        this.log.warn({ err, gameId: id }, 'could not take a closed account out of a story game');
      }
    }
  }

  /**
   * The 6-hourly sweep (nothing of this runs in a request): lobbies and reading
   * phases nobody touched for 6 h are closed; questions and reveals left that
   * long are closed and finished the normal way (rewards included); two days
   * after a game ends its questions, text and answers go (the totals stay, for
   * history and quests); after 400 days the game goes. Deletes run in batches.
   */
  async housekeeping(): Promise<{ closed: number; finished: number; cleared: number; deleted: number }> {
    const stats = { closed: 0, finished: 0, cleared: 0, deleted: 0 };
    const stale = await this.pool.query<{ id: string; status: StoryGameStatus }>(
      `SELECT id, status FROM story_games
        WHERE status = ANY($1::text[]) AND updated_at < now() - make_interval(hours => $2)
        ORDER BY id LIMIT 1000`,
      [LIVE, STALE_HOURS],
    );
    for (const row of stale.rows) {
      try {
        await this.run(row.id, async (t) => {
          if (Date.now() - t.game.updated_at.getTime() < STALE_HOURS * 3_600_000) return;
          if (t.game.status === 'lobby' || t.game.status === 'reading') {
            await this.endEarly(t);
            stats.closed += 1;
          } else if (t.game.status === 'question' || t.game.status === 'reveal') {
            await this.finishStale(t);
            stats.finished += 1;
          }
        });
      } catch (err) {
        this.log.warn({ err, gameId: row.id }, 'story game sweep failed for one game');
      }
    }
    for (;;) {
      const cleared = await this.pool.query<{ id: string }>(
        `UPDATE story_games SET plan = NULL, story_snapshot = NULL
          WHERE id IN (SELECT id FROM story_games
                        WHERE status IN ('finished','cancelled') AND (plan IS NOT NULL OR story_snapshot IS NOT NULL)
                          AND COALESCE(finished_at, updated_at) < now() - make_interval(hours => $1)
                        LIMIT 1000)
          RETURNING id`,
        [PLAN_RETENTION_HOURS],
      );
      if (cleared.rows.length) {
        await this.pool.query(`DELETE FROM story_game_answers WHERE game_id = ANY($1::uuid[])`, [
          cleared.rows.map((r) => r.id),
        ]);
      }
      stats.cleared += cleared.rows.length;
      if (cleared.rows.length < 1000) break;
    }
    for (;;) {
      const deleted = await this.pool.query(
        `DELETE FROM story_games WHERE id IN (
           SELECT id FROM story_games
            WHERE status IN ('finished','cancelled') AND COALESCE(finished_at, updated_at) < now() - make_interval(days => $1)
            LIMIT 1000)`,
        [GAME_RETENTION_DAYS],
      );
      stats.deleted += deleted.rowCount ?? 0;
      if ((deleted.rowCount ?? 0) < 1000) break;
    }
    this.presence.prune(STALE_HOURS * 3_600_000);
    return stats;
  }

  /** Shutdown: stop the timers; every waiting poll is answered now. */
  close(): void {
    this.closing = true;
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.notifier?.close();
  }

  // -------------------------------------------------------------------------
  // the deadline timer and the advance

  /**
   * Apply whatever is due on a game, once per game per instance at a time
   * (a call while one runs makes it run once more after). Skips a game another
   * transaction holds and tries again in 250 ms, rather than parking a
   * connection behind it.
   */
  advance(gameId: string): Promise<void> {
    const running = this.inflight.get(gameId);
    if (running) {
      this.rerun.add(gameId);
      return running;
    }
    const p = this.doAdvance(gameId).finally(() => {
      this.inflight.delete(gameId);
      if (this.rerun.delete(gameId)) void this.advance(gameId);
    });
    this.inflight.set(gameId, p);
    return p;
  }

  private async doAdvance(gameId: string): Promise<void> {
    if (this.closing) return;
    try {
      const res = await this.run(gameId, (t) => this.settle(t), { skipLocked: true });
      if (res === 'busy') this.arm(gameId, Date.now() + 250);
    } catch (err) {
      this.log.warn({ err, gameId }, 'story game advance failed');
      this.arm(gameId, Date.now() + 30_000);
    }
  }

  /** When something next becomes due on a game: the armed timer's instant, or worked out now (and armed). */
  private async dueAt(gameId: string): Promise<number | null> {
    const armed = this.timers.get(gameId);
    if (armed) return armed.at;
    const g = await this.pool.query<GameRow>(`SELECT * FROM story_games WHERE id = $1`, [gameId]);
    const game = g.rows[0];
    if (!game) return null;
    const players = await this.loadPlayers(this.pool, gameId);
    const answered = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM story_game_answers WHERE game_id = $1 AND question_index = $2`,
      [gameId, game.current_index],
    );
    const state = { game, players, answered: new Set(answered.rows.map((r) => r.user_id)) };
    const phasePlayers = this.phasePlayersOf(gameId, players, state.answered);
    this.remember(state, phasePlayers);
    const due = nextDueAt(phaseGame(game), phasePlayers);
    this.arm(gameId, due);
    return due;
  }

  private arm(gameId: string, at: number | null): void {
    const existing = this.timers.get(gameId);
    if (at === null || this.closing || !this.useTimers) {
      if (existing) clearTimeout(existing.timer);
      this.timers.delete(gameId);
      this.lastState.delete(gameId);
      // nothing will ever fire for it here: nothing to compare presence against either
      if (at === null) this.awaySnap.delete(gameId);
      return;
    }
    if (existing?.at === at) return;
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(
      () => {
        this.timers.delete(gameId);
        this.fire(gameId);
      },
      Math.min(Math.max(0, at - Date.now()), MAX_TIMER_MS),
    );
    timer.unref?.();
    this.timers.set(gameId, { at, timer });
  }

  /**
   * The timer went off. Most of the time that is a player's presence running
   * out while they are in fact still polling (every 20 s or sooner), so
   * before taking the game's lock check, from what this instance last read of
   * the game and has heard since, whether anything can have changed: no phase
   * deadline due, nobody newly away, no newer version heard of. If not, just
   * re-arm — a transaction per game every half minute would be the cost of
   * presence otherwise.
   */
  private fire(gameId: string): void {
    const st = this.lastState.get(gameId);
    const snap = this.awaySnap.get(gameId);
    const heard = this.notifier?.versionOf(gameId);
    if (st && snap && snap.version === st.game.version && (heard === undefined || heard <= st.game.version)) {
      const players = this.phasePlayersOf(gameId, st.players, st.answered);
      const due = nextDueAt(phaseGame(st.game), players);
      const now = Date.now();
      const phaseDue = dueTransition(phaseGame(st.game), players, now) !== null;
      if (!phaseDue && awayKey(players) === snap.away && due !== null && due > now) {
        this.arm(gameId, due);
        return;
      }
    }
    void this.advance(gameId);
  }

  /** What this instance last read of a game, for `fire`. */
  private remember(state: { game: GameRow; players: PlayerRow[]; answered: Set<string> }, players: PhasePlayer[]): void {
    this.lastState.set(state.game.id, state);
    const snap = this.awaySnap.get(state.game.id);
    if (!snap || snap.version < state.game.version) {
      this.awaySnap.set(state.game.id, { version: state.game.version, away: awayKey(players) });
    }
  }

  /** Test seam: the instant a game's timer is armed for, if it is. */
  armedAt(gameId: string): number | null {
    return this.timers.get(gameId)?.at ?? null;
  }

  // -------------------------------------------------------------------------
  // transactions

  private async inGame(gameId: string, fn: (t: Tx) => Promise<void>): Promise<void> {
    if (!UUID_RE.test(gameId)) throw notFound();
    const res = await this.run(gameId, fn);
    if (res === 'missing' || res === 'busy') throw notFound();
  }

  /**
   * One transaction on one game: lock it (waiting up to 5 s; the advance skips
   * instead), run `fn`, notice a change of presence nothing else recorded,
   * commit; then, outside the transaction, wake the waiters, arm the timer and
   * credit streak milestones. A deadlock or serialization failure is retried
   * once.
   */
  private async run<T>(gameId: string, fn: (t: Tx) => Promise<T>, opts: { skipLocked?: boolean } = {}): Promise<RunResult<T>> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      let skipped = false;
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL lock_timeout = '${opts.skipLocked ? 2 : 5}s'`);
        const t = await this.lockWith(client, gameId, opts.skipLocked);
        if (!t) {
          await client.query('ROLLBACK');
          if (!opts.skipLocked) return 'missing';
          skipped = true;
        } else {
          const value = await fn(t);
          if (!t.changed) await this.presenceChanged(t);
          await client.query('COMMIT');
          this.afterCommit([t, ...t.others]);
          return { value };
        }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (attempt === 0 && (code === '40P01' || code === '40001')) continue;
        throw busyOr(err);
      } finally {
        client.release();
      }
      // SKIP LOCKED found no row: held by someone else, or gone (asked with the
      // connection back in the pool, never a second one while holding the first)
      if (skipped) {
        const exists = await this.pool.query(`SELECT 1 FROM story_games WHERE id = $1`, [gameId]);
        if (exists.rowCount) return 'busy';
        this.arm(gameId, null);
        return 'missing';
      }
    }
  }

  private async lockWith(client: pg.PoolClient, gameId: string, skipLocked = false): Promise<Tx | null> {
    const g = await client.query<GameRow>(
      `SELECT * FROM story_games WHERE id = $1 FOR UPDATE${skipLocked ? ' SKIP LOCKED' : ''}`,
      [gameId],
    );
    const game = g.rows[0];
    if (!game) return null;
    // the clock is read after the lock: a transaction that waited for it must
    // not judge a deadline by the moment it began
    const extra = await client.query<{ now: Date; answered: string[] }>(
      `SELECT clock_timestamp() AS now,
              ARRAY(SELECT user_id::text FROM story_game_answers WHERE game_id = $1 AND question_index = $2) AS answered`,
      [gameId, game.current_index],
    );
    return {
      client,
      game,
      players: await this.loadPlayers(client, gameId),
      answered: new Set(extra.rows[0]!.answered),
      now: extra.rows[0]!.now,
      changed: false,
      rewards: [],
      others: [],
    };
  }

  private async loadPlayers(executor: Executor, gameId: string): Promise<PlayerRow[]> {
    const res = await executor.query<PlayerRow>(
      `SELECT user_id, seat, joined_at, last_seen_at, done_reading_at, continued_index, extra_time, left_at,
              removed, score, correct, answered, correct_ms, xp_awarded, learning_counted
         FROM story_game_players WHERE game_id = $1 ORDER BY seat`,
      [gameId],
    );
    return res.rows;
  }

  private async reloadPlayers(t: Tx): Promise<void> {
    t.players = await this.loadPlayers(t.client, t.game.id);
  }

  private afterCommit(txs: Tx[]): void {
    for (const t of txs) {
      if (t.changed) this.notifier?.notify(t.game.id, t.game.version);
      const players = this.phasePlayers(t);
      this.awaySnap.set(t.game.id, { version: t.game.version, away: awayKey(players) });
      this.lastState.set(t.game.id, { game: t.game, players: t.players, answered: t.answered });
      this.arm(t.game.id, nextDueAt(phaseGame(t.game), players));
      if (!LIVE.includes(t.game.status)) {
        this.presence.drop(t.game.id);
        this.awaySnap.delete(t.game.id);
        this.lastState.delete(t.game.id);
      }
      for (const r of t.rewards) {
        if (r.learningCounted && r.streak !== null && this.milestones) {
          void this.milestones.recordStreak(r.userId, r.streak).catch(() => undefined);
        }
      }
    }
  }

  /**
   * Bump the version with an update of the locked row. Every update carries
   * the version it was decided on, so one that somehow did not hold the lock
   * changes nothing rather than something else.
   */
  private async bump(t: Tx, set: string, params: unknown[] = [], opts: { idle?: boolean } = {}): Promise<void> {
    const res = await t.client.query<GameRow>(
      `UPDATE story_games SET ${set}, version = version + 1${opts.idle ? '' : ', updated_at = now()'}
        WHERE id = $1 AND version = $2 RETURNING *`,
      [t.game.id, t.game.version, ...params],
    );
    if (!res.rows[0]) throw new Error(`story game ${t.game.id} moved under its lock`);
    t.game = res.rows[0];
    t.changed = true;
  }

  // -------------------------------------------------------------------------
  // presence

  private touch(gameId: string, userId: string, dbSeenAt: Date | null): void {
    const { write, wasAway } = this.presence.touch(gameId, userId, dbSeenAt);
    if (write) {
      void this.pool
        .query(`UPDATE story_game_players SET last_seen_at = now() WHERE game_id = $1 AND user_id = $2`, [gameId, userId])
        .catch((err) => this.log.warn({ err, gameId }, 'could not record a story game presence'));
    }
    // back from away: the others' views should say so (and the host gets the controls back)
    if (wasAway) void this.advance(gameId);
  }

  private async touchInTx(t: Tx, userId: string): Promise<void> {
    const p = t.players.find((x) => x.user_id === userId);
    if (!p) return;
    const { write } = this.presence.touch(t.game.id, userId, p.last_seen_at ?? p.joined_at);
    if (write) {
      await t.client.query(`UPDATE story_game_players SET last_seen_at = now() WHERE game_id = $1 AND user_id = $2`, [
        t.game.id,
        userId,
      ]);
    }
  }

  private phasePlayers(t: Tx): PhasePlayer[] {
    return this.phasePlayersOf(t.game.id, t.players, t.answered);
  }

  private phasePlayersOf(gameId: string, players: PlayerRow[], answered: Set<string>): PhasePlayer[] {
    return players.map((p) => {
      const seen = p.last_seen_at ?? p.joined_at;
      return {
        userId: p.user_id,
        seat: p.seat,
        joinedAt: p.joined_at.getTime(),
        left: p.left_at !== null,
        removed: p.removed,
        away: this.presence.isAway(gameId, p.user_id, seen),
        awayAt: this.presence.awayAt(gameId, p.user_id, seen),
        extraTime: p.extra_time,
        doneReading: p.done_reading_at !== null,
        continuedIndex: p.continued_index,
        answered: answered.has(p.user_id),
      };
    });
  }

  /**
   * Someone turned away, or came back, and nothing else changed: bump the
   * version so every view shows it — the counts, the away marks, and who holds
   * the host controls. Compared with what the last version was decided with
   * on this instance; it does not count as activity for the lobby's idle clock.
   */
  private async presenceChanged(t: Tx): Promise<void> {
    if (!LIVE.includes(t.game.status) || t.game.mode === 'solo') return;
    const snap = this.awaySnap.get(t.game.id);
    if (!snap || snap.version !== t.game.version) return;
    if (snap.away !== awayKey(this.phasePlayers(t))) await this.bump(t, `status = status`, [], { idle: true });
  }

  // -------------------------------------------------------------------------
  // the phases

  /** Apply every transition that is due, in order. */
  private async settle(t: Tx): Promise<void> {
    for (let step = 0; step < 4; step++) {
      const due = dueTransition(phaseGame(t.game), this.phasePlayers(t), t.now.getTime());
      if (!due) return;
      switch (due) {
        case 'expire_lobby':
          await this.endEarly(t);
          break;
        case 'open_questions':
          await this.openQuestion(t, 0);
          break;
        case 'close_question':
          await this.closeQuestion(t);
          break;
        case 'next':
          await this.next(t);
          break;
      }
    }
  }

  /**
   * The questions are built and the reading starts: the plan (chosen and
   * shuffled now, kept server-side), the text it is about, and the reading
   * caps for a duo or group. A solo reader who has just read the story in the
   * reader goes straight to the first question.
   */
  private async beginGame(t: Tx, story: GameStory, skipReading: boolean): Promise<void> {
    const plan = buildPlan(t.game.id, story.questions, t.game.question_count);
    const snapshot: StorySnapshot = {
      slug: story.slug,
      title: story.title,
      summary: story.summary,
      wordCount: story.wordCount,
      paragraphs: storyParagraphs(story.body),
      glossary: story.glossary,
    };
    const now = t.now.getTime();
    const solo = t.game.mode === 'solo';
    const soft = solo ? null : new Date(now + readingSoftCapSeconds(story.dialect, story.wordCount) * 1000);
    const hard = solo ? null : new Date(now + readingHardCapSeconds(story.dialect, story.wordCount) * 1000);
    await this.bump(
      t,
      `status = 'reading', plan = $3, story_snapshot = $4, started_at = $5, phase_started_at = $5,
       phase_ends_at = $6, reading_soft_cap_at = $7, reading_hard_cap_at = $6, current_index = 0,
       dialect = $8, level = $9, length = $10`,
      [JSON.stringify(plan), JSON.stringify(snapshot), t.now, hard, soft, story.dialect, story.level, story.length],
    );
    if (solo && skipReading) await this.openQuestion(t, 0);
  }

  private async openQuestion(t: Tx, index: number): Promise<void> {
    const endsAt = questionEndsAt(t.game.mode, t.game.timer_seconds, t.now.getTime());
    // the code goes with the reading: nobody joins once the questions start
    await this.bump(t, `status = 'question', current_index = $3, phase_started_at = $4, phase_ends_at = $5, code = NULL`, [
      index,
      t.now,
      endsAt === null ? null : new Date(endsAt),
    ]);
    t.answered = new Set();
  }

  /**
   * Close the open question: the totals move (only now — never while it is
   * open), the reveal starts, and when it was the last question the game is
   * finished and everyone in it paid, in this same transaction.
   */
  private async closeQuestion(t: Tx): Promise<void> {
    await t.client.query(
      `UPDATE story_game_players p SET
         answered = p.answered + 1,
         correct = p.correct + CASE WHEN a.correct THEN 1 ELSE 0 END,
         score = p.score + CASE WHEN a.correct THEN $3::int ELSE 0 END,
         correct_ms = p.correct_ms + CASE WHEN a.correct THEN a.elapsed_ms ELSE 0 END
        FROM story_game_answers a
       WHERE a.game_id = $1 AND a.question_index = $2 AND p.game_id = a.game_id AND p.user_id = a.user_id`,
      [t.game.id, t.game.current_index, POINTS_PER_CORRECT],
    );
    const last = t.game.current_index >= t.game.question_count - 1;
    const ends = revealEndsAt(t.game.mode, t.now.getTime());
    await this.bump(
      t,
      `status = 'reveal', phase_started_at = $3, phase_ends_at = $4${last ? ', finished_at = $3, code = NULL' : ''}`,
      [t.now, ends === null ? null : new Date(ends)],
    );
    await this.reloadPlayers(t);
    if (last) await this.pay(t);
  }

  private async next(t: Tx): Promise<void> {
    if (!t.game.finished_at && t.game.current_index + 1 < t.game.question_count) {
      await this.openQuestion(t, t.game.current_index + 1);
      return;
    }
    if (!t.game.finished_at) {
      await this.bump(t, `finished_at = $3, code = NULL`, [t.now]);
      await this.pay(t);
    }
    await this.bump(t, `status = 'finished', phase_started_at = $3, phase_ends_at = NULL`, [t.now]);
  }

  /**
   * A game ending before its end: cancelled — unless its last question has
   * closed, in which case it is finished properly and its results stand.
   */
  private async endEarly(t: Tx): Promise<void> {
    if (t.game.finished_at) {
      if (t.game.status !== 'finished') await this.bump(t, `status = 'finished', phase_ends_at = NULL`);
      return;
    }
    await this.bump(t, `status = 'cancelled', code = NULL, phase_ends_at = NULL`);
  }

  /** The sweep's way out of a question or reveal left for hours: close, finish, pay. */
  private async finishStale(t: Tx): Promise<void> {
    if (t.game.status === 'question') await this.closeQuestion(t);
    if (!t.game.finished_at) {
      await this.bump(t, `finished_at = $3, code = NULL`, [t.now]);
      await this.pay(t);
    }
    if (t.game.status !== 'finished') await this.bump(t, `status = 'finished', phase_ends_at = NULL`);
  }

  private async pay(t: Tx): Promise<void> {
    const playing = t.players.filter((p) => !p.removed && !p.left_at).map((p) => p.user_id);
    t.rewards = await payRewards(
      t.client,
      this.rewardDeps,
      this.log,
      { id: t.game.id, storyId: t.game.story_id, questionCount: t.game.question_count },
      playing,
      t.now,
    );
    await this.reloadPlayers(t);
  }

  // -------------------------------------------------------------------------
  // who may do what

  /** The caller's row, if they are a member (not removed); else the game does not exist for them. */
  private member(t: Tx, userId: string): PlayerRow {
    const me = t.players.find((p) => p.user_id === userId);
    if (!me || me.removed) throw notFound();
    return me;
  }

  /** The caller holds the host controls right now (the host, or the stand-in while the host is away). */
  private requireController(t: Tx, userId: string): void {
    if (controllerOf(t.game.host_id, this.phasePlayers(t)) !== userId) {
      throw new AppError('NOT_HOST', 403, 'only the host can do that');
    }
  }
}

/** A lock wait that ran out (lock_timeout) is "try again", not a server error. */
function busyOr(err: unknown): unknown {
  if ((err as { code?: string }).code === '55P03') {
    return new AppError('GAME_BUSY', 503, 'this game is busy; try again', { retryAfterSec: 1 });
  }
  return err;
}

function phaseLite(p: PlayerRow): PhasePlayer {
  return {
    userId: p.user_id,
    seat: p.seat,
    joinedAt: p.joined_at.getTime(),
    left: p.left_at !== null,
    removed: p.removed,
    away: false,
    awayAt: Number.MAX_SAFE_INTEGER,
    extraTime: p.extra_time,
    doneReading: p.done_reading_at !== null,
    continuedIndex: p.continued_index,
    answered: false,
  };
}

function awayKey(players: PhasePlayer[]): string {
  return players
    .filter((p) => stillIn(p) && p.away)
    .map((p) => p.seat)
    .sort((a, b) => a - b)
    .join(',');
}

/** A join code: six characters from the look-alike-free alphabet, each drawn with the CSPRNG. */
export function newJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}
