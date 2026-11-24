import { describe, expect, it } from 'vitest';
import { NOTICE_FILTERS, noticeFilterOf, noticeFiltersFor, noticePicture, noticeShows } from './notices.js';

describe('a notification in the list', () => {
  it('falls under the filter its kind says, else its category, else news from Hevalo', () => {
    expect(noticeFilterOf({ category: 'friends', data: { kind: 'gift' } })).toBe('people');
    expect(noticeFilterOf({ category: 'friends', data: { kind: 'letter' } })).toBe('people');
    expect(noticeFilterOf({ category: 'games', data: { kind: 'play_invite', game: 'impostor' } })).toBe('games');
    expect(noticeFilterOf({ category: 'progress', data: { kind: 'league_promotion', tier: 'kani' } })).toBe('progress');
    expect(noticeFilterOf({ category: 'streak' })).toBe('progress');
    expect(noticeFilterOf({ category: 'friends', data: { kind: 'parental_leave', state: 'asked' } })).toBe('people');
    expect(noticeFilterOf({ category: 'friends', data: { kind: 'parental_birth' } })).toBe('people');
    // what moderators and care say is from Hevalo, whichever category carried it
    expect(noticeFilterOf({ category: 'friends', data: { kind: 'caring_message' } })).toBe('hevalo');
    expect(noticeFilterOf({ category: 'events' })).toBe('hevalo');
    expect(noticeFilterOf({ category: 'something-new', data: { kind: 'unheard_of' } })).toBe('hevalo');
    expect(noticeShows({ category: 'events' }, 'all')).toBe(true);
    expect(noticeShows({ category: 'events' }, 'games')).toBe(false);
  });

  it('offers All and only the filters something falls under, in their order', () => {
    expect(noticeFiltersFor([])).toEqual(['all']);
    expect(noticeFiltersFor([{ category: 'events' }, { category: 'friends', data: { kind: 'gift' } }])).toEqual(['all', 'people', 'hevalo']);
    expect(NOTICE_FILTERS[0]).toBe('all');
  });

  it('pictures what it is about where that can be drawn, and nothing where it cannot', () => {
    expect(noticePicture({ category: 'progress', data: { kind: 'badge', key: 'nope', tier: '2' } })).toBeNull();
    expect(noticePicture({ category: 'progress', data: { kind: 'badge', day: '2026-11-14' } })).toBeNull();
    expect(noticePicture({ category: 'progress', data: { kind: 'league_trophy', tier: 'kani' } })).toEqual({ kind: 'league', tier: 'kani' });
    expect(noticePicture({ category: 'progress', data: { kind: 'league_safe', tier: 'nowhere' } })).toBeNull();
    expect(noticePicture({ category: 'games', data: { kind: 'play_invite', game: 'impostor' } })).toEqual({ kind: 'game', game: 'impostor' });
    expect(noticePicture({ category: 'games', data: { kind: 'play_invite', game: 'chess' } })).toBeNull();
    expect(noticePicture({ category: 'friends', data: { kind: 'letter' } })).toEqual({ kind: 'letter' });
    expect(noticePicture({ category: 'friends', data: { kind: 'gift' } })).toEqual({ kind: 'gift' });
    expect(noticePicture({ category: 'streak' })).toEqual({ kind: 'streak' });
    expect(noticePicture({ category: 'events' })).toBeNull();
  });
});
