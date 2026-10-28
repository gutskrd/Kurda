import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The rules `public/_headers` gives one path pattern, as written under it. */
function block(pattern: string): string | null {
  const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf8');
  return headers.split(`\n${pattern}\n`)[1]?.split('\n\n')[0] ?? null;
}

describe('static file caching', () => {
  it('keeps the files the build names by their content for a year, asking nothing', () => {
    const rules = block('/assets/*');
    expect(rules).not.toBeNull();
    expect(rules).toMatch(/Cache-Control: public, max-age=31536000, immutable/);
  });

  it('gives nothing outside /assets/ a long life: those files keep their names between builds', () => {
    const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf8');
    const immutable = headers.split('\n').filter((line) => /immutable/.test(line) && !line.startsWith('#'));
    expect(immutable).toHaveLength(1);
  });
});
