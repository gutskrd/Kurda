import { describe, it, expect } from 'vitest';
import { translator } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { ku } from '../i18n/ku';
import { progressNotification } from './notifications';

const t = translator(en);
const note = (data: Record<string, unknown> | null) => ({ title: 'English from the server', body: 'body', data });

describe('progressNotification', () => {
  it('says a badge in the reader’s words and opens the badges page', () => {
    expect(progressNotification(note({ kind: 'badge', key: 'agir', tier: '2' }), t)).toEqual({
      title: 'A new badge',
      body: 'You earned Agir.',
      to: '/app/badges',
    });
    // the day's bundle names no badge
    expect(progressNotification(note({ kind: 'badge', day: '2026-10-14' }), t)?.body).toBe(en['notify.badge.day']);
  });

  it('says the league news calmly, naming the league, and opens the league', () => {
    expect(progressNotification(note({ kind: 'league_safe', weekKey: '2026-10-12', tier: 'cem' }), t)).toEqual({
      title: 'Safe this week ✓',
      body: 'You met your weekly goal in Çem League.',
      to: '/app/rankings',
    });
    expect(progressNotification(note({ kind: 'league_promotion', tier: 'gol' }), t)).toMatchObject({ body: 'Welcome to Gol League.', to: '/app/rankings' });
    expect(progressNotification(note({ kind: 'league_trophy', tier: 'okyanus' }), t)?.title).toBe(en['notify.leagueTrophy.title']);
  });

  it('reads an old ten-tier name as its new league, and drops a body it cannot name', () => {
    expect(progressNotification(note({ kind: 'league_promotion', tier: 'sapphire' }), t)?.body).toBe('Welcome to Kanî League.');
    expect(progressNotification(note({ kind: 'league_safe', tier: 'nonsense' }), t)?.body).toBeNull();
  });

  it('is in the reader’s language', () => {
    const view = progressNotification(note({ kind: 'league_promotion', tier: 'cem' }), translator({ ...en, ...ku }));
    expect(view?.body).toBe('Bi xêr hatî Lîga Çem.');
  });

  it('leaves every other kind to whoever owns it', () => {
    expect(progressNotification(note({ kind: 'play_invite' }), t)).toBeNull();
    expect(progressNotification(note(null), t)).toBeNull();
  });
});
