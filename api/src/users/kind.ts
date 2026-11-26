/**
 * The two kinds of account: a person's own, and a child's profile made by their parent (family/). A child, like a
 * guest, is nobody's to find, write to or look up, so the lists of people read both through one test.
 */
import type pg from 'pg';

/** SQL: the user behind `alias` is kept from everyone else's sight, as a guest or a child's profile. `alias` is always a literal from this codebase. */
export function unseenByOthersSql(alias: string): string {
  return `(${alias}.guest OR ${alias}.kind = 'child')`;
}

/** SQL: the user behind `alias` is a child's profile. */
export function childSql(alias: string): string {
  return `(${alias}.kind = 'child')`;
}

/** Which of these accounts are children's profiles. */
export async function childrenAmong(db: Pick<pg.Pool, 'query'>, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const res = await db.query<{ id: string }>(`SELECT u.id FROM users u WHERE u.id = ANY($1::uuid[]) AND ${childSql('u')}`, [[...ids]]);
  return new Set(res.rows.map((r) => r.id));
}
