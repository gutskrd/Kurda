/**
 * Escapes text for a LIKE or ILIKE pattern so it matches only itself: `%` and `_` are wildcards and `\` is the
 * escape character, and usernames are full of underscores. The result is still passed as a bound parameter.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
