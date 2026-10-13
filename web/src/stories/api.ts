/**
 * What the Stories screens ask the API, and how they say what went wrong.
 *
 * The shapes are @kurda/shared's (`StoryListItem`, `StoryDetail`,
 * `StoryGameView` …) — the API returns them and the phone reads the same — so
 * nothing here redefines one.
 */
import type { StoryDialect, StoryGameMode, StoryGameView, StoryLength, StoryLevel, QuestionCount, TextDuring, TimerSeconds, GameAccess } from '@kurda/shared';
import type { ApiClient } from '../lib/api';
import { describeError } from '../lib/api';
import type { ApiError, ApiResult } from '../lib/types';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Where a story is read, and where a game on it is played. */
export const STORIES_HUB = '/app/games/stories';
export const readerPath = (slug: string): string => `${STORIES_HUB}/${encodeURIComponent(slug)}`;
export const gamePath = (id: string): string => `${STORIES_HUB}/play/${encodeURIComponent(id)}`;

/** `POST /story-games`, as the setup sheet fills it in. */
export interface CreateStoryGame {
  mode: StoryGameMode;
  storyId?: string;
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
  questionCount: QuestionCount;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
  access: GameAccess;
  skipReading?: boolean;
  extraTime?: boolean;
}

export function createGame(client: ApiClient, body: CreateStoryGame): Promise<ApiResult<StoryGameView>> {
  return client.post<StoryGameView>('/story-games', body);
}

/** The refusals a story game can answer with, in the reader's words. */
const GAME_ERROR_KEY: Record<string, MessageKey> = {
  GAME_NOT_FOUND: 'stories.error.notFound',
  GAME_STARTED: 'stories.error.started',
  GAME_FULL: 'stories.error.full',
  NO_STORY: 'stories.error.noStory',
  STORY_UNAVAILABLE: 'stories.error.unavailable',
  IN_GAME: 'stories.error.inGame',
  TOO_MANY_GAMES: 'stories.error.tooMany',
  OPEN_NOT_ALLOWED: 'stories.error.openNotAllowed',
  TOO_LATE: 'stories.error.tooLate',
};

export function storyError(error: ApiError, t: Translate): string {
  const key = error.code ? GAME_ERROR_KEY[error.code] : undefined;
  return key ? t(key) : describeError(error, t);
}
