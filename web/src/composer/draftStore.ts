import { isEmptyDraft, parsePostDraft, postDraftStorageKey, type PostDraft } from '@kurda/shared';

/**
 * The composer's draft in this browser, one per user id so a shared computer keeps them apart, in the shared shape
 * (`@kurda/shared` post-composer). Every storage access is guarded, so a failure only means no draft. The server
 * deletes unused uploads after a day, so a draft's pictures are kept for less and older ones are dropped on restore.
 */
export const DRAFT_PICTURE_KEEP_MS = 20 * 60 * 60 * 1000;

interface RestoredDraft {
  draft: PostDraft;
  /** How many pictures were too old to keep. */
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
  // Only uploaded pictures survive a reload; an object URL does not.
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
    // Full or blocked: the post is still on screen, just not kept.
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(postDraftStorageKey(userId));
  } catch {
    // Nothing to clear in unreachable storage.
  }
}
