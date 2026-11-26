/**
 * The icon weights the app draws (components/icons.tsx). Every Phosphor icon module carries all six of its weights, so
 * the build keeps only these (vite.config.ts); `IconWeightUsed` stops a screen asking for one that would draw nothing.
 */
export const ICON_WEIGHTS = ['regular', 'bold', 'fill'] as const;
export type IconWeightUsed = (typeof ICON_WEIGHTS)[number];

const ALL_WEIGHTS = ['bold', 'duotone', 'fill', 'light', 'regular', 'thin'] as const;

/** Where the bracket opened at `open` closes, stepping over string literals; -1 if it never does. */
function closing(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'") {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++;
      continue;
    }
    if (c === '[' || c === '(' || c === '{') depth++;
    else if (c === ']' || c === ')' || c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * An icon module's source with the entries for weights the app never draws taken out of its weight map, or null to
 * leave the module as it is: when it has none to drop, or does not have the shape this expects.
 */
export function trimIconWeights(code: string): string | null {
  const keep = new Set<string>(ICON_WEIGHTS);
  let out = code;
  let dropped = 0;
  for (const weight of ALL_WEIGHTS) {
    if (keep.has(weight)) continue;
    const at = out.search(new RegExp(`\\[\\s*"${weight}",`));
    if (at < 0) continue;
    const end = closing(out, at);
    if (end < 0) return null;
    const after = /^\s*,/.exec(out.slice(end + 1));
    out = out.slice(0, at) + out.slice(end + 1 + (after ? after[0].length : 0));
    dropped++;
  }
  if (dropped === 0) return null;
  // Every weight drawn must still be there, or the module is left whole.
  for (const weight of ICON_WEIGHTS) if (!new RegExp(`\\[\\s*"${weight}",`).test(out)) return null;
  return out;
}
