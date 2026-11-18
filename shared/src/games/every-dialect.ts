/**
 * Reads asked once for both varieties: the games' availability and the one-phone games' offers, without a `dialect`, are
 * answered `{ dialects: [...] }` in GAME_DIALECTS order. An API from before that form refuses the bare path, and is asked
 * once per variety instead.
 */
import { GAME_DIALECTS, type GameDialect } from './dialect.js';

type Answer<T, E> = { ok: true; data: T } | { ok: false; error: E };

/** What these reads need of an app's API client. */
export interface DialectsClient<E> {
  get<T>(path: string): Promise<Answer<T, E>>;
}

/** An answer for both varieties at once. */
export interface EveryDialect<T> {
  dialects: T[];
}

/** `path` read for both varieties in one request, each variety's answer in GAME_DIALECTS order. */
export async function readEveryDialect<T extends { dialect: GameDialect }, E extends { code?: string }>(
  client: DialectsClient<E>,
  path: string,
): Promise<Answer<T[], E>> {
  const both = await client.get<EveryDialect<T>>(path);
  if (both.ok) return { ok: true, data: both.data.dialects ?? [] };
  if (both.error.code !== 'VALIDATION_ERROR') return both;
  const each = await Promise.all(GAME_DIALECTS.map((d) => client.get<T>(`${path}?dialect=${d}`)));
  const failed = each.find((r) => !r.ok);
  return failed && !failed.ok ? failed : { ok: true, data: each.flatMap((r) => (r.ok ? [r.data] : [])) };
}
