import type { ApiResult } from './types';

/**
 * The last answer to each GET this tab has made, so a screen seen before draws at once and refreshes behind that
 * (lib/useApi.ts, Home's wall, Messages' list).
 *
 * The memory belongs to one person at a time (the account id, or `GUEST`) and every call says who is asking; a
 * different person empties it first, so one account's data never reaches another. Sign-in, sign-out and finishing a
 * lesson empty it too (auth/AuthProvider.tsx). Anything that must never be shown late (game state, lobbies, lessons,
 * reports, account standing) passes `fresh` to `useApiGet` and bypasses this. Concurrent asks share one request.
 */

/** A visitor's answers: what anybody may read without an account. */
export const GUEST = 'guest';

/** How long an answer counts as this page load's own, so another part of the page asking the same does not ask again. */
const JUST_ANSWERED_MS = 2000;

interface Answer {
  data: unknown;
  /** The answer as text, so an identical answer keeps the object a screen already holds. */
  text: string;
  at: number;
}

/** What `ask` and `lastAnswer` need of the API client: its GET. */
interface Asker {
  get<T>(path: string): Promise<ApiResult<T>>;
}

let owner: string | null = null;
/** Bumped each time the memory is emptied, so a request begun before never writes into what came after. */
let epoch = 0;
const answers = new Map<string, Answer>();
const asking = new Map<string, Promise<ApiResult<unknown>>>();

/** Drops everything: at sign-out, at sign-in, and after a lesson changes most of what is held. */
export function forgetAnswers(): void {
  epoch += 1;
  answers.clear();
  asking.clear();
}

/** Makes the memory `who`'s, dropping anybody else's answers first. */
function belongsTo(who: string): void {
  if (owner === who) return;
  forgetAnswers();
  owner = who;
}

/** The last answer `who` was given to `path`, if this tab has one. */
export function lastAnswer<T>(who: string, path: string): { data: T; at: number } | null {
  belongsTo(who);
  const held = answers.get(path);
  return held ? { data: held.data as T, at: held.at } : null;
}

/** Whether that answer is so recent that asking again would only repeat the question. */
export function justAnswered(who: string, path: string): boolean {
  const held = lastAnswer(who, path);
  return held !== null && Date.now() - held.at < JUST_ANSWERED_MS;
}

/** Keeps an answer fetched some other way. An identical answer keeps the held object, so identity checks see no change. */
export function remember<T>(who: string, path: string, data: T): T {
  belongsTo(who);
  const text = JSON.stringify(data);
  const held = answers.get(path);
  if (held && held.text === text) {
    held.at = Date.now();
    return held.data as T;
  }
  answers.set(path, { data, text, at: Date.now() });
  return data;
}

/**
 * GETs `path` once however many screens ask at the same moment, and keeps the answer. A refusal of the question (not
 * found, not allowed) drops what was held, so a removed post stops showing; a network or server failure keeps it.
 */
export function ask<T>(client: Asker, who: string, path: string): Promise<ApiResult<T>> {
  belongsTo(who);
  const running = asking.get(path);
  if (running) return running as Promise<ApiResult<T>>;
  const began = epoch;
  const request = client.get<T>(path).then((res): ApiResult<T> => {
    // The memory was emptied, or changed hands, while this was in flight.
    if (began !== epoch) return res;
    asking.delete(path);
    if (res.ok) return { ok: true, data: remember(who, path, res.data) };
    if (res.error.kind === 'client' || res.error.kind === 'unauthorized') answers.delete(path);
    return res;
  });
  asking.set(path, request as Promise<ApiResult<unknown>>);
  return request;
}
