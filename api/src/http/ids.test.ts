import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { lowerUuid } from './ids.js';

describe('lowerUuid', () => {
  const id = '1f0e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';

  it('reads a uuid in any letter case as its one lower-case spelling', () => {
    expect(lowerUuid().parse(id.toUpperCase())).toBe(id);
    expect(lowerUuid().parse('1F0e2D3c-4b5A-4968-8776-A5b4C3d2E1f0')).toBe(id);
    expect(z.array(lowerUuid()).parse([id, id.toUpperCase()])).toEqual([id, id]);
  });

  it('refuses anything that is not a uuid', () => {
    expect(lowerUuid().safeParse('not-a-uuid').success).toBe(false);
    expect(lowerUuid().safeParse(`${id}0`).success).toBe(false);
  });
});
