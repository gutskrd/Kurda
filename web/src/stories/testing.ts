/**
 * Fixtures and a fake API for the Stories and play tests. Not shipped: only
 * test files import it.
 */
import { vi } from 'vitest';
import type { StoryDetail, StoryGameView, StoryListItem } from '@kurda/shared';
import { jsonResponse } from '../test/utils';

export function listItem(over: Partial<StoryListItem> = {}): StoryListItem {
  return {
    id: 'st-1',
    slug: 'qelema-sin',
    title: 'Qelema Şîn',
    summary: 'Rojîn li dibistana nû ye.',
    dialect: 'kurmanci',
    level: 1,
    length: 'short',
    wordCount: 90,
    readingMinutes: 2,
    fullyNarrated: false,
    ...over,
  };
}

export function detail(over: Partial<StoryDetail> = {}): StoryDetail {
  return {
    ...listItem(),
    paragraphs: ['Îro Rojîn diçe dibistanê. Ew deh salî ye.', 'Şîlan hevala wê ye. Şîlan dibişire.'],
    glossary: [{ term: 'dibistanê', meanings: { en: 'to school', de: 'zur Schule' } }],
    audio: {},
    ...over,
  };
}

export function gameView(over: Partial<StoryGameView> = {}): StoryGameView {
  return {
    id: 'g-1',
    code: 'ABC234',
    mode: 'duo',
    status: 'lobby',
    version: 1,
    serverNow: new Date().toISOString(),
    phaseEndsAt: null,
    readingSoftCapAt: null,
    readingHardCapAt: null,
    settings: {
      storyId: 'st-1',
      storyTitle: 'Qelema Şîn',
      storySlug: 'qelema-sin',
      dialect: 'kurmanci',
      level: 1,
      length: 'short',
      questionCount: 3,
      timerSeconds: 60,
      textDuring: 'visible',
      access: 'friends',
    },
    isHost: true,
    extraTime: false,
    players: [
      { seat: 1, name: 'Ada', avatarUrl: null, isHost: true, isMe: true, away: false, gone: false, score: 0, correct: 0 },
    ],
    activeCount: 1,
    readingDoneCount: 0,
    answeredCount: 0,
    continuedCount: 0,
    meDoneReading: false,
    meContinued: false,
    question: null,
    reveal: null,
    results: null,
    nextGameId: null,
    ...over,
  };
}

/** One recorded request: method, path (with query), and its JSON body. */
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Answer = unknown | Response | ((call: Call) => unknown | Response);

/**
 * A fetch that answers by "METHOD /path" (the longest matching prefix wins),
 * records every call, and is signed in as `me` unless told otherwise.
 */
export function fakeApi(routes: Record<string, Answer>, opts: { signedIn?: boolean } = {}): { calls: Call[] } {
  const signedIn = opts.signedIn ?? true;
  if (signedIn) localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const calls: Call[] = [];
  const all: Record<string, Answer> = {
    'GET /me': { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } },
    ...routes,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const call: Call = {
        method: init?.method ?? 'GET',
        path: `${u.pathname}${u.search}`,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const key = `${call.method} ${call.path}`;
      // "GET /stories" answers "GET /stories?dialect=…" too; "GET /x/*" answers anything under /x/
      const matches = (k: string): boolean =>
        k.endsWith('*') ? key.startsWith(k.slice(0, -1)) : key === k || key.startsWith(`${k}?`);
      const match = Object.keys(all)
        .filter(matches)
        .sort((a, b) => b.length - a.length)[0];
      if (!match) return jsonResponse(200, {});
      const answer = all[match];
      const value = typeof answer === 'function' ? (answer as (c: Call) => unknown)(call) : answer;
      return value instanceof Response ? value : jsonResponse(200, value);
    }),
  );
  return { calls };
}

export const notFound = (): Response => jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
export const refused = (status: number, code: string): Response => jsonResponse(status, { code, message: code });
