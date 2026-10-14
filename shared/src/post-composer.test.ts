import { describe, expect, it } from 'vitest';
import {
  POST_ALT_MAX,
  POST_BODY_MAX,
  POST_DRAFT_VERSION,
  POST_PICTURES_MAX,
  POST_SOURCE_MAX,
  POST_TITLE_MAX,
  canPost,
  cleanPostText,
  derivePostType,
  emptyPostDraft,
  isEmptyDraft,
  parsePostDraft,
  pictureUploadPath,
  postDraftStorageKey,
  postProblems,
  postTextLength,
  titleRequiredFor,
  toCreatePostRequest,
  type PostDraft,
} from './post-composer.js';

const picture = (altText = '') => ({ altText });

describe('counting characters the way the server does', () => {
  it('ignores spaces and blank lines at either end', () => {
    expect(postTextLength('  \n Silav \n\n ')).toBe(5);
    expect(postTextLength('')).toBe(0);
    expect(postTextLength(null)).toBe(0);
    expect(postTextLength(undefined)).toBe(0);
  });

  it('keeps the lines inside a poem and drops control characters', () => {
    expect(cleanPostText('Rojek\nbaran\u0007 dibare')).toBe('Rojek\nbaran dibare');
    expect(postTextLength('a\u0000b')).toBe(2);
  });

  it('counts an emoji as two, as `.length` on the server does', () => {
    expect(postTextLength('🌞')).toBe(2);
  });

  it('counts Kurdish letters, composed or not, by code unit', () => {
    expect(postTextLength('ê')).toBe(1);
    expect(postTextLength('ê')).toBe(2);
  });
});

describe('what kind of post it is', () => {
  it('is a gotin without a title and a story with one', () => {
    expect(derivePostType({})).toBe('gotin');
    expect(derivePostType({ title: '   ' })).toBe('gotin');
    expect(derivePostType({ title: 'Bavê min' })).toBe('story');
  });

  it('is a poem only when chosen, and a chosen kind wins', () => {
    expect(derivePostType({ title: 'Helbest', type: 'poem' })).toBe('poem');
    expect(derivePostType({ type: 'story' })).toBe('story');
    expect(derivePostType({ title: 'Navek', type: 'gotin' })).toBe('gotin');
    expect(derivePostType({ title: 'x', type: null })).toBe('story');
  });

  it('asks only a story and a poem for a title', () => {
    expect(titleRequiredFor('gotin')).toBe(false);
    expect(titleRequiredFor('story')).toBe(true);
    expect(titleRequiredFor('poem')).toBe(true);
  });
});

describe('whether a post can be posted', () => {
  it('needs words or a picture', () => {
    expect(canPost({ body: '   ' })).toEqual({ ok: false, problem: { code: 'EMPTY_POST' } });
    expect(canPost({ body: 'Silav!' })).toEqual({ ok: true, type: 'gotin' });
    // pictures alone are a post: the text may be empty when there is one
    expect(canPost({ body: '', pictures: [picture()] })).toEqual({ ok: true, type: 'gotin' });
  });

  it('refuses a chosen story or poem without a name', () => {
    expect(canPost({ type: 'poem', body: 'rêz' })).toEqual({ ok: false, problem: { code: 'TITLE_REQUIRED' } });
    expect(canPost({ type: 'story', title: '  ', body: 'rêz' })).toEqual({ ok: false, problem: { code: 'TITLE_REQUIRED' } });
    expect(canPost({ type: 'poem', title: 'Nav', body: 'rêz' })).toEqual({ ok: true, type: 'poem' });
  });

  it('allows up to four pictures', () => {
    const four = Array.from({ length: POST_PICTURES_MAX }, () => picture());
    expect(canPost({ pictures: four }).ok).toBe(true);
    expect(canPost({ pictures: [...four, picture()] })).toEqual({
      ok: false,
      problem: { code: 'TOO_MANY_PICTURES', max: 4 },
    });
  });

  it('makes only a post with pictures a meme', () => {
    expect(canPost({ body: 'ha ha', meme: true })).toEqual({ ok: false, problem: { code: 'MEME_NEEDS_PICTURE' } });
    expect(canPost({ body: 'ha ha', meme: true, pictures: [picture()] }).ok).toBe(true);
  });

  it('holds every field to its limit, counted trimmed', () => {
    expect(canPost({ body: 'x'.repeat(POST_BODY_MAX) }).ok).toBe(true);
    // padding at the ends is not counted, so it does not push a post over
    expect(canPost({ body: `  ${'x'.repeat(POST_BODY_MAX)}\n\n` }).ok).toBe(true);
    expect(canPost({ body: 'x'.repeat(POST_BODY_MAX + 1) })).toEqual({
      ok: false,
      problem: { code: 'TOO_LONG', field: 'body', max: POST_BODY_MAX },
    });
    expect(postProblems({ title: 'x'.repeat(POST_TITLE_MAX + 1), body: 'b' })).toEqual([
      { code: 'TOO_LONG', field: 'title', max: POST_TITLE_MAX },
    ]);
    expect(postProblems({ body: 'b', sourceCredit: 'x'.repeat(POST_SOURCE_MAX + 1) })).toEqual([
      { code: 'TOO_LONG', field: 'sourceCredit', max: POST_SOURCE_MAX },
    ]);
  });

  it('reports long alt text once, however many pictures have it', () => {
    const long = 'x'.repeat(POST_ALT_MAX + 1);
    expect(postProblems({ pictures: [picture(long), picture(long), picture('ok')] })).toEqual([
      { code: 'TOO_LONG', field: 'altText', max: POST_ALT_MAX },
    ]);
    expect(canPost({ pictures: [picture('x'.repeat(POST_ALT_MAX))] }).ok).toBe(true);
  });

  it('lists every problem, the most fundamental first', () => {
    expect(postProblems({ type: 'story', meme: true }).map((p) => p.code)).toEqual([
      'EMPTY_POST',
      'TITLE_REQUIRED',
      'MEME_NEEDS_PICTURE',
    ]);
  });
});

