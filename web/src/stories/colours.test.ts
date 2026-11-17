import { describe, expect, it } from 'vitest';

/*
 * The stories' colours, by one rule the phone keeps too: gold is for what is
 * earned; the violet is for what can be pressed, is chosen, is on, or says
 * "look at this"; and progress along a road is violet.
 *
 * The suite draws no styles, and a stylesheet a test imports arrives empty, so
 * the rules are read from the disk as they are written, the way
 * styles/tokens.test.ts reads the hues. The one thing asked of the machine
 * the test runs on is described here in full.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// the stylesheets beside this folder, wherever the suite is run from: written as `new URL('…', import.meta.url)`, the
// build would take the path for an asset of its own and hand back its address, not the file
const here = import.meta.url;
const sheet = (name: string): string => readFileSync(new URL(`../styles/${name}`, here), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const stories = sheet('stories.css');
const pages = sheet('pages.css');

/** Every rule of a sheet: its selectors, one by one, and what it declares. */
function rules(css: string): { selectors: string[]; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.split(',').map((s) => s.trim()), body: m[2]! }));
}

/** What the rules for exactly this selector declare, as one string. */
function declared(css: string, selector: string): string {
  const found = rules(css).filter((r) => r.selectors.includes(selector));
  expect(found, selector).not.toHaveLength(0);
  return found.map((r) => r.body).join(' ');
}

describe('the stories’ colours', () => {
  it('give a level the quiet pill: the control’s track and the secondary ink', () => {
    const level = declared(stories, '.story-cefr');
    expect(level).toMatch(/background:\s*var\(--surface-2\)/);
    expect(level).toMatch(/color:\s*var\(--ink-3\)/);
  });

  it('draw a bookmark, a saved word and a read chapter’s tick that are on in the violet, in the library, the reader and the dictionary', () => {
    for (const on of ['.story-card-bookmark.is-on', '.story-overview-bookmark.is-on', '.story-save.is-on', '.story-contents-mark']) {
      expect(declared(stories, on), on).toMatch(/color:\s*var\(--primary\)/);
    }
    expect(declared(pages, '.dict-save.is-on')).toMatch(/color:\s*var\(--primary\)/);
  });

  it('draw how far the reading has come in the violet: the ring, a card’s hairline, the chapters read', () => {
    expect(declared(stories, '.story-progress-ring-fill')).toMatch(/stroke:\s*var\(--primary\)/);
    expect(declared(stories, '.story-card-progress > span')).toMatch(/background:\s*var\(--primary\)/);
    expect(declared(stories, '.story-contents-bar > li.is-read')).toMatch(/background:\s*var\(--primary\)/);
  });

  it('underline a glossary word in the violet, and lay the violet’s own wash behind the sentence being read', () => {
    expect(declared(stories, '.story-gloss')).toMatch(/text-decoration-color:\s*var\(--primary\)/);
    expect(declared(stories, '.story-sentence.is-reading')).toMatch(/background:\s*var\(--hue-wash\)/);
  });

  it('keep the gold for what is earned, and out of the library and the reader', () => {
    const golden = rules(stories)
      .filter((r) => /--gold/.test(r.body))
      .flatMap((r) => r.selectors);
    expect(golden).toEqual(expect.arrayContaining(['.story-check-best', '.sg-xp']));
    for (const selector of golden) {
      expect(selector).not.toMatch(/\.story-(cefr|narrated|card|overview|continue|progress|resume|sentence|replay|gloss|para|save|contents|player)/);
    }
  });
});
