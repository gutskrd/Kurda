import { describe, expect, it } from 'vitest';
import { bodyPreview, clock, commentText, type LibraryComment } from './types';

describe('clock', () => {
  it('formats seconds as mm:ss and floors, guarding junk', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(5)).toBe('0:05');
    expect(clock(65.9)).toBe('1:05');
    expect(clock(600)).toBe('10:00');
    expect(clock(-3)).toBe('0:00');
    expect(clock(NaN)).toBe('0:00');
  });
});

describe('bodyPreview', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(bodyPreview('a\n\n  b   c')).toBe('a b c');
    expect(bodyPreview('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('commentText', () => {
  const base: LibraryComment = {
    id: '1', postId: 'p', authorId: 'a', authorRole: 'user', parentCommentId: null, depth: 0,
    body: 'hello', audioMediaId: null, audioUrl: null, status: 'visible', replyCount: 0, createdAt: '', updatedAt: '',
  };
  it('shows body, voice placeholder, or removed placeholder', () => {
    expect(commentText(base)).toBe('hello');
    expect(commentText({ ...base, body: null, audioMediaId: 'k' })).toBe('🔊 Voice comment');
    expect(commentText({ ...base, status: 'removed', body: null })).toBe('This comment was removed.');
  });
});
