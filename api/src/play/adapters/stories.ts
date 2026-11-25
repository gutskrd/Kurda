import type pg from 'pg';
import { z } from 'zod';
import { lowerUuid } from '../../http/ids.js';
import {
  DEFAULT_TIMER,
  GAME_ACCESS,
  MAX_PLAYERS,
  QUESTION_COUNTS,
  STORY_DIALECTS,
  STORY_LENGTHS,
  STORY_LEVELS,
  TEXT_DURING_OPTIONS,
  TIMER_PRESETS,
  type GameAccess,
  type InviteSummary,
  type LobbyCard,
  type QuestionCount,
  type StoryDialect,
  type StoryGameMode,
  type StoryLength,
  type StoryLevel,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import { AppError } from '../../plugins/errors.js';
import { gameNotFound, parseSettings } from '../errors.js';
import { tallySeries } from '../lobby.js';
import type { JoinOutcome, LobbyFacts, LobbyPhase, PlayAdapter, Series } from '../types.js';

type Executor = Pick<pg.Pool, 'query'>;

/** What an invite creates a story game with: the story-games service's `CreateGameInput`, duo or group. */
export interface StoryInviteSettings {
  mode: StoryGameMode;
  storyId?: string;
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
  questionCount: QuestionCount;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
  access: GameAccess;
  chatGroupId?: string | null;
}

/**
 * What this adapter needs of the story games, by their public method names (`StoryGamesService` satisfies it). Kept
 * narrow, so the play layer depends on nothing else.
 */
export interface StoryGamesPort {
  createFromInvite(hostId: string, input: StoryInviteSettings): Promise<{ gameId: string }>;
  /** The normal join; refuses with GAME_NOT_FOUND (404), GAME_STARTED or GAME_FULL (409). */
  join(userId: string, target: { id: string }): Promise<unknown>;
  card(viewerId: string, gameId: string): Promise<LobbyCard>;
  summary(gameId: string): Promise<InviteSummary>;
  openNextRound(userId: string, gameId: string): Promise<{ gameId: string }>;
  startPairRematch(gameId: string): Promise<{ gameId: string }>;
  /** leaving; the host leaving a lobby calls it off */
  leave(gameId: string, userId: string): Promise<void>;
  /** called after every change the service commits — the play layer's `play_changed` */
  onChange(listener: (gameId: string, version: number) => void): void;
}

const oneOf = <T extends string | number>(values: readonly T[]) =>
  z.custom<T>((v) => (values as readonly unknown[]).includes(v), { message: `one of ${values.join(', ')}` });

const settingsSchema = z
  .object({
    mode: z.enum(['duo', 'group']),
    storyId: lowerUuid().optional(),
    dialect: oneOf<StoryDialect>(STORY_DIALECTS).optional(),
    length: oneOf<StoryLength>(STORY_LENGTHS).optional(),
    level: oneOf<StoryLevel>(STORY_LEVELS).optional(),
    questionCount: oneOf<QuestionCount>(QUESTION_COUNTS),
    timerSeconds: oneOf<TimerSeconds>(TIMER_PRESETS).optional(),
    textDuring: oneOf<TextDuring>(TEXT_DURING_OPTIONS).default('visible'),
    access: oneOf<GameAccess>(GAME_ACCESS).default('friends'),
  })
  .transform((s) => ({ ...s, timerSeconds: s.timerSeconds ?? DEFAULT_TIMER[s.mode] }));

interface GameRow {
  id: string;
  host_id: string | null;
  mode: StoryGameMode;
  status: 'lobby' | 'reading' | 'question' | 'reveal' | 'finished' | 'cancelled';
  access: GameAccess;
  chat_group_id: string | null;
  next_game_id: string | null;
  finished_at: Date | null;
}

/**
 * Stories for the play layer: changes go through the story-games service, and two plain reads cover what it has no
 * method for (host, players, the previous game). A game is joinable in its lobby and its reading phase.
 */
export class StoriesAdapter implements PlayAdapter {
  readonly game = 'stories' as const;

  constructor(
    private readonly pool: Executor,
    private readonly stories: StoryGamesPort,
  ) {}

  async create(hostId: string, settings: unknown, opts: { chatGroupId: string | null }): Promise<string> {
    const s = parseSettings(settingsSchema, settings);
    const { gameId } = await this.stories.createFromInvite(hostId, { ...s, chatGroupId: opts.chatGroupId });
    return gameId;
  }

  async join(userId: string, lobbyId: string): Promise<JoinOutcome> {
    try {
      await this.stories.join(userId, { id: lobbyId });
      return 'joined';
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code === 'GAME_NOT_FOUND') return 'not-found';
        if (err.code === 'GAME_STARTED') return 'started';
        if (err.code === 'GAME_FULL') return 'full';
      }
      throw err;
    }
  }

  async facts(lobbyId: string): Promise<LobbyFacts | null> {
    const g = await this.pool.query<GameRow>(
      `SELECT id, host_id, mode, status, access, chat_group_id, next_game_id, finished_at FROM story_games WHERE id = $1`,
      [lobbyId],
    );
    const row = g.rows[0];
    if (!row || row.mode === 'solo') return null;
    const players = await this.pool.query<{ user_id: string; left_at: Date | null; removed: boolean }>(
      `SELECT user_id, left_at, removed FROM story_game_players WHERE game_id = $1 ORDER BY seat`,
      [lobbyId],
    );
    const before = await this.pool.query<{ id: string }>(`SELECT id FROM story_games WHERE next_game_id = $1 LIMIT 1`, [lobbyId]);
    const phase: LobbyPhase =
      row.status === 'cancelled'
        ? 'cancelled'
        : row.status === 'finished' || row.finished_at
          ? 'finished'
          : row.status === 'lobby'
            ? 'lobby'
            : 'started';
    const members = players.rows.filter((p) => !p.removed);
    return {
      game: 'stories',
      lobbyId,
      hostId: row.host_id,
      phase,
      joinable: row.status === 'lobby' || row.status === 'reading',
      access: row.access,
      chatGroupId: row.chat_group_id,
      maxPlayers: MAX_PLAYERS[row.mode],
      memberIds: members.map((p) => p.user_id),
      activeIds: members.filter((p) => p.left_at === null).map((p) => p.user_id),
      removedIds: players.rows.filter((p) => p.removed).map((p) => p.user_id),
      nextLobbyId: row.next_game_id,
      rematchOf: before.rows[0]?.id ?? null,
      rematchKind: row.mode === 'duo' ? 'pair' : 'round',
    };
  }

  async card(viewerId: string, lobbyId: string): Promise<LobbyCard> {
    return this.stories.card(viewerId, lobbyId);
  }

  async summary(lobbyId: string): Promise<InviteSummary | null> {
    try {
      return await this.stories.summary(lobbyId);
    } catch (err) {
      if (err instanceof AppError && err.code === 'GAME_NOT_FOUND') return null;
      throw err;
    }
  }

  async startPairRematch(lobbyId: string): Promise<string> {
    return (await this.stories.startPairRematch(lobbyId)).gameId;
  }

  async openNextRound(hostId: string, lobbyId: string): Promise<string> {
    return (await this.stories.openNextRound(hostId, lobbyId)).gameId;
  }

  /** Wins between two players over a run of duo rematches, followed back through `next_game_id`; the higher score wins, a tie draws. */
  async series(lobbyId: string, me: string, other: string): Promise<Series | null> {
    const chain = await this.pool.query<{ id: string }>(
      `WITH RECURSIVE chain(id, depth) AS (
         SELECT id, 1 FROM story_games WHERE id = $1
         UNION ALL
         SELECT g.id, c.depth + 1 FROM story_games g JOIN chain c ON g.next_game_id = c.id WHERE c.depth < 100
       )
       SELECT id FROM chain`,
      [lobbyId],
    );
    if (chain.rows.length === 0) throw gameNotFound();
    const rows = await this.pool.query<{ game_id: string; user_id: string; score: number }>(
      `SELECT p.game_id, p.user_id, p.score FROM story_game_players p JOIN story_games g ON g.id = p.game_id
        WHERE p.game_id = ANY($1::uuid[]) AND g.status = 'finished' AND NOT p.removed`,
      [chain.rows.map((r) => r.id)],
    );
    const byGame = new Map<string, Array<{ user_id: string; score: number }>>();
    for (const r of rows.rows) byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r]);
    return tallySeries(
      [...byGame.values()].map((players) => {
        const best = Math.max(...players.map((p) => p.score));
        return { players: players.map((p) => p.user_id), winners: players.filter((p) => p.score === best).map((p) => p.user_id) };
      }),
      me,
      other,
    );
  }

  async cancel(hostId: string, lobbyId: string): Promise<void> {
    await this.stories.leave(lobbyId, hostId);
  }
}
