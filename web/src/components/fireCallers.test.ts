import { describe, expect, it } from 'vitest';

/*
 * Every fire on the website burns at a level: as big as the streak or the run
 * it stands for has grown it (shared `fireLevel`, `runFireLevel`), never
 * simply lit or not.
 */

const sources = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true });

describe('every fire on the website', () => {
  it('is given a level', () => {
    const fires = Object.entries(sources).flatMap(([file, code]) => [...code.matchAll(/<Fire\s([^>]*)\/>/g)].map((m) => ({ file, props: m[1] ?? '' })));
    expect(fires.length).toBeGreaterThanOrEqual(8);
    expect(fires.filter((f) => !/\blevel=\{/.test(f.props)).map((f) => f.file)).toEqual([]);
    expect(fires.filter((f) => /\blit=/.test(f.props)).map((f) => f.file)).toEqual([]);
  });
});
