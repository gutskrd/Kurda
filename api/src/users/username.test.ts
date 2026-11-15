/**
 * The server's side of the username rule: the rule itself is tested where it
 * lives (shared/src/username.test.ts); these check that the server applies it
 * as it is, and how it says no.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../plugins/errors.js';
import { canonicalUsername, invalidUsername, usernameRefusalMessage, validateUsername } from './username.js';

const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302);

describe('validateUsername', () => {
  it('gives the canonical name: NFC, trimmed and lowercase', () => {
    expect(validateUsername('  Hamo.Ali ')).toEqual({ ok: true, value: 'hamo.ali' });
    expect(validateUsername('ŞÊRÎN_99')).toEqual({ ok: true, value: 'şêrîn_99' });
    expect(validateUsername(`s${E_CIRC_DECOMPOSED}rzan`)).toEqual({ ok: true, value: 'sêrzan' });
    expect(validateUsername('İbrahîm')).toEqual({ ok: true, value: 'ibrahîm' });
  });

  it('refuses what the shared rule refuses, for the same reason', () => {
    expect(validateUsername('ha mo')).toEqual({ ok: false, reason: 'invalid-chars', chars: [' '] });
    expect(validateUsername('hamo.')).toEqual({ ok: false, reason: 'edge-punctuation' });
    expect(validateUsername('ha._mo')).toEqual({ ok: false, reason: 'double-punctuation' });
    expect(validateUsername('ad.min')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('canonicalUsername', () => {
  it('is the name, or null when it breaks a rule', () => {
    expect(canonicalUsername('Kurda_Fan')).toBe('kurda_fan');
    expect(canonicalUsername('ab')).toBeNull();
    expect(canonicalUsername('kurda😀')).toBeNull();
  });
});

describe('a refused name', () => {
  it('answers INVALID_USERNAME with the reason, and the characters when it is about them', () => {
    const chars = invalidUsername({ ok: false, reason: 'invalid-chars', chars: ['!', '?'] });
    expect(chars).toBeInstanceOf(AppError);
    expect(chars).toMatchObject({ code: 'INVALID_USERNAME', statusCode: 400, details: { reason: 'invalid-chars', chars: ['!', '?'] } });
    expect(chars.message).toBe('“!” “?” can’t be in a username.');
    expect(invalidUsername({ ok: false, reason: 'too-short' })).toMatchObject({ details: { reason: 'too-short' } });
  });

  it('says every reason in a sentence of its own', () => {
    const said = (['too-long', 'too-short', 'edge-punctuation', 'double-punctuation', 'numbers-only', 'no-letter', 'reserved'] as const).map((reason) =>
      usernameRefusalMessage({ ok: false, reason }),
    );
    expect(new Set(said).size).toBe(said.length);
    expect(usernameRefusalMessage({ ok: false, reason: 'invalid-chars', chars: [' '] })).toBe('A username can’t have spaces.');
  });
});