describe('uploading a picture', () => {
  it('signs it unless "I made this" is switched off', () => {
    expect(pictureUploadPath(true)).toBe('/images/upload');
    expect(pictureUploadPath(false)).toBe('/images/upload?ownWork=false');
  });
});

describe('drafts on the device', () => {
  const draft = (over: Partial<PostDraft> = {}): PostDraft => ({ ...emptyPostDraft(1000), ...over });

  it('keeps one draft per person', () => {
    expect(postDraftStorageKey('u1')).toBe('composer.draft.v1:u1');
    expect(postDraftStorageKey('u1')).not.toBe(postDraftStorageKey('u2'));
  });

  it('knows an untouched draft from one worth keeping', () => {
    expect(isEmptyDraft(draft())).toBe(true);
    expect(isEmptyDraft(draft({ body: '  ' }))).toBe(true);
    expect(isEmptyDraft(draft({ title: 'Nav' }))).toBe(false);
    expect(isEmptyDraft(draft({ pictures: [{ mediaKey: null, localUri: 'file:///a.jpg', altText: '', ownWork: true }] }))).toBe(false);
  });

  it('reads back what it wrote, from text or a parsed value', () => {
    const d = draft({ type: 'poem', title: 'Nav', body: 'rêz', meme: false, sourceCredit: 'Cegerxwîn' });
    expect(parsePostDraft(JSON.stringify(d))).toEqual(d);
    expect(parsePostDraft(d)).toEqual(d);
  });

  it('answers null for what is not a draft, instead of throwing', () => {
    expect(parsePostDraft('{not json')).toBeNull();
    expect(parsePostDraft(null)).toBeNull();
    expect(parsePostDraft(42)).toBeNull();
    expect(parsePostDraft({ version: POST_DRAFT_VERSION + 1, body: 'x' })).toBeNull();
  });

  it('keeps what it recognises and repairs the rest', () => {
    const parsed = parsePostDraft({
      version: POST_DRAFT_VERSION,
      type: 'essay',
      title: 7,
      body: 'rêz',
      meme: true,
      pictures: [
        { mediaKey: 'image-post/a.webp', altText: 'a', ownWork: false },
        { localUri: 'file:///b.jpg' },
        { altText: 'nothing to show' },
        'junk',
        { mediaKey: 'image-post/c.webp' },
        { mediaKey: 'image-post/d.webp' },
        { mediaKey: 'image-post/e.webp' },
      ],
    });
    expect(parsed).toMatchObject({ type: null, title: '', body: 'rêz', meme: true, sourceCredit: '', savedAt: 0 });
    expect(parsed!.pictures).toEqual([
      { mediaKey: 'image-post/a.webp', localUri: null, altText: 'a', ownWork: false },
      { mediaKey: null, localUri: 'file:///b.jpg', altText: '', ownWork: true },
      { mediaKey: 'image-post/c.webp', localUri: null, altText: '', ownWork: true },
      { mediaKey: 'image-post/d.webp', localUri: null, altText: '', ownWork: true },
    ]);
  });

  it('does not keep a meme mark with no picture left to carry it', () => {
    expect(parsePostDraft({ version: POST_DRAFT_VERSION, body: 'x', meme: true })!.meme).toBe(false);
  });
});

describe('the request for a finished draft', () => {
  const base = emptyPostDraft(0);

  it('waits while a picture is still uploading', () => {
    expect(
      toCreatePostRequest({ ...base, pictures: [{ mediaKey: null, localUri: 'file:///a.jpg', altText: '', ownWork: true }] }),
    ).toBeNull();
  });

  it('sends what the counter counted, and leaves empty fields out', () => {
    expect(toCreatePostRequest({ ...base, body: '  Silav  ', title: ' ', sourceCredit: '' })).toEqual({
      type: 'gotin',
      body: 'Silav',
    });
  });

  it('carries the kind, the title, the pictures in order, the meme mark and the credit', () => {
    expect(
      toCreatePostRequest({
        ...base,
        title: ' Çiya ',
        pictures: [
          { mediaKey: 'image-post/1.webp', localUri: null, altText: ' A mountain at dawn ', ownWork: true },
          { mediaKey: 'image-post/2.webp', localUri: null, altText: '', ownWork: false },
        ],
        meme: true,
        sourceCredit: 'Wêne: Rojda',
      }),
    ).toEqual({
      type: 'story',
      title: 'Çiya',
      body: '',
      media: [{ mediaKey: 'image-post/1.webp', altText: 'A mountain at dawn' }, { mediaKey: 'image-post/2.webp' }],
      meme: true,
      sourceCredit: 'Wêne: Rojda',
    });
  });
});
