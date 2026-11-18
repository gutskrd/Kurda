import type { QuestionKind, StoryGlossEntry, StoryQuestionTranslation } from '@kurda/shared';
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
  /** by interface language, the options in the order of `options` */
  translations?: Record<string, StoryQuestionTranslation>;
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
  /**
   * Translations by interface language, options in this game's order like `options`. Copied with the question so a
   * mid-game correction does not change it; absent from plans made before translations existed.
   */
  translations?: Record<string, StoryQuestionTranslation>;
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
 * Which questions a game asks, in which order, with options shuffled per game.
 *
 * The order is the HMAC-keyed shuffle the lessons use (`optionOrder`) seeded with the game id, so knowing the game id
 * does not reveal the questions or where the right option sits.
 *
 * Within that, the set is shaped by the research behind Stories:
 * - one overall ("gist") question when the bank has one, asked last;
 * - the rest spread across the text: the bank in text order is cut into one stretch per question, each giving its first
 *   question in the random order;
 * - no kind more than half the questions, and at least one detail question when the bank has one;
 * - asked in text order, the overall question last;
 * - questions the players answered in their last few games of this story (`recent`) ranked after all others, so repeats
 *   come only when the bank runs out.
 *
 * The caller has already checked the bank holds `count` questions.
 */
export function buildPlan(gameId: string, bank: readonly BankQuestion[], count: number, recent: ReadonlySet<string> = new Set()): PlannedQuestion[] {
  const n = Math.min(count, bank.length);
  if (n === 0) return [];
  const rank = new Map<string, number>();
  // a question met lately comes after all the others in the random order, which every choice below follows
  optionOrder(bank.length, `story-plan:${gameId}`).forEach((bankIndex, r) => rank.set(bank[bankIndex]!.id, r + (recent.has(bank[bankIndex]!.id) ? bank.length : 0)));
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

  // one from each stretch of the text, the first in the random order that fits; a stretch holding only questions
  // met lately gives none, and the fill below takes a fresh one from elsewhere first
  for (let s = 0; s < want; s++) {
    const stretch = rest.slice(Math.floor((s * rest.length) / want), Math.floor(((s + 1) * rest.length) / want));
    const pick = stretch.filter((q) => !chosen.includes(q) && fits(q) && !recent.has(q.id)).sort(byRank)[0];
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

/**
 * One question with options in this game's order (`shown[i] = options[order[i]]`), each translation's options in the
 * same order so the right answer has the same index in every language. A translation with a different option count is
 * left out rather than shuffled wrong.
 */
export function planQuestion(gameId: string, q: BankQuestion): PlannedQuestion {
  const order = optionOrder(q.options.length, `${gameId}:${q.id}`);
  const translations: Record<string, StoryQuestionTranslation> = {};
  for (const [locale, t] of Object.entries(q.translations ?? {})) {
    if (!t || !Array.isArray(t.options) || t.options.length !== q.options.length) continue;
    translations[locale] = { prompt: t.prompt, options: order.map((i) => t.options[i]!), ...(t.explanation ? { explanation: t.explanation } : {}) };
  }
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
    translations,
  };
}
