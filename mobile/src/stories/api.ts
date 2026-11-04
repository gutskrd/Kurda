import {
  storyQueryString,
  type GameAccess,
  type QuestionCount,
  type StoryDetail,
  type StoryDialect,
  type StoryGameMode,
  type StoryGameSummary,
  type StoryGameView,
  type StoryLevel,
  type StoryLibrary,
  type StoryListItem,
  type StoryMe,
  type StoryProgress,
  type StoryQuery,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * Stories over the API (contract §A3/§A4, and the library of §C). The shapes
 * are @kurda/shared's, the same ones the API builds and the browser reads;
 * nothing is redefined here.
 *
 * Reading needs no account (`/stories`, `/stories/library`); a bookmark and
 * a reading position need a signed-in session (a guest's counts, as it does
 * for a saved word); every game route needs an account, and anyone who is
 * not a member of a game gets the same 404 as for a game that does not exist.
 */

/** The library's front page: the editors' picks, the newest, the categories, and the caller's own rows. */
export const getLibrary = (client: ApiClient): Promise<ApiResult<StoryLibrary>> => client.get('/stories/library');

/** The paginated list, filtered: what the library's search and chips read. */
export const searchStories = (client: ApiClient, query: StoryQuery): Promise<ApiResult<{ stories: StoryListItem[]; total: number }>> =>
  client.get(`/stories${storyQueryString(query)}`);

export interface StoryFilter {
  dialect?: StoryDialect;
  level?: StoryLevel;
}

/** One variety's stories for a game's setup (the list is paged; a variety has far fewer than a page). */
export function listStories(client: ApiClient, filter: StoryFilter = {}): Promise<ApiResult<{ stories: StoryListItem[]; total: number }>> {
  return searchStories(client, { dialect: filter.dialect, level: filter.level, limit: 50 });
}

export const getStory = (client: ApiClient, slugOrId: string): Promise<ApiResult<StoryDetail>> =>
  client.get(`/stories/${encodeURIComponent(slugOrId)}`);

/** On or off the caller's shelf. */
export const setBookmark = (client: ApiClient, id: string, on: boolean): Promise<ApiResult<{ bookmarked: boolean }>> =>
  on ? client.put(`/stories/${id}/bookmark`) : client.delete(`/stories/${id}/bookmark`);

export interface ProgressInput {
  /** the paragraph being read, 0-based */
  paragraph: number;
  /** how far through the text, 0–1 */
  share: number;
  /** the last paragraph was reached; the server remembers the first time for good */
  finished?: boolean;
}

/** Where the caller is in a story: the server keeps the latest, and says what it knows of them on it. */
export const saveProgress = (client: ApiClient, id: string, input: ProgressInput): Promise<ApiResult<{ me: StoryMe }>> =>
  client.put(`/stories/${id}/progress`, input);

/** A glossary word that is a dictionary headword, saved to (or taken off) the caller's vocabulary. */
export const saveWord = (client: ApiClient, entryId: string, on: boolean): Promise<ApiResult<unknown>> =>
  on ? client.put(`/dictionary/entries/${entryId}/save`) : client.delete(`/dictionary/entries/${entryId}/save`);

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
  length?: StoryDetail['length'];
  level?: StoryLevel;
  questionCount: QuestionCount;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
  access: GameAccess;
  /** solo: straight to the first question, the story having just been read */
  skipReading?: boolean;
  extraTime?: boolean;
  /** duo and group: the host's Rated/Friendly choice (Game Ranks); left out, the host's last choice */
  rated?: boolean;
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
