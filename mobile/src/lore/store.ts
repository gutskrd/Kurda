import type { GameDialect, RiddleAnswer, RiddleCard, RiddleHint } from '@kurda/shared';

/**
 * What the riddle screens hand each other while the app is open, kept in
 * memory and nowhere else.
 *
 *   - the last list of each variety, so a riddle's page knows whether it is
 *     the day's and its answer can offer the next one without asking again;
 *   - an answer once it has been earned (a right guess) or asked for (a
 *     reveal), so the answer screen shows what the server already sent rather
 *     than asking a second time;
 *   - the hints taken, so leaving a riddle and coming back keeps them (the
 *     server keeps a signed-in learner's too, and sends them with the page).
 *
 * Nothing here is ever filled ahead of the learner: an answer arrives only
 * from the call that the learner's own guess or confirmed reveal made.
 */

const lists = new Map<GameDialect, { riddles: RiddleCard[]; daily: string | null }>();
const answers = new Map<string, { answer: RiddleAnswer; solved: boolean; xp: number }>();
const hints = new Map<string, RiddleHint[]>();

export function rememberList(dialect: GameDialect, riddles: RiddleCard[], daily: string | null): void {
  lists.set(dialect, { riddles, daily });
}

export function rememberedList(dialect: GameDialect): { riddles: RiddleCard[]; daily: string | null } | null {
  return lists.get(dialect) ?? null;
}

export function rememberAnswer(slug: string, answer: RiddleAnswer, solved: boolean, xp = 0): void {
  const was = answers.get(slug);
  // a solve is not undone by looking at the answer again afterwards
  answers.set(slug, { answer, solved: solved || (was?.solved ?? false), xp: Math.max(xp, was?.xp ?? 0) });
}

export function rememberedAnswer(slug: string): { answer: RiddleAnswer; solved: boolean; xp: number } | null {
  return answers.get(slug) ?? null;
}

/** The hints taken of a riddle, the server's and this phone's together, each once and in order. */
export function mergeHints(slug: string, from: readonly RiddleHint[]): RiddleHint[] {
  const byIndex = new Map<number, RiddleHint>();
  for (const h of [...(hints.get(slug) ?? []), ...from]) byIndex.set(h.index, h);
  const merged = [...byIndex.values()].sort((a, b) => a.index - b.index);
  hints.set(slug, merged);
  return merged;
}

/**
 * The riddle to offer after this one: the next in the list's own order that
 * is not solved or seen yet, going round to the start; null when every one is.
 */
export function nextRiddle(list: readonly RiddleCard[], slug: string): RiddleCard | null {
  const at = list.findIndex((r) => r.slug === slug);
  for (let step = 1; step <= list.length; step += 1) {
    // a riddle that is not in the list (`at` is -1) starts the walk at the list's first
    const r = list[(at + step) % list.length];
    if (r && r.slug !== slug && (r.state === 'new' || r.state === 'trying')) return r;
  }
  return null;
}

/** Forget everything, between tests. */
export function resetLoreStore(): void {
  lists.clear();
  answers.clear();
  hints.clear();
}
