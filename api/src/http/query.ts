import { z } from 'zod';

/**
 * Query-string fields for the public lists (the wall, the library, comments).
 *
 * These were read raw and handed to SQL, so `?limit=abc`, `?authorId=nope` or
 * a repeated key became a database error — a 500 anyone could produce without
 * an account, each one logged as a server fault. Checked here instead, they
 * are a 400. An empty value still means "not given", as it did.
 */
const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);

/** An optional whole number between `min` and `max`. */
export function queryInt(min: number, max: number) {
  return z.preprocess(absentIfEmpty, z.coerce.number().int().min(min).max(max).optional());
}

/** An optional id. */
export const queryUuid = z.preprocess(absentIfEmpty, z.uuid().optional());

/** An optional short word (a sort, a type, a language): one value, not a list. */
export const queryWord = z.string().max(40).optional();

/**
 * Page size and position. The services still cap the size at what they serve
 * (100); larger is accepted and capped, as before, rather than refused.
 */
export const pageQuery = {
  limit: queryInt(1, 1_000),
  offset: queryInt(0, 1_000_000),
};
