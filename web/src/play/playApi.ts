/**
 * Playing with friends, the same way for every online game (contract §B):
 * what a game is called, where its lobby is, and how an invite's settings
 * read in a line. The shapes are @kurda/shared's `play` ones.
 */
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

/** A game's name, as the catalogue says it (the invite cards' own map). */
export const GAME_NAME_KEY: Record<PlayGame, MessageKey> = INVITE_NAME_KEY;

/**
 * Where someone already in a game goes to play it. A story game has a page
 * of its own; the battle and the match live at their invite address.
 */
export function lobbyPath(game: PlayGame, lobbyId: string): string {
  return game === 'stories' ? gamePath(lobbyId) : invitePath({ type: game, id: lobbyId });
}

/**
 * Where someone not in a game yet goes to get in: the invite link's own
 * address — the lobby of a battle or a match, with its Join; a story game's
 * link joins on arrival.
 */
export function joinPath(game: PlayGame, lobbyId: string): string {
  return invitePath({ type: game, id: lobbyId });
}

/** Each game's own join, so a card or "Join next round" gets you in with one tap. */
const JOIN: Record<PlayGame, (lobbyId: string) => { path: string; body?: unknown }> = {
  'wordle-battle': (id) => ({ path: `/wordle/battles/${encodeURIComponent(id)}/join` }),
  'rhyme-match': (id) => ({ path: `/rhyme/matches/${encodeURIComponent(id)}/join` }),
  // a story game takes your remembered Extra time with you
  stories: (id) => ({ path: '/story-games/join', body: { id, extraTime: rememberedExtraTime() } }),
};

/**
 * Joins a lobby through its game's own route (the join rule is checked there,
 * as for a link). Already being in it is not a failure: the answer is the same
 * lobby either way.
 */
export async function joinLobby(client: ApiClient, game: PlayGame, lobbyId: string): Promise<ApiResult<null>> {
  const { path, body } = JOIN[game](lobbyId);
  const res = await client.post<unknown>(path, body);
  if (res.ok || res.error.code === 'ALREADY_JOINED') return { ok: true, data: null };
  return res;
}

/** The refusals playing with friends can meet, in the reader's words. */
const PLAY_ERROR_KEY: Record<string, MessageKey> = {
  // one answer for every game nobody may see, as the server gives it
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
  NOT_A_MEMBER: 'play.error.notMember',
  // CHAT_MUTED and MUTED are said by describeError (reports/restriction.ts), with the time
  NOT_FRIENDS: 'chat.error.notFriends',
};

export function playError(error: ApiError, t: Translate): string {
  // No such route is not "no such game": the API this app talks to is older
  // than playing with friends (a build whose API has not been deployed yet).
  // Read like any NOT_FOUND it told the host making a game "This game isn't
  // available", which was true of nothing they could act on.
  if (isMissingRoute(error)) return t('play.error.notOnServer');
  const key = error.code ? PLAY_ERROR_KEY[error.code] : undefined;
  // a story game's own refusals (no story of that length, too many games) next
  return key ? t(key) : storyError(error, t);
}

/** One part of an invite's description, with the language it is in when it is a story's own words. */
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

/** Recently asked friends, remembered on this device for the picker's "Recent". */
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
    // a device that will not remember just has no "Recent"
  }
}
