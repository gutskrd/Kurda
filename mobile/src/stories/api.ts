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
  type StoryCategory,
  type StoryQuery,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { joined } from '../play/joining';

/**
 * Stories over the API (contract §A3/§A4, and the library of §C), using @kurda/shared's shapes. Reading needs no
 * account; bookmarks and reading positions need a session (a guest's counts); every game route needs an account,
 * and a non-member gets the same 404 as for a missing game.
 */

/** One variety's library front page: editors' picks, newest, categories and counts, and the caller's own shelves and tally. */
export const getLibrary = (client: ApiClient, dialect: StoryDialect): Promise<ApiResult<StoryLibrary>> =>
  client.get(`/stories/library?dialect=${dialect}`);

/** The paginated list, filtered: what the library's search and chips read. */
export const searchStories = (client: ApiClient, query: StoryQuery): Promise<ApiResult<{ stories: StoryListItem[]; total: number }>> =>
  client.get(`/stories${storyQueryString(query)}`);

interface StoryFilter {
  dialect?: StoryDialect;
  level?: StoryLevel;
}

/** One variety's stories for a game's setup; a variety has far fewer than a page. */
export function listStories(client: ApiClient, filter: StoryFilter = {}): Promise<ApiResult<{ stories: StoryListItem[]; total: number }>> {
  return searchStories(client, { dialect: filter.dialect, level: filter.level, limit: 50 });
}

export const getStory = (client: ApiClient, slugOrId: string): Promise<ApiResult<StoryDetail>> =>
  client.get(`/stories/${encodeURIComponent(slugOrId)}`);

/** Every category by name, for a story that carries only its category's slug. */
export const getCategories = (client: ApiClient): Promise<ApiResult<{ categories: StoryCategory[] }>> => client.get('/stories/categories');

/** On or off the caller's shelf. */
export const setBookmark = (client: ApiClient, id: string, on: boolean): Promise<ApiResult<{ bookmarked: boolean }>> =>
  on ? client.put(`/stories/${encodeURIComponent(id)}/bookmark`) : client.delete(`/stories/${encodeURIComponent(id)}/bookmark`);

export interface ProgressInput {
  /** The paragraph being read, 0-based. */
  paragraph: number;
  /** How far through the text, 0–1. */
  share: number;
  /** The last paragraph was reached; the server records the first time for good. */
  finished?: boolean;
}

/** Saves the caller's place in a story; the server keeps the latest and returns what it knows of them on it. */
export const saveProgress = (client: ApiClient, id: string, input: ProgressInput): Promise<ApiResult<{ me: StoryMe }>> =>
  client.put(`/stories/${encodeURIComponent(id)}/progress`, input);

/** Saves a glossary word that is a dictionary headword to the caller's vocabulary, or removes it. */
export const saveWord = (client: ApiClient, entryId: string, on: boolean): Promise<ApiResult<unknown>> =>
  on ? client.put(`/dictionary/entries/${encodeURIComponent(entryId)}/save`) : client.delete(`/dictionary/entries/${encodeURIComponent(entryId)}/save`);

/** The words already in the reader's vocabulary, so Save can show Saved. */
export const savedWords = (client: ApiClient): Promise<ApiResult<{ words: { entryId: string }[] }>> => client.get('/me/saved-words');

export const activeGames = (client: ApiClient): Promise<ApiResult<{ games: StoryGameSummary[] }>> =>
  client.get('/story-games/active');

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
  /** Solo: straight to the first question, the story having just been read. */
  skipReading?: boolean;
  extraTime?: boolean;
  /** Duo and group: the host's Rated/Friendly choice (Game Ranks); omitted, the host's last choice. */
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
 * The view; with `since`, a long-poll answering when the game passes that version or after about 20 s. An empty
 * object means the server stopped waiting because it was shutting down.
 */
export const getGame = (client: ApiClient, id: string, since?: number): Promise<ApiResult<StoryGameView | Record<string, never>>> =>
  // An invite accepted a moment ago must land first; until then this is nobody's game (play/joining.ts).
  joined(id).then(() => client.get(`/story-games/${encodeURIComponent(id)}${since !== undefined ? `?v=${since}` : ''}`));

export const getGameStory = (client: ApiClient, id: string): Promise<ApiResult<StoryDetail>> =>
  client.get(`/story-games/${encodeURIComponent(id)}/story`);

interface SettingsPatch {
  storyId?: string;
  questionCount?: QuestionCount;
  timerSeconds?: TimerSeconds;
  textDuring?: TextDuring;
  access?: GameAccess;
}

export const updateSettings = (client: ApiClient, id: string, patch: SettingsPatch): Promise<ApiResult<StoryGameView>> =>
  client.patch(`/story-games/${encodeURIComponent(id)}/settings`, patch);

export const startGame = (client: ApiClient, id: string): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/start`);

export const doneReading = (client: ApiClient, id: string): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/done-reading`);

export const answerQuestion = (client: ApiClient, id: string, index: number, choice: number): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/answers`, { index, choice });

export const continueAfter = (client: ApiClient, id: string, index: number): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/continue`, { index });

export const advanceGame = (
  client: ApiClient,
  id: string,
  from: { status: StoryGameView['status']; index: number },
): Promise<ApiResult<StoryGameView>> => client.post(`/story-games/${encodeURIComponent(id)}/advance`, { from });

export const leaveGame = (client: ApiClient, id: string): Promise<ApiResult<{ ok: true }>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/leave`);

export const removePlayer = (client: ApiClient, id: string, seat: number): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/remove`, { seat });

export const setExtraTime = (client: ApiClient, id: string, on: boolean): Promise<ApiResult<StoryGameView>> =>
  client.post(`/story-games/${encodeURIComponent(id)}/extra-time`, { on });
