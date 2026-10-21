/**
 * Text made safe to put inside a LIKE or ILIKE pattern, so that it matches
 * itself and nothing else.
 *
 * `%` and `_` are wildcards and `\` is Postgres's default escape character.
 * Left as typed, a search for `%` matches every row and one for `a_b` also
 * finds `axb` (usernames are full of underscores). The result still travels as
 * a bound parameter: this is about what the pattern means, not about getting
 * into the SQL, which a parameter never does.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
