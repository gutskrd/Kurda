import { z } from 'zod';
import { lowerUuid } from './ids.js';

/**
 * Query-string fields for the public lists (the wall, the library, comments), checked so a malformed or repeated
 * value is a 400 rather than a database error. An empty value means "not given".
 */
const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);

/** An optional whole number between `min` and `max`. */
export function queryInt(min: number, max: number) {
  return z.preprocess(absentIfEmpty, z.coerce.number().int().min(min).max(max).optional());
}

/** An optional id. */
export const queryUuid = z.preprocess(absentIfEmpty, lowerUuid().optional());

/** An optional short word (a sort, a type, a language): one value, not a list. */
export const queryWord = z.string().max(40).optional();

/** The deepest a public list pages: far past any scroll, and short of a scan that walks the whole table. */
export const MAX_OFFSET = 10_000;

/** Page size and position. Larger sizes are accepted and capped by the services at what they serve (100). */
export const pageQuery = {
  limit: queryInt(1, 1_000),
  offset: queryInt(0, MAX_OFFSET),
};
