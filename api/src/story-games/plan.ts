import type { QuestionKind, StoryGlossEntry } from '@kurda/shared';
import { optionOrder } from '../content/exercises.js';

/** A question from a story's bank, as the plan builder reads it. */
export interface BankQuestion {
  id: string;
  /** authoring order */
  position: number;
  kind: QuestionKind;
  prompt: string;
  promptEn: string | null;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  explanationEn: string | null;
  evidenceParagraph: number | null;
  evidenceSentence: number | null;
}

/** A question as this game asks it: options in the game's order, the answer remapped. */
export interface PlannedQuestion {
  questionId: string;
  kind: QuestionKind;
  prompt: string;
  promptEn: string | null;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  explanationEn: string | null;
  evidenceParagraph: number | null;
  evidenceSentence: number | null;
}

/** The text a game was played on, frozen when its questions were built. */
export interface StorySnapshot {
  slug: string;
  title: string;
  summary: string | null;
  wordCount: number;
  paragraphs: string[];
  glossary: StoryGlossEntry[];
}

// where in the text a question points: by its evidence, else where it was written
function textPosition(q: BankQuestion): [number, number, number] {
  return [q.evidenceParagraph ?? Number.MAX_SAFE_INTEGER, q.evidenceSentence ?? 0, q.position];
}

function byTextPosition(a: BankQuestion, b: BankQuestion): number {
  const pa = textPosition(a);
  const pb = textPosition(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

/**
 * Which questions a game asks, in which order, with each question's options
 * shuffled for this game.
 *
 * The choice is random but cannot be reproduced outside the server: it is the
 * HMAC-keyed order the lessons shuffle with (`optionOrder`), seeded with the
 * game id, so a player who knows the game id still cannot work out which
 * questions are coming or where the right option sits.
 *
 * Within that randomness the research behind Stories shapes the set:
 * - one overall ("gist") question when the bank has one, asked last, after the
 *   details have been met;
 * - the rest spread across the text rather than bunched in one paragraph: the
 *   bank in text order is cut into as many stretches as there are questions,
 *   and each stretch gives its first question in the random order;
 * - no one kind more than half the questions, and at least one detail question
 *   when the bank has one, so a game is not four vocabulary items;
 * - asked in the order of the text, the overall question last.
 *
 * The caller has already checked the bank holds `count` questions.
 */
export function buildPlan(gameId: string, bank: readonly BankQuestion[], count: number): PlannedQuestion[] {
  const n = Math.min(count, bank.length);
  if (n === 0) return [];
  const rank = new Map<string, number>();
  optionOrder(bank.length, `story-plan:${gameId}`).forEach((bankIndex, r) => rank.set(bank[bankIndex]!.id, r));
  const byRank = (a: BankQuestion, b: BankQuestion) => rank.get(a.id)! - rank.get(b.id)!;

  // the overall question, if there is one and room for more than it
  const gist = n >= 2 ? [...bank].filter((q) => q.kind === 'gist').sort(byRank)[0] : undefined;
  const rest = bank.filter((q) => q !== gist).sort(byTextPosition);
  const want = n - (gist ? 1 : 0);
  const cap = Math.ceil(n / 2);

  const chosen: BankQuestion[] = [];
  const kindCount = new Map<QuestionKind, number>();
  const fits = (q: BankQuestion) => q.kind === 'gist' || (kindCount.get(q.kind) ?? 0) < cap;
  const take = (q: BankQuestion) => {
    chosen.push(q);
    kindCount.set(q.kind, (kindCount.get(q.kind) ?? 0) + 1);
  };

  // one from each stretch of the text, the first in the random order that fits
  for (let s = 0; s < want; s++) {
    const stretch = rest.slice(Math.floor((s * rest.length) / want), Math.floor(((s + 1) * rest.length) / want));
    const pick = stretch.filter((q) => !chosen.includes(q) && fits(q)).sort(byRank)[0];
    if (pick) take(pick);
  }
  // stretches whose questions were all of a kind already at its cap: fill from
  // anywhere, keeping the cap if possible and dropping it only if it cannot be kept
  for (const keepCap of [true, false]) {
    for (const q of [...rest].sort(byRank)) {
      if (chosen.length >= want) break;
      if (!chosen.includes(q) && (!keepCap || fits(q))) take(q);
    }
  }
  // at least one detail question, if the bank has one: it replaces the latest
  // pick of the most-asked kind
  if (!chosen.some((q) => q.kind === 'detail')) {
    const detail = rest.filter((q) => q.kind === 'detail' && !chosen.includes(q)).sort(byRank)[0];
    if (detail && chosen.length) {
      const most = [...kindCount.entries()].filter(([k]) => k !== 'gist').sort((a, b) => b[1] - a[1])[0]?.[0];
      const victims = chosen.filter((q) => q.kind === most).sort(byRank);
      const victim = victims[victims.length - 1];
      if (victim) chosen.splice(chosen.indexOf(victim), 1, detail);
    }
  }

  const ordered = [...chosen].sort(byTextPosition);
  if (gist) ordered.push(gist);
  return ordered.map((q) => planQuestion(gameId, q));
}

/** One question with its options in this game's order: `shown[i] = options[order[i]]`. */
export function planQuestion(gameId: string, q: BankQuestion): PlannedQuestion {
  const order = optionOrder(q.options.length, `${gameId}:${q.id}`);
  return {
    questionId: q.id,
    kind: q.kind,
    prompt: q.prompt,
    promptEn: q.promptEn,
    options: order.map((i) => q.options[i]!),
    correctIndex: order.indexOf(q.correctIndex),
    explanation: q.explanation,
    explanationEn: q.explanationEn,
    evidenceParagraph: q.evidenceParagraph,
    evidenceSentence: q.evidenceSentence,
  };
}
