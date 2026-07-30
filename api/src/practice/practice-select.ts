/**
 * Practice-session item selection (KUR-034). Pure so the padding rule is
 * unit-testable. Due items are always prioritised; when too few are due,
 * the session is padded with the learner's weakest known words so a review
 * is still worthwhile (edge case: "only 2 due items").
 */

export const PRACTICE_TARGET = 10;
export const PRACTICE_MIN = 4;

export interface SelectOptions {
  target?: number;
  min?: number;
}

export function selectPracticeItems(
  due: string[],
  weak: string[],
  { target = PRACTICE_TARGET, min = PRACTICE_MIN }: SelectOptions = {},
): string[] {
  // enough genuinely-due items → just take them (capped)
  if (due.length >= min) return dedupe(due).slice(0, target);
  // too few due → pad with weakest known words up to the target
  return dedupe([...due, ...weak]).slice(0, target);
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
