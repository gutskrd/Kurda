import { describe, expect, it } from 'vitest';
import { PATH_REST, PATH_STOP_TONES, UNIT_TONES } from '@kurda/shared';

/*
 * The road's colours in path.css, held to the shared ones the drawings and the phone use (@kurda/shared
 * PATH_STOP_TONES and PATH_REST). The stylesheet is read from disk, since an imported one is empty in tests.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
const here = import.meta.url;
const css = readFileSync(new URL('path.css', here), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** What the rule for exactly `selector` declares, by custom property. */
function declared(selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim().toLowerCase()]));
}

describe('the road’s colours in its stylesheet', () => {
  it('gives every unit its own shared colour, by night and by day', () => {
    for (const tone of UNIT_TONES) {
      for (const [selector, scheme] of [[`.lp-tone-${tone}`, 'dark'], [`:root[data-theme='light'] .lp-tone-${tone}`, 'light']] as const) {
        const c = PATH_STOP_TONES[scheme][tone];
        expect(declared(selector), selector).toEqual({ '--u-fill': c.fill, '--u-lip': c.lip, '--u-ink': c.ink, '--u-text': c.text });
      }
    }
  });

  it('draws what is not open yet in the shared flat slate', () => {
    for (const [selector, scheme] of [['.lp', 'dark'], [":root[data-theme='light'] .lp", 'light']] as const) {
      const block = declared(selector);
      expect(block['--lp-rest'], selector).toBe(PATH_REST[scheme].fill);
      expect(block['--lp-rest-lip'], selector).toBe(PATH_REST[scheme].lip);
      expect(block['--lp-rest-ink'], selector).toBe(PATH_REST[scheme].ink);
      expect(block['--lp-line'], selector).toBe(PATH_REST[scheme].line.replace(/,/g, ', ').toLowerCase());
    }
  });

  it('keeps every motion of the road for those who have not asked for less', () => {
    for (const name of ['lp-swing', 'lp-float', 'lp-shiver', 'lp-bob', 'lp-crumb', 'lp-toss', 'lp-flap', 'lp-coin', 'lp-creak', 'lp-leaf']) {
      const used = [...css.matchAll(new RegExp(`animation:[^;]*\\b${name}\\b`, 'g'))];
      expect(used.length, name).toBeGreaterThan(0);
      for (const m of used) {
        // Inside a block that runs only for them: one opened before it and not yet closed.
        const before = css.slice(0, m.index);
        const open = before.lastIndexOf('@media (prefers-reduced-motion: no-preference)');
        expect(open, name).toBeGreaterThan(-1);
        const between = before.slice(open);
        expect((between.match(/\{/g) ?? []).length - (between.match(/\}/g) ?? []).length, name).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
