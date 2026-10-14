import { describe, expect, it } from 'vitest';
import { POST_DRAFT_VERSION, emptyPostDraft, type PostDraft } from '@kurda/shared';
import type { ComposerPost } from './api';
import {
  UPLOAD_KEEP_MS,
  counterFor,
  emptyComposer,
  fromPost,
  fromStoredDraft,
  hasChanges,
  roomForPictures,
  toStoredDraft,
  toUpdateRequest,
  type ComposerPicture,
} from './model';

const pic = (over: Partial<ComposerPicture> = {}): ComposerPicture => ({
  id: 'p1',
  mediaKey: 'images/a.webp',
  localUri: 'file:///a.jpg',
  altText: '',
  ownWork: true,
  status: 'done',
  progress: 1,
  error: null,
  existing: false,
  ...over,
});

const post = (over: Partial<ComposerPost> = {}): ComposerPost => ({
  id: 'post-1',
  authorId: 'me',
  type: 'gotin',
  title: null,
  body: 'Dilê min li vir e',
  status: 'published',
  media: [],
  meme: false,
  sourceCredit: null,
  updatedAt: '2026-10-14T10:00:00.000Z',
  ...over,
});

describe('counterFor', () => {
  it('stays quiet until a tenth of the limit is left, counting as the server does', () => {
    expect(counterFor('a'.repeat(179), 200)).toMatchObject({ show: false });
    expect(counterFor('a'.repeat(180), 200)).toEqual({ show: true, left: 20, over: false });
    // spaces and blank lines at either end are not counted, as on the server
    expect(counterFor(`  ${'a'.repeat(180)}\n\n`, 200).left).toBe(20);
    expect(counterFor('a'.repeat(203), 200)).toEqual({ show: true, left: -3, over: true });
  });
});

describe('drafts kept on the phone', () => {
  it('keeps a picture’s key only once its upload has finished', () => {
    const state = {
      draft: { ...emptyPostDraft(1), body: 'Silav' },
      pictures: [pic(), pic({ id: 'p2', mediaKey: null, status: 'uploading', progress: 0.4, localUri: 'file:///b.jpg' })],
    };
    const stored = toStoredDraft(state, 5);
    expect(stored.savedAt).toBe(5);
    expect(stored.pictures.map((p) => p.mediaKey)).toEqual(['images/a.webp', null]);
    expect(stored.pictures[1]!.localUri).toBe('file:///b.jpg');
  });

  it('forgets a meme with no picture', () => {
    expect(toStoredDraft({ draft: { ...emptyPostDraft(1), body: 'x', meme: true }, pictures: [] }).meme).toBe(false);
  });

  it('brings a draft back with its uploads, and sends again what was not finished', () => {
    const draft: PostDraft = {
      version: POST_DRAFT_VERSION,
      type: 'poem',
      title: 'Bihar',
      body: 'Gul vebûn',
      pictures: [
        { mediaKey: 'images/a.webp', localUri: 'file:///a.jpg', altText: 'gul', ownWork: true },
        { mediaKey: null, localUri: 'file:///b.jpg', altText: '', ownWork: false },
      ],
      meme: false,
      sourceCredit: '',
      savedAt: 1_000,
    };
    const state = fromStoredDraft(draft, 2_000);
    expect(state.draft.title).toBe('Bihar');
    expect(state.pictures.map((p) => [p.status, p.mediaKey, p.ownWork])).toEqual([
      ['done', 'images/a.webp', true],
      ['uploading', null, false],
    ]);
  });

  it('uploads again a picture whose upload the server may already have cleared away, and drops one with no file', () => {
    const draft: PostDraft = {
      ...emptyPostDraft(0),
      pictures: [
        { mediaKey: 'images/a.webp', localUri: 'file:///a.jpg', altText: '', ownWork: true },
        { mediaKey: 'images/b.webp', localUri: null, altText: '', ownWork: true },
      ],
    };
    const state = fromStoredDraft(draft, UPLOAD_KEEP_MS + 1);
    expect(state.pictures).toHaveLength(1);
    expect(state.pictures[0]).toMatchObject({ mediaKey: null, status: 'uploading', localUri: 'file:///a.jpg' });
  });

  it('has room for four pictures', () => {
    expect(roomForPictures(emptyComposer())).toBe(4);
    expect(roomForPictures({ ...emptyComposer(), pictures: [pic(), pic(), pic()] })).toBe(1);
    expect(roomForPictures({ ...emptyComposer(), pictures: [pic(), pic(), pic(), pic()] })).toBe(0);
  });
});

describe('editing a post', () => {
  it('opens a post with its pictures already up', () => {
    const state = fromPost(
      post({
        type: 'story',
        title: 'Çîrok',
        media: [{ mediaKey: 'images/a.webp', url: 'https://cdn/a.webp', altText: 'çiya', width: 800, height: 600 }],
        sourceCredit: 'Bavê min',
      }),
    );
    expect(state.draft).toMatchObject({ type: 'story', title: 'Çîrok', sourceCredit: 'Bavê min' });
    expect(state.pictures[0]).toMatchObject({ mediaKey: 'images/a.webp', localUri: 'https://cdn/a.webp', altText: 'çiya', existing: true, status: 'done' });
  });

  it('sends only what changed', () => {
    const before = post();
    const state = fromPost(before);
    expect(toUpdateRequest(before, state)).toEqual({});
    expect(hasChanges(toUpdateRequest(before, state))).toBe(false);
    state.draft.body = 'Dilê min li wir e';
    expect(toUpdateRequest(before, state)).toEqual({ body: 'Dilê min li wir e' });
  });

  it('turns a gotin into a çîrok when it is given a title, and clears a source', () => {
    const before = post({ sourceCredit: 'Pêşiyan' });
    const state = fromPost(before);
    state.draft.title = 'Navê wê';
    state.draft.sourceCredit = '  ';
    expect(toUpdateRequest(before, state)).toEqual({ type: 'story', title: 'Navê wê', sourceCredit: null });
  });

  it('sends the whole list of pictures when one is added, removed or described', () => {
    const before = post({ media: [{ mediaKey: 'k1', url: 'u1', altText: null, width: null, height: null }] });
    const state = fromPost(before);
    state.pictures[0]!.altText = 'bajar';
    expect(toUpdateRequest(before, state)).toEqual({ media: [{ mediaKey: 'k1', altText: 'bajar' }] });
    state.pictures.push(pic({ id: 'p9', mediaKey: 'k2' }));
    expect(toUpdateRequest(before, state)?.media).toEqual([{ mediaKey: 'k1', altText: 'bajar' }, { mediaKey: 'k2' }]);
    state.pictures = [];
    expect(toUpdateRequest(before, state)).toEqual({ media: [] });
  });

  it('waits while a new picture is still uploading', () => {
    const before = post();
    const state = fromPost(before);
    state.pictures.push(pic({ status: 'uploading', mediaKey: null }));
    expect(toUpdateRequest(before, state)).toBeNull();
    expect(hasChanges(null)).toBe(true);
  });
});
