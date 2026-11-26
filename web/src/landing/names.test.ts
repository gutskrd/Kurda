import { describe, expect, it } from 'vitest';

/*
 * Keyframes and classes are global, and two stylesheets that define the same name override each other wherever both
 * have loaded: the lesson path and the other public pages use `lp-`, so the front page keeps to names of its own,
 * `fp-` for the page and `soon-` for the apps-coming-soon card. Stylesheets are read from disk, since an imported
 * stylesheet arrives empty in tests; the file-system calls are typed here so the browser-typed app cannot reach for them.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
  readdirSync(dir: URL, options: { recursive: true }): string[];
}
const fileSystem = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// kept in a variable, so the build does not take the next line for an asset
const here = import.meta.url;
const src = new URL('../', here);

/** The front page's stylesheets, each with the start every name it defines must have. */
const OWN: Record<string, string> = { 'landing/landing.css': 'fp-', 'landing/soon.css': 'soon-' };
/** What a front-page stylesheet may name besides its own: states, the page's root, and the characters it sizes. */
const BORROWED = /^(is-|has-)|^fp$|^speaking-character$/;
/** Timing words that look like names inside an `animation` value. */
const TIMING = new Set(['ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'jump-start', 'jump-end', 'jump-none', 'jump-both']);

const read = (path: string): string => readFileSync(new URL(path, src), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const keyframes = (css: string): string[] => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
/** Class names in selectors, leaving out the numbers and file names that can follow a dot inside a declaration. */
const classes = (css: string): string[] => {
  const selectors = css.replace(/\{[^{}]*\}/g, '{}');
  return [...new Set([...selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!))];
};
/** The keyframe names an `animation` or `animation-name` declaration plays. */
const played = (css: string): string[] =>
  [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].flatMap((m) =>
    m[1]!
      .replace(/(var|calc|cubic-bezier|steps)\([^()]*(\([^()]*\)[^()]*)*\)/g, ' ')
      .split(/[\s,]+/)
      .filter((word) => /^[a-z][\w-]*-[\w-]+$/.test(word) && !TIMING.has(word)),
  );

/** The shared touch reach names the front page's small controls on purpose, as lib/reach.ts lists them. */
const NAMES_THEM = new Set(['styles/reach.css']);
const others = readdirSync(src, { recursive: true })
  .map((p) => p.split('\\').join('/'))
  .filter((p) => p.endsWith('.css') && !(p in OWN) && !NAMES_THEM.has(p));

describe('the front page’s stylesheets', () => {
  for (const [path, start] of Object.entries(OWN)) {
    const css = read(path);

    it(`names every keyframe in ${path} with ${start}`, () => {
      expect(keyframes(css).length).toBeGreaterThan(0);
      expect(keyframes(css).filter((name) => !name.startsWith(start))).toEqual([]);
    });

    it(`names every class in ${path} with ${start}, but for states and what it borrows`, () => {
      expect(classes(css).filter((name) => !name.startsWith(start) && !BORROWED.test(name))).toEqual([]);
    });

    it(`plays in ${path} only keyframes it defines itself`, () => {
      const own = new Set(keyframes(css));
      expect(played(css).length).toBeGreaterThan(0);
      expect(played(css).filter((name) => !own.has(name))).toEqual([]);
    });
  }

  it('shares none of its names with any other stylesheet in the app', () => {
    expect(others.length).toBeGreaterThan(20);
    const clashes = others.flatMap((path) => {
      const css = read(path);
      const names = [...keyframes(css).map((n) => `@keyframes ${n}`), ...classes(css).map((n) => `.${n}`)];
      return names.filter((n) => /^(@keyframes |\.)(fp|soon)-/.test(n) || n === '.fp').map((n) => `${path}: ${n}`);
    });
    expect(clashes).toEqual([]);
  });
});
