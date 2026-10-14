import { isEmptyDraft, parsePostDraft, postDraftStorageKey, type PostDraft } from '@kurda/shared';

/**
 * The composer's draft, kept in this browser.
 *
 * One per person (the key carries the user id, so a shared computer does not
 * hand one person's half-written post to the next), in the shape both apps use
 * (`@kurda/shared` post-composer). Storage can be full, blocked, or wiped by a
 * private window, so every read and write is guarded and a failure only means
 * there is no draft — never a composer that will not open.
 *
 * Pictures are uploaded as soon as they are added, and an upload no post uses
 * is cleared away by the server after a day. A draft's pictures are kept for
 * less than that; older ones are dropped on the way back in, and the composer
 * says so, rather than offering a picture the server no longer has.
 */
export const DRAFT_PICTURE_KEEP_MS = 20 * 60 * 60 * 1000;

export interface RestoredDraft {
  draft: PostDraft;
  /** pictures that were too old to keep */
  droppedPictures: number;
}

export function loadDraft(userId: string, now: number = Date.now()): RestoredDraft | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(postDraftStorageKey(userId));
  } catch {
    return null;
  }
  const draft = raw ? parsePostDraft(raw) : null;
  if (!draft) return null;
  // only uploaded pictures survive a reload: a browser's object URL does not
  const fresh = now - draft.savedAt < DRAFT_PICTURE_KEEP_MS;
  const pictures = fresh ? draft.pictures.filter((p) => p.mediaKey && p.localUri) : [];
  const restored: PostDraft = { ...draft, pictures, meme: draft.meme && pictures.length > 0 };
  if (isEmptyDraft(restored)) return null;
  return { draft: restored, droppedPictures: draft.pictures.length - pictures.length };
}

export function saveDraft(userId: string, draft: PostDraft): void {
  try {
    if (isEmptyDraft(draft)) localStorage.removeItem(postDraftStorageKey(userId));
    else localStorage.setItem(postDraftStorageKey(userId), JSON.stringify(draft));
  } catch {
    // full or blocked: the post is still on screen, only not kept
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(postDraftStorageKey(userId));
  } catch {
    // nothing to clear in a storage we cannot reach
  }
}
