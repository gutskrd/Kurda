import { describe, expect, it } from 'vitest';
import { VISIBILITY_HINT, VISIBILITIES, friendActionLabel, isActionable, VISIBILITY_LABEL } from './format';
import { TRANSLATIONS, LOCALES } from '../i18n/translations';

describe('friendActionLabel', () => {
  it('labels each relationship state', () => {
    expect(friendActionLabel('none')).toBe('profile.addFriend');
    expect(friendActionLabel('pending_out')).toBe('friends.requested');
    expect(friendActionLabel('pending_in')).toBe('profile.acceptRequest');
    expect(friendActionLabel('friends')).toBe('profile.friends');
    expect(friendActionLabel('blocked')).toBe('profile.blocked');
    expect(friendActionLabel('self')).toBeNull();
  });

  // a key with nothing behind it renders as the key, which the type cannot catch
  it('names a key every language actually has', () => {
    for (const status of ['none', 'pending_out', 'pending_in', 'friends', 'blocked'] as const) {
      const key = friendActionLabel(status)!;
      for (const loc of LOCALES) expect(TRANSLATIONS[loc][key], `${loc} ${key}`).toBeTruthy();
    }
  });
});

describe('isActionable', () => {
  it('is true only when the user can act (add or accept)', () => {
    expect(isActionable('none')).toBe(true);
    expect(isActionable('pending_in')).toBe(true);
    expect(isActionable('pending_out')).toBe(false);
    expect(isActionable('friends')).toBe(false);
  });
});

describe('VISIBILITY_LABEL', () => {
  it('maps every visibility option', () => {
    expect(VISIBILITY_LABEL.everyone).toBe('settings.visibility.everyone');
    expect(VISIBILITY_LABEL.friends).toBe('settings.visibility.friends');
    expect(VISIBILITY_LABEL.nobody).toBe('settings.visibility.nobody');
  });

  it('names a key every language actually has', () => {
    for (const key of Object.values(VISIBILITY_LABEL)) {
      for (const loc of LOCALES) expect(TRANSLATIONS[loc][key], `${loc} ${key}`).toBeTruthy();
    }
  });
});

describe('profile visibility', () => {
  it('offers every value the server stores', () => {
    // the column defaults to 'members', and the phone used to offer three
    // options without it — so a fresh account saw nothing selected, could not
    // read its own privacy setting, and moved off the default by touching any
    // of them
    expect([...VISIBILITIES]).toEqual(['everyone', 'members', 'friends', 'nobody']);
  });

  it('has a label and a meaning for each', () => {
    for (const v of VISIBILITIES) {
      expect(VISIBILITY_LABEL[v]).toBeTruthy();
      expect(VISIBILITY_HINT[v]).toBeTruthy();
    }
  });
});
