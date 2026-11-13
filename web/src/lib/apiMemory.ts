import type { ApiResult } from './types';

/**
 * The last answer to each question the app has asked, kept while the tab is
 * open, so a screen that has been seen before is drawn at once from what it
 * showed last time and brought up to date behind that (lib/useApi.ts, Home's
 * wall, Messages' list). Going Home, to Learn and back again used to start
 * every screen from nothing and a skeleton, each time.
 *
 * Whose answers these are matters more than having them. The memory belongs
 * to one person at a time — the signed-in account's id, or `GUEST` for a
 * visitor — and every read and write says who is asking: the moment that is
 * somebody else, everything held is dropped before anything is handed over,
 * so nothing one account loaded is ever shown to another. Signing out, and
 * signing in, empty it as well (auth/AuthProvider.tsx), and so does finishing
 * a lesson, after which nearly every number about the learner has moved.
 *
 * Only what was asked with a GET is ever here, and only what a screen may
 * show a moment late. A game's state, a lobby, a lesson in progress, a
 * report and where an account stands are asked afresh every time: their
 * callers pass `fresh` to `useApiGet` and never come through here.
 *
 * Two screens asking the same thing at the same moment share one request,
 * and an answer that arrived a moment ago is not asked for again by the next
 * part of the same page (`JUST_ANSWERED_MS`).
 */

/** A visitor's answers: what anybody may read without an account. */
export const GUEST = 'guest';

/**
 * How long an answer counts as the page's own: a part of the page drawn just
 * after another part asked the same question takes its answer and does not
 * ask again. Short on purpose — it is one page loading, not a cache's age.
 */
export const JUST_ANSWERED_MS = 2000;

interface Answer {
  data: unknown;
  /** the answer as text, so the same answer arriving again keeps the object a screen already holds */
  text: string;
  at: number;
}

/** What `ask` and `lastAnswer` need of the API client: its GET. */
interface Asker {
  get<T>(path: string): Promise<ApiResult<T>>;
}

let owner: string | null = null;
/** counted up each time the memory is emptied, so a request begun before that never writes into what came after */
let epoch = 0;
const answers = new Map<string, Answer>();
const asking = new Map<string, Promise<ApiResult<unknown>>>();

/** Everything held is dropped: at sign-out, at sign-in, and when a lesson has just changed what most of it says. */
export function forgetAnswers(): void {
  epoch += 1;
  answers.clear();
  asking.clear();
}

/** The memory is `who`'s from here on; anybody else's answers go first. */
function belongsTo(who: string): void {
  if (owner === who) return;
  forgetAnswers();
  owner = who;
}

/** One question's answer is dropped: it was refused, or what it said is known to be out of date. */
export function forgetAnswer(who: string, path: string): void {
  belongsTo(who);
  answers.delete(path);
}

/** The last answer `who` was given to `path`, if this tab has one. */
export function lastAnswer<T>(who: string, path: string): { data: T; at: number } | null {
  belongsTo(who);
  const held = answers.get(path);
  return held ? { data: held.data as T, at: held.at } : null;
}

/** Whether that answer arrived so recently that asking again would only ask the same thing twice. */
export function justAnswered(who: string, path: string): boolean {
  const held = lastAnswer(who, path);
  return held !== null && Date.now() - held.at < JUST_ANSWERED_MS;
}

/**
 * Keep an answer that was fetched some other way (a list a page loads for
 * itself). The same answer again keeps the object already held, so a screen
 * comparing by identity sees that nothing changed.
 */
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
 * GET `path` for `who`, once however many screens ask at the same moment,
 * and keep what comes back. A refusal that is about the question itself (not
 * found, not allowed) drops what was held for it: a post that has been taken
 * down must not go on being shown from memory. A failure of the network or
 * the server leaves the last answer where it is.
 */
export function ask<T>(client: Asker, who: string, path: string): Promise<ApiResult<T>> {
  belongsTo(who);
  const running = asking.get(path);
  if (running) return running as Promise<ApiResult<T>>;
  const began = epoch;
  const request = client.get<T>(path).then((res): ApiResult<T> => {
    // the memory was emptied, or became somebody else's, while this was on its way
    if (began !== epoch) return res;
    asking.delete(path);
    if (res.ok) return { ok: true, data: remember(who, path, res.data) };
    if (res.error.kind === 'client' || res.error.kind === 'unauthorized') answers.delete(path);
    return res;
  });
  asking.set(path, request as Promise<ApiResult<unknown>>);
  return request;
}
