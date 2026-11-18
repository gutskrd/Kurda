/** Playing with friends across every online game: names, lobby paths, joining and invite summaries (shared `play` shapes). */
import {
  invitePath,
  isMissingRoute,
  storyTextDirection,
  isStoryDialect,
  type InviteSummary,
  type PlayGame,
  type StoryLength,
} from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { ApiClient } from '../lib/api';
import type { ApiError, ApiResult } from '../lib/types';
import { INVITE_NAME_KEY } from '../lib/gameInvites';
import { dialectName } from '../learn/map';
import { gamePath, storyError } from '../stories/api';
import { rememberedExtraTime } from '../stories/prefs';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A game's name as a catalogue key. */
export const GAME_NAME_KEY: Record<PlayGame, MessageKey> = INVITE_NAME_KEY;

/** Where a member of a game goes to play it: a story game's own page, or the battle's and match's invite address. */
export function lobbyPath(game: PlayGame, lobbyId: string): string {
  return game === 'stories' ? gamePath(lobbyId) : invitePath({ type: game, id: lobbyId });
}

/** Where someone not yet in a game goes to get in: its invite address (a story game's link joins on arrival). */
export function joinPath(game: PlayGame, lobbyId: string): string {
  return invitePath({ type: game, id: lobbyId });
}

/** Each game's own join route, so a card or "Join next round" joins in one tap. */
const JOIN: Record<PlayGame, (lobbyId: string) => { path: string; body?: unknown }> = {
  'wordle-battle': (id) => ({ path: `/wordle/battles/${encodeURIComponent(id)}/join` }),
  'rhyme-match': (id) => ({ path: `/rhyme/matches/${encodeURIComponent(id)}/join` }),
  // A story game takes your remembered Extra time with you.
  stories: (id) => ({ path: '/story-games/join', body: { id, extraTime: rememberedExtraTime() } }),
  // Every multiplayer learning game joins through the engine's one route.
  'last-letter': (id) => ({ path: `/mp/last-letter/${encodeURIComponent(id)}/join` }),
  impostor: (id) => ({ path: `/mp/impostor/${encodeURIComponent(id)}/join` }),
  'who-am-i': (id) => ({ path: `/mp/who-am-i/${encodeURIComponent(id)}/join` }),
};

/** Joins a lobby through its game's own route; already being in it is not a failure. */
export async function joinLobby(client: ApiClient, game: PlayGame, lobbyId: string): Promise<ApiResult<null>> {
  const { path, body } = JOIN[game](lobbyId);
  const res = await client.post<unknown>(path, body);
  if (res.ok || res.error.code === 'ALREADY_JOINED') return { ok: true, data: null };
  return res;
}

/** Refusals when playing with friends, in the reader's words. */
const PLAY_ERROR_KEY: Record<string, MessageKey> = {
  // One answer for every game nobody may see, as the server gives it.
  GAME_NOT_FOUND: 'stories.error.notFound',
  NOT_FOUND: 'stories.error.notFound',
  INVITE_NOT_FOUND: 'stories.error.notFound',
  GAME_UNAVAILABLE: 'stories.error.notFound',
  INVITE_CLOSED: 'play.error.inviteClosed',
  GAME_STARTED: 'stories.error.started',
  NOT_OPEN: 'stories.error.started',
  GAME_FULL: 'stories.error.full',
  BATTLE_FULL: 'stories.error.full',
  MATCH_FULL: 'stories.error.full',
  EMPTY_POOL: 'games.emptyPool',
  EMPTY_LEXICON: 'games.emptyPool',
  OPEN_GAMES_ADULTS_ONLY: 'stories.error.openNotAllowed',
  NOT_HOST: 'play.error.notHost',
  CANNOT_START: 'play.teams.uneven',
  NOT_A_MEMBER: 'play.error.notMember',
  // CHAT_MUTED and MUTED are worded by describeError (reports/restriction.ts), with the time.
  NOT_FRIENDS: 'chat.error.notFriends',
  // Every choice is a chip the page offers, so a refusal means the server runs other rules than the page (deploys
  // land at different times).
  BAD_SETTINGS: 'play.error.serverBehind',
};

export function playError(error: ApiError, t: Translate): string {
  // A missing route means the API predates playing with friends, not that the game is unavailable.
  if (isMissingRoute(error)) return t('play.error.notOnServer');
  const key = error.code ? PLAY_ERROR_KEY[error.code] : undefined;
  // Then a story game's own refusals (no story of that length, too many games).
  return key ? t(key) : storyError(error, t);
}

/** One part of an invite's description, with its language when it is a story's own words. */
export interface SummaryPart {
  text: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}

const DIFFICULTY_KEY: Record<string, MessageKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

const LENGTH_KEY: Record<StoryLength, MessageKey> = {
  short: 'stories.length.short',
  medium: 'stories.length.medium',
  long: 'stories.length.long',
  // A legend told in chapters.
  saga: 'stories.length.saga',
};

/** "Hard", "Kurmancî", or "Qelema Şîn · 5 questions": what an invite is for, beyond the game. */
export function summaryParts(game: PlayGame, summary: InviteSummary, t: Translate): SummaryPart[] {
  const parts: SummaryPart[] = [];
  if (game === 'wordle-battle' && summary.difficulty && DIFFICULTY_KEY[summary.difficulty]) {
    parts.push({ text: t(DIFFICULTY_KEY[summary.difficulty]!) });
  }
  if (game === 'rhyme-match' && summary.dialect) parts.push({ text: dialectName(summary.dialect) });
  if (game === 'stories') {
    if (summary.storyTitle) {
      const dir = isStoryDialect(summary.dialect) ? storyTextDirection(summary.dialect) : null;
      parts.push({ text: summary.storyTitle, lang: dir?.lang, dir: dir?.dir });
    } else if (summary.length && summary.length in LENGTH_KEY) {
      parts.push({ text: t(LENGTH_KEY[summary.length as StoryLength]) });
    }
    if (summary.questionCount) parts.push({ text: t('stories.setup.questionCount', { count: summary.questionCount }) });
  }
  return parts;
}

/** Friends asked recently, remembered on this device for the picker's "Recent". */
const RECENT_KEY = 'hevalo.play.recent';
const RECENT_MAX = 8;

export function recentFriends(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberFriends(ids: readonly string[]): void {
  try {
    const next = [...ids, ...recentFriends().filter((id) => !ids.includes(id))].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A device that will not remember just has no "Recent".
  }
}
