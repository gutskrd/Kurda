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

  it('wear the parental glyph', () => {
    for (const kind of ['parental_connected', 'parental_ended', 'parental_changed', 'parental_parent_added', 'parental_zone']) {
      expect(noteKind({ category: 'friends', data: { kind } } as never), kind).toBe('parental');
    }
  });
});
