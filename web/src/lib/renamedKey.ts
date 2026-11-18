/**
 * Reads a storage key that was renamed: on a miss under the new name, the old key's value moves across and the old key
 * is deleted, so the rename signs nobody out or forgets their language. Writes go only to the new name.
 */
export function readRenamed(store: Storage, key: string, legacyKey: string): string | null {
  try {
    const current = store.getItem(key);
    if (current !== null) return current;

    const legacy = store.getItem(legacyKey);
    if (legacy === null) return null;

    // Moved on the first read after the rename, then never again.
    store.setItem(key, legacy);
    store.removeItem(legacyKey);
    return legacy;
  } catch {
    // A private window or blocked storage; the caller's fallback applies.
    return null;
  }
}
