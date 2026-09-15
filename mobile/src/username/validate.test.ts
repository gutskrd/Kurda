import { describe, expect, it } from 'vitest';
import { checkUsername, type UsernameIssue, USERNAME_MIN, USERNAME_MAX, USERNAME_RULE_VARS } from './validate';
import { TRANSLATIONS, LOCALES } from '../i18n/translations';

const issue = (raw: string): UsernameIssue | 'ok' => {
  const r = checkUsername(raw);
  return r.ok ? 'ok' : r.issue;
};

describe('checkUsername (client)', () => {
  it('accepts valid names incl. Kurdish letters, trimming + normalising', () => {
    expect(checkUsername('rojda_kurdi')).toEqual({ ok: true, value: 'rojda_kurdi' });
    expect(checkUsername('  şêrîn  ')).toEqual({ ok: true, value: 'şêrîn' });
  });

  it('flags each structural rule with a reason', () => {
    expect(issue('ab')).toBe('too-short');
    expect(issue('a'.repeat(31))).toBe('too-long');
    expect(issue('bad name')).toBe('invalid-chars');
    expect(issue('nope!')).toBe('invalid-chars');
    expect(issue('emoji😀')).toBe('invalid-chars');
    expect(issue('_lead')).toBe('edge-underscore');
    expect(issue('trail_')).toBe('edge-underscore');
    expect(issue('a__b')).toBe('consecutive-underscore');
    expect(issue('12345')).toBe('numbers-only');
    expect(issue('12_34')).toBe('no-letter');
  });

  /**
   * The reason is a key now, and a key with nothing behind it renders as the
   * key — which typechecks, because TranslationKey is a union of strings. So
   * the assertion is that every language actually has the sentence.
   */
  it('names a rule every language has a sentence for', () => {
    const inputs = ['ab', 'a'.repeat(USERNAME_MAX + 1), 'bad!', '_ab', 'a__b', '12345', '12_34'];
    for (const input of inputs) {
      const r = checkUsername(input);
      expect(r.ok, input).toBe(false);
      if (r.ok) continue;
      for (const loc of LOCALES) {
        expect(TRANSLATIONS[loc][r.message], `${loc} ${r.message}`).toBeTruthy();
      }
    }
  });

  it('carries the limits as variables, not baked into the sentence', () => {
    expect(USERNAME_RULE_VARS).toEqual({ min: USERNAME_MIN, max: USERNAME_MAX });
    expect(TRANSLATIONS.en['username.rule.tooShort']).toContain('{min}');
    expect(TRANSLATIONS.ku['username.rule.tooLong']).toContain('{max}');
  });
});
