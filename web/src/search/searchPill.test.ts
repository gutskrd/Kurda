import { describe, expect, it } from 'vitest';

/*
 * On a phone the bar's search sits in a glass pill, and a backdrop filter makes that pill the box its placed children
 * are laid out in, so the open field and its results would be shut inside the pill. The stylesheet is read from disk,
 * since an imported stylesheet arrives empty in tests.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
const here = import.meta.url;
const shell = readFileSync(new URL('../styles/shell.css', here), 'utf8');

describe('the search in the phone’s pill', () => {
  it('gives up the pill’s blur while open, so the field and results cover the bar rather than the pill', () => {
    const rule = /\.nav-pill:has\(\.nav-search\.is-open\)\s*\{([^}]*)\}/.exec(shell);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/(?:^|[\s;])backdrop-filter:\s*none/);
    expect(rule![1]).toMatch(/-webkit-backdrop-filter:\s*none/);
  });
});
