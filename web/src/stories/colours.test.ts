import { describe, expect, it } from 'vitest';

/*
 * The stories' colours, by the rule the phone keeps too: gold for what is earned; violet for what can be pressed, is
 * chosen or on, or asks for attention, and for progress. Stylesheets are read from disk, since an imported one is empty
 * in tests (as styles/tokens.test.ts does).
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// The stylesheets beside this folder; a `new URL('…', import.meta.url)` would be bundled as an asset instead of read.
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

  it('run the game’s time bar in the violet, and turn it and the clock red when time is short, as the phone does', () => {
    expect(declared(stories, '.sg-timebar span')).toMatch(/background:\s*var\(--primary\)/);
    expect(declared(stories, '.sg-timebar.is-low span')).toMatch(/background:\s*var\(--danger\)/);
    expect(declared(stories, '.sg-clock.is-low')).toMatch(/color:\s*var\(--danger\)/);
  });

  it('keep the gold for what is earned alone: the best check score, the points, the podium', () => {
    const golden = rules(stories)
      .filter((r) => /--gold/.test(r.body))
      .flatMap((r) => r.selectors);
    expect(golden.sort()).toEqual(['.sg-podium-place', '.sg-podium-step.is-1', '.sg-xp', '.story-check-best']);
  });
});
