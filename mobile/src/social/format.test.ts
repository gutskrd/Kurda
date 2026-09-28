import { describe, expect, it } from 'vitest';
import {
  VISIBILITY_HINT,
  VISIBILITIES,
  friendActionLabel,
  isActionable,
  isUndo,
  undoAction,
  VISIBILITY_LABEL,
} from './format';
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
  it('is true when the user can act — add, accept, or take one back', () => {
    expect(isActionable('none')).toBe(true);
    expect(isActionable('pending_in')).toBe(true);
    expect(isActionable('pending_out')).toBe(true);
    expect(isActionable('friends')).toBe(true);
  });

  /*
   * The two that are genuinely not actions. `blocked` is undone from the block
   * list, not from a profile you can no longer usefully see, and `self` has no
   * relationship to change.
   */
  it('is false where there is nothing to do', () => {
    expect(isActionable('blocked')).toBe(false);
    expect(isActionable('self')).toBe(false);
  });
});

describe('isUndo', () => {
  it('marks the two states whose action takes something back', () => {
    expect(isUndo('pending_out')).toBe(true);
    expect(isUndo('friends')).toBe(true);
  });

  it('leaves the offers alone', () => {
    expect(isUndo('none')).toBe(false);
    expect(isUndo('pending_in')).toBe(false);
    expect(isUndo('blocked')).toBe(false);
    expect(isUndo('self')).toBe(false);
  });

  /*
   * The invariant that matters: anything that undoes something must also be
   * something you can press. If these two ever disagree the button either
   * confirms an action it cannot perform, or performs one without asking.
   */
  it('never marks a state the button cannot act on', () => {
    for (const status of ['none', 'pending_out', 'pending_in', 'friends', 'blocked', 'self'] as const) {
      if (isUndo(status)) expect(isActionable(status), status).toBe(true);
    }
  });
});

describe('undoAction', () => {
  it('asks about the thing being undone, and only for those', () => {
    expect(undoAction('pending_out')).toEqual({ label: 'friends.cancel', prompt: 'friends.cancelRequest' });
    expect(undoAction('friends')).toEqual({ label: 'friends.remove', prompt: 'friends.removeWho' });
    expect(undoAction('none')).toBeNull();
    expect(undoAction('pending_in')).toBeNull();
    expect(undoAction('blocked')).toBeNull();
    expect(undoAction('self')).toBeNull();
  });

  it('names keys every language actually has', () => {
    for (const status of ['pending_out', 'friends'] as const) {
      const undo = undoAction(status)!;
      for (const loc of LOCALES) {
        for (const key of [undo.label, undo.prompt]) {
          expect(TRANSLATIONS[loc][key], `${loc} ${key}`).toBeTruthy();
        }
      }
    }
  });

  /*
   * The prompt has to say who. A translation that dropped `{name}` turns
   * "Remove Dilan as a friend" into a bare "Remove" — the same word as the
   * button beneath it, on the one dialog whose whole job is to be specific
   * about which friendship is about to end.
   */
  it('asks about a named person in every language', () => {
    for (const status of ['pending_out', 'friends'] as const) {
      const { prompt } = undoAction(status)!;
      for (const loc of LOCALES) {
        expect(TRANSLATIONS[loc][prompt], `${loc} ${prompt}`).toContain('{name}');
      }
    }
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
