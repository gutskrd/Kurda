import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH, generateJoinCode, isValidCode, normalizeCode } from './private-room.js';
import { selectQuestions } from './question-bank.js';

describe('join codes', () => {
  it('generates codes of the right length from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it('excludes ambiguous characters (0, O, 1, I, L)', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) expect(CODE_ALPHABET).not.toContain(ch);
  });

  it('maps the rng deterministically to the alphabet', () => {
    expect(generateJoinCode(() => 0)).toBe(CODE_ALPHABET[0]!.repeat(CODE_LENGTH));
    expect(generateJoinCode(() => 0.999999)).toBe(CODE_ALPHABET[CODE_ALPHABET.length - 1]!.repeat(CODE_LENGTH));
  });

  it('validates and normalizes codes', () => {
    expect(isValidCode('ABC234')).toBe(true);
    expect(isValidCode('abc234')).toBe(false); // must be upper
    expect(isValidCode('ABC2')).toBe(false); // too short
    expect(isValidCode('ABC23O')).toBe(false); // O not in alphabet
    expect(normalizeCode('  abc234 ')).toBe('ABC234');
  });
});

describe('selectQuestions filtering (KUR-056)', () => {
  it('honors a category/level filter', () => {
    const phrases = selectQuestions('seed', 2, { category: 'phrases' });
    expect(phrases.every((q) => q.category === 'phrases')).toBe(true);

    const level1 = selectQuestions('seed', 4, { level: 1 });
    expect(level1.every((q) => q.level === 1)).toBe(true);
  });

  it('backfills from the full bank when the filter is too narrow', () => {
    // only 2 phrase questions exist; asking for 5 backfills to 5
    const got = selectQuestions('seed', 5, { category: 'phrases' });
    expect(got).toHaveLength(5);
    expect(got.slice(0, 2).every((q) => q.category === 'phrases')).toBe(true);
  });

  it('is deterministic per seed', () => {
    expect(selectQuestions('s', 5).map((q) => q.id)).toEqual(selectQuestions('s', 5).map((q) => q.id));
  });
});
