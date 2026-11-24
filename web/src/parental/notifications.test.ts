import { describe, it, expect } from 'vitest';
import { en } from '../i18n/en';
import type { InboxNote } from '../reports/notifications';
import { noteKind } from '../notifications/rows';
import { parentalNotification } from './notifications';

const t = ((key: keyof typeof en, vars: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))) as never;
const note = (data: Record<string, unknown>): InboxNote => ({ title: 'English from the server', body: 'More English', data }) as unknown as InboxNote;

describe('parental notifications', () => {
  it('word each kind in the reader’s language, opening the teen’s page or the parental page', () => {
    expect(parentalNotification(note({ kind: 'parental_parent_added', teenId: 't1', teenName: 'Roj', parentName: 'Dilan' }), t)).toEqual({
      title: 'Dilan also looks after Roj now',
      body: null,
      to: '/app/settings/parental/teen/t1',
    });
    expect(parentalNotification(note({ kind: 'parental_zone', teenId: 't1', teenName: 'Roj', timeZone: 'America/New_York' }), t)).toMatchObject({
      title: 'Roj’s time zone changed to New York',
      to: '/app/settings/parental/teen/t1',
    });
    // A change reaches the teen and the other parents, each worded for who reads it.
    expect(parentalNotification(note({ kind: 'parental_changed', parentName: 'Dilan', teenId: 't1', teenName: 'Roj' }), t)).toMatchObject({
      title: 'Dilan changed Roj’s parental controls',
      to: '/app/settings/parental/teen/t1',
    });
    expect(parentalNotification(note({ kind: 'parental_changed', parentName: 'Dilan' }), t)).toMatchObject({
      title: 'Dilan changed your parental controls',
      to: '/app/settings/parental',
    });
  });

  it('say when a teen asked to stop or chose to stay, opening the teen’s page', () => {
    const asked = note({ kind: 'parental_leave', state: 'asked', teenId: 't1', teenName: 'Roj', teenUsername: 'roj', endsAt: '2026-12-01T10:00:00.000Z' });
    expect(parentalNotification(asked, t, 'en-US')).toEqual({
      title: 'Roj asked to stop supervision',
      body: 'It ends on December 1, 2026.',
      to: '/app/settings/parental/teen/t1',
    });
    expect(parentalNotification(note({ kind: 'parental_leave', state: 'kept', teenId: 't1', teenName: null, teenUsername: 'roj' }), t, 'en-US')).toEqual({
      title: 'roj chose to stay connected',
      body: null,
      to: '/app/settings/parental/teen/t1',
    });
  });

  it('say who corrected a birth month, worded for the teen and for another parent', () => {
    // The month comes as digits, as the server sends it.
    const birth = { kind: 'parental_birth', to: 'teen', parentId: 'p1', parentName: 'Dilan', parentUsername: 'dilan', birthYear: '2011', birthMonth: '3' };
    expect(parentalNotification(note(birth), t, 'en-US')).toEqual({
      title: 'Dilan corrected your birth month to March 2011',
      body: 'If this is wrong, write to support.',
      to: '/app/settings/parental',
    });
    expect(parentalNotification(note({ ...birth, to: 'parent', teenId: 't1', teenName: 'Roj', teenUsername: 'roj' }), t, 'en-US')).toEqual({
      title: 'Dilan corrected Roj’s birth month to March 2011',
      body: null,
      to: '/app/settings/parental/teen/t1',
    });
    // Without a month to show, the server’s own words stand.
    expect(parentalNotification(note({ ...birth, birthMonth: '13' }), t, 'en-US')).toMatchObject({ title: 'English from the server' });
  });

  it('tell a teen when the days they asked for have run', () => {
    const left = note({ kind: 'parental_ended', by: 'teen', parentId: 'p1', parentName: 'Dilan', parentUsername: 'dilan' });
    expect(parentalNotification(left, t, 'en-US')).toEqual({
      title: 'Supervision by Dilan has ended',
      body: null,
      to: '/app/settings/parental',
    });
    // The parent’s side of the same end names the teen.
    expect(parentalNotification(note({ kind: 'parental_ended', by: 'teen', teenId: 't1', teenName: 'Roj', teenUsername: 'roj' }), t, 'en-US')).toMatchObject({
      title: 'Roj disconnected you from their parental controls',
    });
  });

  it('wear the parental glyph', () => {
    const kinds = ['parental_connected', 'parental_ended', 'parental_changed', 'parental_parent_added', 'parental_zone', 'parental_leave', 'parental_birth'];
    for (const kind of kinds) {
      expect(noteKind({ category: 'friends', data: { kind } } as never), kind).toBe('parental');
    }
  });
});
