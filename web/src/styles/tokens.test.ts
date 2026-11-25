import { describe, expect, it } from 'vitest';
import { HUE_NAMES, PAGE, PLUS_STYLE, REWARD_GOLD, THEMES, THEME_NAMES, hueSteps, type HueScheme, type HueSteps } from '@kurda/shared';

/*
 * The shared hues exist in shared/src/hues.ts and as tokens.css `.hue-*` classes, so every class is checked against
 * the steps the interface draws (`hueSteps`, the page's greys) in both schemes. The stylesheet is read from disk, since an imported stylesheet arrives empty in tests;
 * the one file-system call is typed here so the browser-typed app cannot reach for it.
 */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// beside this file, wherever the suite is run from
const here = import.meta.url;
const tokens = readFileSync(new URL('tokens.css', here), 'utf8');
const page = readFileSync(new URL('../../index.html', here), 'utf8');

const STEPS = ['tint', 'wash', 'base', 'deep'] as const satisfies readonly (keyof HueSteps)[];

interface HueRule {
  scheme: HueScheme;
  name: string;
  /** what the rule declares, by custom property */
  values: Record<string, string>;
}

/** What a rule's block declares: `--hue-tint: #FFF;` is `{ '--hue-tint': '#fff' }`. */
function declared(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+);/g)].map((m) => [m[1]!, m[2]!.trim().toLowerCase()]));
}

/** Every `.hue-<name>` rule with its scheme: bare classes are dark, those under the root's `data-theme` light. */
function hueRules(css: string): HueRule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]*\.hue-([a-z]+))\s*\{([^{}]*)\}/g)].map((m) => ({
    scheme: /\[data-theme=['"]light['"]\]/.test(m[1]!) ? 'light' : 'dark',
    name: m[2]!,
    values: declared(m[3]!),
  }));
}

describe('the shared hues in the website’s tokens', () => {
  const rules = hueRules(tokens);

  it('reads the stylesheet as it is written', () => {
    expect(tokens).toContain('--app-bg');
    expect(rules).toHaveLength(HUE_NAMES.length * 2);
  });

  it.each(['dark', 'light'] as const)('has one class for each of the nine hues in the %s scheme, and none the module does not know', (scheme) => {
    const names = rules.filter((r) => r.scheme === scheme).map((r) => r.name);
    expect([...names].sort()).toEqual([...HUE_NAMES].sort());
  });

  it.each(['dark', 'light'] as const)('gives every hue the interface’s four steps in the %s scheme', (scheme) => {
    for (const name of HUE_NAMES) {
      const rule = rules.find((r) => r.scheme === scheme && r.name === name);
      const steps: HueSteps = hueSteps(scheme, name);
      const expected = Object.fromEntries(STEPS.map((step) => [`--hue-${step}`, steps[step].toLowerCase()]));
      expect(rule?.values, `.hue-${name}, ${scheme}`).toEqual(expected);
    }
  });

  it('reads a rule the way the stylesheet writes one, for either scheme', () => {
    // the reading itself, on a sheet whose answer is known: a check that reads nothing would pass for ever
    const sheet = [
      '/* .hue-red { --hue-tint: #000; } */',
      '.hue-green { --hue-tint: #112D1A; --hue-deep: #b4ebc1; }',
      `:root[data-theme='light'] .hue-green { --hue-tint: #e2f8e7; }`,
    ].join('\n');
    expect(hueRules(sheet)).toEqual([
      { scheme: 'dark', name: 'green', values: { '--hue-tint': '#112d1a', '--hue-deep': '#b4ebc1' } },
      { scheme: 'light', name: 'green', values: { '--hue-tint': '#e2f8e7' } },
    ]);
  });
});

/** Every top-level rule's declarations, by its selector as written, comments taken out. */
function rules(css: string): Map<string, Record<string, string>> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map<string, Record<string, string>>();
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim();
    out.set(selector, { ...out.get(selector), ...declared(m[2]!) });
  }
  return out;
}

