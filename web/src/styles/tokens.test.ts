import { describe, expect, it } from 'vitest';
import { HUE_NAMES, hueSteps, type HueScheme, type HueSteps } from '@kurda/shared';

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
