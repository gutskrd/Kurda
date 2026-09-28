/**
 * Reading a browser key that used to be called something else.
 *
 * The app was MyKurda and its three browser keys said so: `mykurda_tokens`,
 * `mykurda_locale`, `mykurda_rail_collapsed`. Renaming a key does not move
 * what is inside it, so swapping the string on its own would have signed out
 * everybody who was signed in and forgotten the language everybody had
 * chosen — the whole rebrand landing, for each of them, as "why am I on the
 * English login page".
 *
 * So a read tries the new name, and on a miss looks under the old one, writes
 * what it finds to the new name and deletes the old. The first visit after
 * the rename moves the value across; the second and every one after reads the
 * new key directly and never touches the old.
 *
 * It is deliberately only a read. Writes go to the new name and nowhere else,
 * so the old key cannot come back once it is gone.
 */
export function readRenamed(store: Storage, key: string, legacyKey: string): string | null {
  try {
    const current = store.getItem(key);
    if (current !== null) return current;

    const legacy = store.getItem(legacyKey);
    if (legacy === null) return null;

    // carried over on the first read after the rename, then never again
    store.setItem(key, legacy);
    store.removeItem(legacyKey);
    return legacy;
  } catch {
    // a private window, or storage the browser has blocked; the caller's
    // fallback is the right answer and it is not this function's to pick
    return null;
  }
}
