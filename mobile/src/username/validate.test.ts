import { describe, expect, it } from 'vitest';
import { checkUsername, type UsernameIssue } from './validate';

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

  it('always returns a human message on failure', () => {
    const r = checkUsername('ab');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(4);
  });
});
