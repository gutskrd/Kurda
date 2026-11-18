import { describe, expect, it } from 'vitest';
import type { UsernameReason } from '@kurda/shared';
import { checkUsername, usernameIssueWhileTyping, usernameMessage, USERNAME_MIN, USERNAME_MAX, USERNAME_RULE_VARS } from './validate';
import { TRANSLATIONS, LOCALES } from '../i18n/translations';
import { interpolate } from '../i18n/format';

/*
 * The phone's sentences for the username rule (the rule itself is tested in shared/src/username.test.ts): every
 * refusal has the right sentence in every language.
 */

const issue = (raw: string): UsernameReason | 'ok' => {
  const r = checkUsername(raw);
  return r.ok ? 'ok' : r.issue;
};
const said = (raw: string): string | null => {
  const r = checkUsername(raw);
  return r.ok ? null : interpolate(TRANSLATIONS.en[r.message], r.vars);
};

describe('checkUsername (phone)', () => {
  it('gives the name as it is sent: trimmed, joined up and lowercase', () => {
    expect(checkUsername('rojda_kurdi')).toEqual({ ok: true, value: 'rojda_kurdi' });
    expect(checkUsername('  ŞÊRÎN.K  ')).toEqual({ ok: true, value: 'şêrîn.k' });
    expect(checkUsername('s' + String.fromCharCode(0x327) + 'ev')).toEqual({ ok: true, value: 'şev' });
  });

  /* Nothing typed is silently dropped: a leading "@" or a trailing full stop is named. */
  it('names a character it will not take, rather than dropping it', () => {
    expect(said('@dilan')).toBe('“@” can’t be in a username.');
    expect(said('dilan!?')).toBe('“! ?” can’t be in a username.');
    expect(said('di lan')).toBe(TRANSLATIONS.en['username.rule.spaces']);
    expect(said('dilan.')).toBe(TRANSLATIONS.en['username.rule.edge']);
  });

  it('flags each rule with its reason', () => {
    expect(issue('ab')).toBe('too-short');
    expect(issue('a'.repeat(31))).toBe('too-long');
    expect(issue('bad name')).toBe('invalid-chars');
    expect(issue('emoji😀')).toBe('invalid-chars');
    expect(issue('_lead')).toBe('edge-punctuation');
    expect(issue('trail.')).toBe('edge-punctuation');
    expect(issue('a__b')).toBe('double-punctuation');
    expect(issue('a._b')).toBe('double-punctuation');
    expect(issue('12345')).toBe('numbers-only');
    expect(issue('12_34')).toBe('no-letter');
    expect(issue('ad.min')).toBe('reserved');
    expect(issue('di.lan')).toBe('ok');
  });

  /**
   * A missing translation renders as its key and still typechecks, so assert every language has the sentence with
   * the same placeholders.
   */
  it('names a rule every language has a sentence for', () => {
    const inputs = ['ab', 'a'.repeat(USERNAME_MAX + 1), 'bad!', 'bad name', '_ab', 'a__b', '12345', '12_34', 'admin'];
    const holes = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const input of inputs) {
      const r = checkUsername(input);
      expect(r.ok, input).toBe(false);
      if (r.ok) continue;
      for (const loc of LOCALES) {
        expect(TRANSLATIONS[loc][r.message], `${loc} ${r.message}`).toBeTruthy();
        expect(holes(TRANSLATIONS[loc][r.message]), `${loc} ${r.message}`).toEqual(holes(TRANSLATIONS.en[r.message]));
      }
    }
    for (const loc of LOCALES) expect(holes(TRANSLATIONS[loc]['username.hint']), loc).toEqual(['max', 'min']);
  });

  it('carries the limits as variables, not baked into the sentence', () => {
    expect(USERNAME_RULE_VARS).toEqual({ min: USERNAME_MIN, max: USERNAME_MAX });
    expect(TRANSLATIONS.en['username.rule.tooShort']).toContain('{min}');
    expect(TRANSLATIONS.ku['username.rule.tooLong']).toContain('{max}');
  });
});

describe('usernameIssueWhileTyping', () => {
  it('says only what more typing cannot mend', () => {
    expect(usernameIssueWhileTyping('ha')).toBeNull();
    expect(usernameIssueWhileTyping('hamo.')).toBeNull();
    expect(usernameIssueWhileTyping('123')).toBeNull();
    expect(usernameIssueWhileTyping('ha!')).toMatchObject({ ok: false, issue: 'invalid-chars', message: 'username.rule.charNotAllowed' });
    expect(usernameIssueWhileTyping('.ha')).toMatchObject({ ok: false, issue: 'edge-punctuation' });
  });
});

describe('usernameMessage', () => {
  it('words a server’s reason as the phone’s own check does', () => {
    expect(usernameMessage('invalid-chars', ['#'])).toEqual({ message: 'username.rule.charNotAllowed', vars: { ...USERNAME_RULE_VARS, chars: '#' } });
    expect(usernameMessage('invalid-chars', [' '])).toMatchObject({ message: 'username.rule.spaces' });
    expect(usernameMessage('reserved')).toMatchObject({ message: 'error.code.usernameUnavailable' });
    // A reason the phone does not know yet gets the rule as a whole.
    expect(usernameMessage('something-newer')).toMatchObject({ message: 'username.rule.invalidChars' });
    expect(usernameMessage('invalid-chars')).toMatchObject({ message: 'username.rule.invalidChars' });
  });
});
