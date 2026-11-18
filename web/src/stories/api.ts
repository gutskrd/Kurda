/** What the Stories screens ask the API, and how failures are worded; the shapes are @kurda/shared's. */
import type {
  GameAccess,
  QuestionCount,
  StoryDialect,
  StoryGameMode,
  StoryGameView,
  StoryLength,
  StoryLevel,
  StoryMe,
  TextDuring,
  TimerSeconds,
} from '@kurda/shared';
import type { ApiClient } from '../lib/api';
import { describeError } from '../lib/api';
import type { ApiError, ApiResult } from '../lib/types';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';

/**
 * Where stories live: the library under Learn, stories read under it, and games at the games' address, which invites
 * already sent point to.
 */
export const STORIES_LIBRARY = '/app/learn/stories';
export const readerPath = (slug: string): string => `${STORIES_LIBRARY}/${encodeURIComponent(slug)}`;
export const gamePath = (id: string): string => `/app/games/stories/play/${encodeURIComponent(id)}`;

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
  /** Duo and group: Rated or Friendly; solo has nobody to rank against. */
  rated?: boolean;
}

export function createGame(client: ApiClient, body: CreateStoryGame): Promise<ApiResult<StoryGameView>> {
  return client.post<StoryGameView>('/story-games', body);
}

/** Adds or removes a story from your shelf (`PUT` / `DELETE /stories/:id/bookmark`, both idempotent). */
export function setBookmark(client: ApiClient, storyId: string, on: boolean): Promise<ApiResult<{ bookmarked: boolean }>> {
  const path = `/stories/${encodeURIComponent(storyId)}/bookmark`;
  return on ? client.put<{ bookmarked: boolean }>(path) : client.delete<{ bookmarked: boolean }>(path);
}

/** Saves a reader's place (`PUT /stories/:id/progress`), answered with their whole record on the story. */
export function putProgress(
  client: ApiClient,
  storyId: string,
  body: { paragraph: number; share: number; finished?: boolean },
): Promise<ApiResult<{ me: StoryMe }>> {
  return client.put<{ me: StoryMe }>(`/stories/${encodeURIComponent(storyId)}/progress`, body);
}

/** A story game's refusals, in the reader's words. */
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
