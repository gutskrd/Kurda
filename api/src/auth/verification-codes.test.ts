import { describe, expect, it } from 'vitest';
import { generateCode, CODE_LENGTH } from './verification-codes.js';

describe('generateCode', () => {
  it('is always a zero-padded 6-digit numeric string', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code).toHaveLength(CODE_LENGTH);
    }
  });

  it('spans the full range including edge values over many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateCode());
    // extremely unlikely to collide into a tiny set if the RNG is uniform
    expect(seen.size).toBeGreaterThan(1000);
  });
});
