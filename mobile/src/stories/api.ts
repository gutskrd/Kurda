import type {
  GameAccess,
  QuestionCount,
  StoryDetail,
  StoryDialect,
  StoryGameMode,
  StoryGameSummary,
  StoryGameView,
  StoryLength,
  StoryLevel,
  StoryListItem,
  StoryProgress,
  TextDuring,
  TimerSeconds,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * Stories over the API (contract §A3/§A4). The shapes are @kurda/shared's,
 * the same ones the API builds and the browser reads; nothing is redefined
 * here.
 *
 * Reading needs no account (`/stories`); every game route does, and anyone
 * who is not a member of a game gets the same 404 as for a game that does not
 * exist.
 */

export interface StoryFilter {
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
}

export function listStories(client: ApiClient, filter: StoryFilter = {}): Promise<ApiResult<{ stories: StoryListItem[] }>> {
  const q = new URLSearchParams();
  if (filter.dialect) q.set('dialect', filter.dialect);
  if (filter.length) q.set('length', filter.length);
  if (filter.level) q.set('level', String(filter.level));
  const qs = q.toString();
  return client.get(`/stories${qs ? `?${qs}` : ''}`);
}

export const getStory = (client: ApiClient, slugOrId: string): Promise<ApiResult<StoryDetail>> =>
  client.get(`/stories/${encodeURIComponent(slugOrId)}`);

export const activeGames = (client: ApiClient): Promise<ApiResult<{ games: StoryGameSummary[] }>> =>
  client.get('/story-games/active');

export const storyHistory = (client: ApiClient): Promise<ApiResult<{ progress: StoryProgress[] }>> =>
  client.get('/story-games/history');

/** Whether this account may open a game to adults who are not its friends ("Open"). */
export const gameOptions = (client: ApiClient): Promise<ApiResult<{ canHostOpen: boolean }>> =>
  client.get('/story-games/options');

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
  /** solo: straight to the first question, the story having just been read */
  skipReading?: boolean;
  extraTime?: boolean;
}

export const createGame = (client: ApiClient, input: CreateGameInput): Promise<ApiResult<StoryGameView>> =>
  client.post('/story-games', input);

export const joinGame = (
  client: ApiClient,
  target: { code: string } | { id: string },
  extraTime?: boolean,
): Promise<ApiResult<StoryGameView>> => client.post('/story-games/join', { ...target, ...(extraTime ? { extraTime } : {}) });

/**
 * The view; with `since`, a long-poll that answers when the game moves past
 * that version (or after about 20 s with the same one). An empty object comes
 * back when the server stopped waiting because it was shutting down.
 */
export const getGame = (client: ApiClient, id: string, since?: number): Promise<ApiResult<StoryGameView | Record<string, never>>> =>
  client.get(`/story-games/${id}${since !== undefined ? `?v=${since}` : ''}`);

export const getGameStory = (client: ApiClient, id: string): Promise<ApiResult<StoryDetail>> =>
  client.get(`/story-games/${id}/story`);

export interface SettingsPatch {
  storyId?: string;
  questionCount?: QuestionCount;
  timerSeconds?: TimerSeconds;
  textDuring?: TextDuring;
  access?: GameAccess;
}

export const updateSettings = (client: ApiClient, id: string, patch: SettingsPatch): Promise<ApiResult<StoryGameView>> =>
  client.patch(`/story-games/${id}/settings`, patch);

export const startGame = (client: ApiClient, id: string): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${id}/start`);

export const doneReading = (client: ApiClient, id: string): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${id}/done-reading`);

export const answerQuestion = (client: ApiClient, id: string, index: number, choice: number): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${id}/answers`, { index, choice });

export const continueAfter = (client: ApiClient, id: string, index: number): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${id}/continue`, { index });

export const advanceGame = (
  client: ApiClient,
  id: string,
  from: { status: StoryGameView['status']; index: number },
): Promise<ApiResult<StoryGameView>> => client.post(`/story-games/${id}/advance`, { from });

export const leaveGame = (client: ApiClient, id: string): Promise<ApiResult<{ ok: true }>> =>
  client.post(`/story-games/${id}/leave`);

export const removePlayer = (client: ApiClient, id: string, seat: number): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${id}/remove`, { seat });

export const setExtraTime = (client: ApiClient, id: string, on: boolean): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${id}/extra-time`, { on });

/** A view, as opposed to the empty answer a long-poll gives when the server stops waiting. */
export function isView(v: StoryGameView | Record<string, never> | null | undefined): v is StoryGameView {
  return !!v && typeof (v as StoryGameView).id === 'string' && typeof (v as StoryGameView).version === 'number';
}
