import { describe, expect, it } from 'vitest';

// Every fire in the app burns at a level grown from its streak or run (shared `fireLevel`, `runFireLevel`), never simply lit or not.

/** Node's file system, which this workspace's types do not include: the test reads the sources beside it. */
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

describe('every fire on the phone', () => {
  it('is given a level', () => {
    const fires = sources(SRC).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/<Fire\s([^>]*)\/>/g)].map((m) => ({ file, props: m[1] ?? '' })));
    expect(fires.length).toBeGreaterThanOrEqual(12);
    expect(fires.filter((f) => !/\blevel=\{/.test(f.props)).map((f) => f.file)).toEqual([]);
    expect(fires.filter((f) => /\blit=/.test(f.props)).map((f) => f.file)).toEqual([]);
  });
});
