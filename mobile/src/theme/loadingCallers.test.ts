import { describe, expect, it } from 'vitest';

/*
 * The spinner of a page, a list or a row that is waiting is Loading. Written
 * out by hand it was the brand's ink on most screens and the caption's grey
 * on the rest, and said nothing to a screen reader. A spinner in a surface's
 * own ink (a button's label colour, the scrim's) is that surface's to draw.
 */

/** Node's file system, which this workspace's types do not describe: the test reads the sources it runs beside. */
interface Files {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
}
const FILES = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ FILES)) as Files;

const SRC = new URL('..', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

describe('every spinner that waits for a page', () => {
  it('is the one Loading, not a spinner tinted by hand', () => {
    const files = sources(SRC).map((file) => ({ file: file.slice(SRC.length), text: readFileSync(file, 'utf8') }));
    const byHand = files
      .filter(({ file }) => !file.endsWith('theme/Loading.tsx'))
      .filter(({ text }) => /<ActivityIndicator\b[^>]*\bcolor=\{colors\.(primary|textSecondary)\}/.test(text))
      .map(({ file }) => file);
    expect(byHand).toEqual([]);
    expect(files.filter(({ text }) => /<Loading\b/.test(text)).length).toBeGreaterThanOrEqual(30);
  });
});
