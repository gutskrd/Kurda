import { describe, expect, it } from 'vitest';
import { ICON_WEIGHTS, trimIconWeights } from './iconWeights';

/** The installed icon modules, read from disk as the build reads them. */
interface FileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
// beside this file, wherever the suite is run from
const here = import.meta.url;
const defs = (name: string): string => readFileSync(new URL(`../../../node_modules/@phosphor-icons/react/dist/defs/${name}.es.js`, here), 'utf8');

/** The weight keys a module's map still has, in order. */
const weightsIn = (code: string): string[] => [...code.matchAll(/\[\s*"(\w+)",/g)].map((m) => m[1]!);

/** Whether every bracket in the source closes, outside string literals. */
function balanced(code: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ']': '[', ')': '(', '}': '{' };
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (c === '"') {
      for (i++; code[i] !== '"'; i++) if (code[i] === '\\') i++;
    } else if ('[({'.includes(c)) stack.push(c);
    else if (c in pairs && stack.pop() !== pairs[c]) return false;
  }
  return stack.length === 0;
}

describe('trimIconWeights', () => {
  it.each(['Check', 'Gear', 'Heart', 'BookmarkSimple', 'Star'])('keeps only the weights the app draws in %s', (name) => {
    const code = defs(name);
    const out = trimIconWeights(code);
    expect(out).not.toBeNull();
    expect(weightsIn(out!)).toEqual(['bold', 'fill', 'regular']);
    expect(balanced(out!)).toBe(true);
    expect(out!.length).toBeLessThan(code.length * 0.75);
  });

  it('keeps every drawn weight’s drawing exactly as it was', () => {
    const code = defs('Heart');
    const out = trimIconWeights(code)!;
    for (const weight of ICON_WEIGHTS) {
      const entry = new RegExp(`\\[\\s*"${weight}",[\\s\\S]*?\\n  \\]`).exec(code)![0];
      expect(out).toContain(entry);
    }
  });

  it('leaves a module it does not recognise alone', () => {
    expect(trimIconWeights('export default 1;')).toBeNull();
    // A map missing a weight the app draws is not trimmed, so nothing that was there goes missing.
    expect(trimIconWeights('const a = new Map([\n  [\n    "thin",\n    x()\n  ],\n  [\n    "bold",\n    y()\n  ]\n]);')).toBeNull();
  });
});
