import { describe, expect, it, vi } from 'vitest';
import { PICTURE_REJECT_REASONS, PICTURE_REVIEW_NOTE_MAX } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import {
  REFUSAL_KEY,
  askForReview,
  askOutcome,
  isHeld,
  pendingOf,
  pictureReviewLink,
  pictureReviewOf,
  pictureReviewText,
  rejectionInBody,
  reviewStateOf,
} from './review';

/** The real catalogue, so a missing sentence fails rather than passing as its key. */
const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
  const value = TRANSLATIONS.en[key];
  expect(value, `missing en ${key}`).toBeTruthy();
  return interpolate(value, vars);
};

const refusal = (reason: string, reviewId: string | null = 'rv1') => JSON.stringify({ code: 'IMAGE_REJECTED', message: 'rejected', reason, reviewId });

describe('a refused picture', () => {
  it('says each reason in its own words', () => {
    expect(PICTURE_REJECT_REASONS.map((r) => t(REFUSAL_KEY[r]))).toEqual([
      'This picture looks like it shows nudity or sexual content, which isn’t allowed on Hevalo.',
      'This picture looks violent or gory, which isn’t allowed on Hevalo.',
      'This picture looks like it shows self-harm, so we can’t share it. If you’re going through something hard, you’re not alone.',
      'This picture looks like it shows hateful symbols or words, which aren’t allowed on Hevalo.',
      'This picture can’t be shared on Hevalo.',
    ]);
  });

  it('is read from an upload’s raw answer only when it is one', () => {
    expect(rejectionInBody(422, refusal('violence'))).toEqual({ code: 'IMAGE_REJECTED', message: 'rejected', reason: 'violence', reviewId: 'rv1' });
    expect(rejectionInBody(422, refusal('other', null))?.reviewId).toBeNull();
    // A reason this app does not know, another status, or a page that is not JSON is no refusal to explain.
    expect(rejectionInBody(422, refusal('drugs'))).toBeNull();
    expect(rejectionInBody(413, refusal('sexual'))).toBeNull();
    expect(rejectionInBody(422, '<html>')).toBeNull();
  });
});

describe('asking a person to look', () => {
  it('sends the note, trimmed and no longer than the server keeps, and nothing when there is none', async () => {
    const post = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const client = { post } as unknown as ApiClient;
    await askForReview(client, 'rv1', '  It is a painting of a sunset.  ');
    expect(post).toHaveBeenLastCalledWith('/me/picture-reviews/rv1', { note: 'It is a painting of a sunset.' });
    await askForReview(client, 'rv1', '   ');
    expect(post).toHaveBeenLastCalledWith('/me/picture-reviews/rv1', {});
    await askForReview(client, 'rv1', 'a'.repeat(PICTURE_REVIEW_NOTE_MAX + 20));
    expect((post.mock.lastCall as unknown as [string, { note: string }])[1].note).toHaveLength(PICTURE_REVIEW_NOTE_MAX);
  });

  it('promises an answer once asked, or once already asked, and says any other failure plainly', () => {
    expect(askOutcome({ ok: true, data: { ok: true } }, t)).toEqual({ done: true, text: 'Thanks. A person will look at it and let you know.' });
    expect(askOutcome({ ok: false, error: { kind: 'client', status: 409, code: 'REVIEW_ALREADY_ASKED', message: 'x' } }, t)).toEqual({
      done: true,
      text: 'You already asked. A person will let you know.',
    });
    const offline = askOutcome({ ok: false, error: { kind: 'network', message: 'x' } }, t);
    expect(offline.done).toBe(false);
    expect(offline.text).toBe(t('error.offline'));
  });
});

describe('a held picture', () => {
  it('is held only when the answer says so, and its waiting picture only a real link', () => {
    expect(reviewStateOf({ review: 'held' })).toBe('held');
    expect(reviewStateOf({ review: 'clear' })).toBe('clear');
    expect(reviewStateOf({})).toBe('clear');
    expect(isHeld({ review: 'held' })).toBe(true);
    expect(isHeld({ id: 'l1' })).toBe(false);
    expect(isHeld(null)).toBe(false);
    expect(pendingOf({ url: 'https://media.test/private/p.webp?sig=1' })).toEqual({ url: 'https://media.test/private/p.webp?sig=1' });
    expect(pendingOf({ url: 'javascript:alert(1)' })).toBeNull();
    expect(pendingOf(null)).toBeNull();
  });
});

describe('a person’s decision in the inbox', () => {
  const POST = '3f1c2a10-0000-4000-8000-000000000001';
  const GROUP = '3f1c2a10-0000-4000-8000-000000000002';
  const LETTER = '3f1c2a10-0000-4000-8000-000000000003';
  const said = (data: Record<string, unknown>) => {
    const review = pictureReviewOf({ kind: 'picture_review', ...data });
    return review ? { ...pictureReviewText(review, t), link: pictureReviewLink(review) } : null;
  };

  it('says what an approval means where it was, and opens it', () => {
    expect(said({ outcome: 'approved', surface: 'post', target: POST })).toEqual({
      title: 'Your picture was checked and it’s fine.',
      body: 'Your post is now visible.',
      link: { screen: 'LibraryPost', params: { postId: POST } },
    });
    expect(said({ outcome: 'approved', surface: 'profile_photo', target: null })).toEqual({
      title: 'Your picture was checked and it’s fine.',
      body: 'Your new photo is now on your profile.',
      link: null,
    });
    expect(said({ outcome: 'approved', surface: 'group_photo', target: GROUP })).toMatchObject({
      body: 'The new group photo is now showing.',
      link: { screen: 'GroupThread', params: { groupId: GROUP, name: '' } },
    });
    expect(said({ outcome: 'approved', surface: 'letter', target: LETTER })).toMatchObject({ body: 'Your letter is on its way.', link: { screen: 'Letters' } });
  });

  it('tells the owner of a refused picture they asked about that it can be shared now', () => {
    expect(said({ outcome: 'approved', surface: 'post', target: null })).toEqual({
      title: 'Your picture was checked and it’s fine.',
      body: 'You can share it now.',
      link: null,
    });
  });

  it('says a refusal a person upheld, and opens nothing', () => {
    expect(said({ outcome: 'upheld', surface: 'post', target: null })).toEqual({
      title: 'A person checked your picture.',
      body: 'It can’t be shared on Hevalo.',
      link: null,
    });
  });

  it('ignores what it does not know, and never follows a target that is not an id', () => {
    expect(said({ outcome: 'maybe', surface: 'post', target: POST })).toBeNull();
    expect(said({ outcome: 'approved', surface: 'banner', target: POST })).toBeNull();
    expect(said({ outcome: 'approved', surface: 'post', target: '../admin' })?.link).toBeNull();
  });
});