/** Violet to magenta, in `#rrggbb` or `rgba(r, g, b, a)`: the colours the interface no longer wears. */
function isPurple(colour: string): boolean {
  const rgba = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
  const [r, g, b] = rgba ? [1, 2, 3].map((i) => Number(rgba[i])) : [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
  const max = Math.max(r!, g!, b!);
  const chroma = max - Math.min(r!, g!, b!);
  if (chroma < 8) return false;
  const hue = 60 * (max === r ? ((g! - b!) / chroma + 6) % 6 : max === g ? (b! - r!) / chroma + 2 : (r! - g!) / chroma + 4);
  return hue >= 250 && hue <= 330;
}

describe('the warm page and the colour themes in the website’s tokens', () => {
  const sheet = rules(tokens);
  const dark = sheet.get(':root')!;
  const light = sheet.get(":root[data-theme='light']")!;

  it('sits on the shared warm page, never pure white by day or pure black by night', () => {
    expect(dark['--app-bg']).toBe(PAGE.dark.page.toLowerCase());
    expect(light['--app-bg']).toBe(PAGE.light.page.toLowerCase());
    expect(light['--app-bg']).not.toBe('#ffffff');
    expect(dark['--app-bg']).not.toBe('#000000');
    expect(light['--surface']).toBe(PAGE.light.surface.toLowerCase());
    expect(dark['--surface-solid']).toBe(PAGE.dark.raised.toLowerCase());
  });

  it.each(THEME_NAMES)('gives %s the shared main and second colours, by night and by day', (name) => {
    for (const [selector, scheme] of [[`:root[data-palette='${name}']`, 'dark'], [`:root[data-theme='light'][data-palette='${name}']`, 'light']] as const) {
      const t = THEMES[name][scheme];
      expect(sheet.get(selector), selector).toEqual({
        '--accent': t.primary.toLowerCase(),
        '--accent-hover': t.primaryPressed.toLowerCase(),
        '--accent-ink': t.onPrimary.toLowerCase(),
        '--secondary': t.secondary.toLowerCase(),
        '--secondary-ink': t.onSecondary.toLowerCase(),
        '--secondary-text': t.secondaryText.toLowerCase(),
      });
    }
  });

  it('keeps the main colour out of the schemes themselves, so only a theme sets it', () => {
    for (const block of [dark, light]) expect(Object.keys(block).filter((k) => /^--(accent(-hover|-ink)?|secondary(-ink|-text)?)$/.test(k))).toEqual([]);
  });

  it('gives gold and Hevalo+’s button the shared colours in both schemes', () => {
    for (const [block, scheme] of [[dark, 'dark'], [light, 'light']] as const) {
      expect(block['--gold']).toBe(REWARD_GOLD[scheme].gold.toLowerCase());
      expect(block['--gold-ink']).toBe(REWARD_GOLD[scheme].goldText.toLowerCase());
      expect(block['--on-gold']).toBe(REWARD_GOLD[scheme].onGold.toLowerCase());
      const plus = PLUS_STYLE[scheme];
      expect(block['--plus-fill']).toBe(`linear-gradient(180deg, ${plus.fill[0]}, ${plus.fill[1]})`.toLowerCase());
      expect(block['--plus-edge']).toBe(plus.edge.toLowerCase());
      expect(block['--plus-ink']).toBe(plus.ink.toLowerCase());
    }
  });

  // The browser's bar is coloured before any script runs, so the page's first frame matches the dark default.
  it('colours the browser’s bar with the dark page before the theme is applied', () => {
    expect(/<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(page)?.[1]).toBe(PAGE.dark.page.toLowerCase());
  });

  it('has no violet anywhere in the tokens', () => {
    const colours = tokens.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{6}\b|rgba?\([^)]*\)/gi) ?? [];
    expect(colours.length).toBeGreaterThan(50);
    expect(colours.filter(isPurple)).toEqual([]);
  });
});
