import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPostDraft, postDraftStorageKey } from '@kurda/shared';
import { DRAFT_PICTURE_KEEP_MS, clearDraft, loadDraft, saveDraft } from './draftStore';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const picture = { mediaKey: 'image-post/a.webp', localUri: 'https://cdn.test/a.webp', altText: 'Snow', ownWork: true };

describe('the draft on this device', () => {
  it('keeps one draft per person, and brings it back', () => {
    const now = 1_800_000_000_000;
    saveDraft('u1', { ...emptyPostDraft(now), body: 'Mine', pictures: [picture], meme: true });
    saveDraft('u2', { ...emptyPostDraft(now), body: 'Theirs' });
    expect(loadDraft('u1', now + 1000)).toEqual({
      draft: { ...emptyPostDraft(now), body: 'Mine', pictures: [picture], meme: true },
      droppedPictures: 0,
    });
    expect(loadDraft('u2', now)?.draft.body).toBe('Theirs');
  });

  it('drops pictures the server will have cleared away, and says how many', () => {
    const now = 1_800_000_000_000;
    saveDraft('u1', { ...emptyPostDraft(now), body: 'Old', pictures: [picture], meme: true });
    const back = loadDraft('u1', now + DRAFT_PICTURE_KEEP_MS + 1)!;
    expect(back.draft.pictures).toEqual([]);
    // a meme is a post with pictures; without them it is not one
    expect(back.draft.meme).toBe(false);
    expect(back.droppedPictures).toBe(1);
  });

  it('keeps nothing for an empty draft, and nothing after it is cleared', () => {
    saveDraft('u1', { ...emptyPostDraft(), body: 'x' });
    saveDraft('u1', emptyPostDraft());
    expect(localStorage.getItem(postDraftStorageKey('u1'))).toBeNull();
    saveDraft('u1', { ...emptyPostDraft(), body: 'y' });
    clearDraft('u1');
    expect(loadDraft('u1')).toBeNull();
  });

  it('never throws when storage is blocked or holds nonsense', () => {
    localStorage.setItem(postDraftStorageKey('u1'), '{not json');
    expect(loadDraft('u1')).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadDraft('u1')).toBeNull();
    expect(() => saveDraft('u1', { ...emptyPostDraft(), body: 'z' })).not.toThrow();
  });
});
