import { describe, expect, it } from 'vitest';
import { banSummary, coveredLine, looksLikeAddress, type ContentSummary } from './bans';

const summary: ContentSummary = { posts: 23, pictures: 4, comments: 0, groupMessages: 0, directMessages: 7, lettersInFlight: 0, profile: true, groupPhotos: 0 };

describe('the ban summary', () => {
  it('says plainly what happens, to what, and that they are emailed', () => {
    expect(banSummary({ username: 'rojda', kind: 'permanent_ban', durationHours: null, choice: 'hide', includeMessages: false, summary })).toEqual([
      '@rojda will be banned permanently.',
      'Their 23 posts, 4 pictures and profile will be hidden from everyone.',
      'They will get an email with the reason and how to appeal.',
    ]);
  });

  it('says how long a suspension lasts, and that hidden content comes back when it ends', () => {
    const lines = banSummary({ username: 'baran', kind: 'suspension', durationHours: 72, choice: 'hide', includeMessages: true, summary });
    expect(lines[0]).toBe('@baran will be suspended for 3 days.');
    expect(lines[1]).toBe('Their 23 posts, 4 pictures, 7 private messages and profile will be hidden from everyone until the suspension ends.');
  });

  it('says a removal is deleted for good unless an appeal overturns it', () => {
    expect(banSummary({ username: 'baran', kind: 'permanent_ban', durationHours: null, choice: 'remove', includeMessages: false, summary })[1]).toBe(
      'Their 23 posts, 4 pictures and profile will be removed, and deleted for good after six months unless an appeal overturns the ban.',
    );
  });

  it('keeps what they shared when asked to', () => {
    expect(banSummary({ username: 'baran', kind: 'suspension', durationHours: 24, choice: 'keep', includeMessages: false, summary })[1]).toMatch(/stays up/);
  });

  it('counts only what there is, and says so while it loads', () => {
    expect(coveredLine({ ...summary, posts: 1, pictures: 0, profile: false }, false)).toBe('1 post');
    expect(coveredLine({ ...summary, posts: 0, pictures: 0, directMessages: 0, profile: false }, true)).toBe('nothing public yet');
    expect(coveredLine(null, false)).toBe('everything they shared');
  });
});

describe('an address to trust', () => {
  it('takes IPv4 and IPv6 and nothing else', () => {
    expect(looksLikeAddress('203.0.113.7')).toBe(true);
    expect(looksLikeAddress(' 2001:db8::1 ')).toBe(true);
    expect(looksLikeAddress('300.1.1.1')).toBe(false);
    expect(looksLikeAddress('school.example')).toBe(false);
    expect(looksLikeAddress('')).toBe(false);
  });
});
