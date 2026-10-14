/** What the spam check and the screening read of a post, and of an edit. */
import { describe, expect, it } from 'vitest';
import { addedPictures, changedWords, createProblem, editProblem, postWords, type LibraryPost } from './service.js';

const post = (over: Partial<LibraryPost> = {}): LibraryPost => ({
  id: 'p1', authorId: 'u1', authorRole: 'user', type: 'gotin', title: null, body: 'Silav', audioMediaId: null,
  language: 'kmr', status: 'published', viewCount: 0, commentCount: 0, createdAt: new Date(0), updatedAt: new Date(0),
  publishedAt: new Date(0), media: [], meme: false, sourceCredit: null,
  ...over,
});
const picture = (mediaKey: string, altText: string | null = null) => ({ mediaKey, altText, width: 10, height: 10 });

describe('the words of a post', () => {
  it('reads every word a post shows, and nothing that is not there', () => {
    expect(postWords({ title: 'Nav', body: 'Rêz', media: [{ altText: 'Çiya' }, { altText: null }], sourceCredit: 'Cegerxwîn' })).toBe(
      'Nav\nRêz\nÇiya\nCegerxwîn',
    );
  });

  it('never screens "undefined" or "null" in place of a missing title', () => {
    expect(postWords({ title: undefined, body: 'Gotinek' })).toBe('Gotinek');
    expect(postWords({ title: null, body: 'Gotinek' })).toBe('Gotinek');
  });

  it('is empty for a post that is only its pictures', () => {
    expect(postWords({ body: '', media: [{ altText: '' }] })).toBe('');
  });
});

describe('the words an edit adds', () => {
  it('is only what changed', () => {
    const current = post({ title: 'Nav', type: 'story', body: 'Kevn', media: [picture('a', 'Berê')], sourceCredit: 'X' });
    expect(changedWords(current, { body: 'Nû' })).toBe('Nû');
    expect(changedWords(current, { title: 'Nav', body: 'Kevn', sourceCredit: 'X' })).toBe('');
    expect(changedWords(current, { media: [{ mediaKey: 'a', altText: 'Berê' }, { mediaKey: 'b', altText: 'Nû' }] })).toBe('Nû');
    expect(changedWords(current, { media: [{ mediaKey: 'a', altText: 'Guherî' }] })).toBe('Guherî');
    expect(changedWords(current, { sourceCredit: 'Y' })).toBe('Y');
  });

  it('does not count padding as a change', () => {
    expect(changedWords(post({ body: 'Silav' }), { body: '  Silav \n' })).toBe('');
  });

  it('names the pictures an edit puts on, not the ones it keeps', () => {
    const current = post({ media: [picture('a'), picture('b')] });
    expect(addedPictures(current, { media: [{ mediaKey: 'b' }, { mediaKey: 'c' }] })).toEqual(['c']);
    expect(addedPictures(current, { body: 'x' })).toEqual([]);
  });
});

describe('the shape of a post, new or edited', () => {
  it('takes a new post the way the composer does', () => {
    expect(createProblem({ body: 'Silav' })).toBeNull();
    expect(createProblem({ body: '', media: [{ mediaKey: 'a' }] })).toBeNull();
    expect(createProblem({ body: '  ' })).toEqual({ code: 'EMPTY_POST' });
    expect(createProblem({ type: 'poem', body: 'rêz' })).toEqual({ code: 'TITLE_REQUIRED' });
  });

  it('checks an edit as the post it leaves', () => {
    const story = post({ type: 'story', title: 'Nav', body: 'Rêz' });
    expect(editProblem(story, { title: null })).toEqual({ code: 'TITLE_REQUIRED' });
    // clearing the title is fine once it is a gotin
    expect(editProblem(story, { title: null, type: 'gotin' })).toBeNull();
    expect(editProblem(story, { body: '' })).toEqual({ code: 'EMPTY_POST' });

    const photo = post({ body: '', media: [picture('a')], meme: true });
    // the last picture off an empty post leaves nothing
    expect(editProblem(photo, { media: [] })).toEqual({ code: 'EMPTY_POST' });
    // words in its place are a post, and the meme mark goes with the picture
    expect(editProblem(photo, { media: [], body: 'Êdî gotin e' })).toBeNull();
    expect(editProblem(photo, { media: [], body: 'x', meme: true })).toEqual({ code: 'MEME_NEEDS_PICTURE' });
  });
});
