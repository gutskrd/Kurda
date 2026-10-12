import { describe, expect, it } from 'vitest';
import type { QuestionKind } from '@kurda/shared';
import { buildPlan, planQuestion, type BankQuestion } from './plan.js';

const q = (i: number, kind: QuestionKind, paragraph: number | null = i): BankQuestion => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  position: i,
  kind,
  prompt: `p${i}`,
  promptEn: null,
  options: [`right ${i}`, `wrong ${i} a`, `wrong ${i} b`],
  correctIndex: 0,
  explanation: null,
  explanationEn: null,
  evidenceParagraph: kind === 'gist' ? null : paragraph,
  evidenceSentence: null,
});

const bank: BankQuestion[] = [
  q(0, 'gist'),
  q(1, 'detail', 0),
  q(2, 'vocabulary', 0),
  q(3, 'detail', 1),
  q(4, 'sequence', 1),
  q(5, 'inference', 2),
  q(6, 'detail', 2),
  q(7, 'vocabulary', 3),
  q(8, 'detail', 3),
  q(9, 'vocabulary', 4),
  q(10, 'detail', 4),
  q(11, 'inference', 5),
];

const games = Array.from({ length: 40 }, (_, i) => `game-${i}`);

describe('buildPlan', () => {
  it('asks the right number of questions, none twice, the overall one last', () => {
    for (const id of games) {
      for (const count of [3, 5, 10]) {
        const plan = buildPlan(id, bank, count);
        expect(plan).toHaveLength(count);
        expect(new Set(plan.map((p) => p.questionId)).size).toBe(count);
        expect(plan[count - 1]!.kind).toBe('gist');
        expect(plan.slice(0, -1).some((p) => p.kind === 'gist')).toBe(false);
      }
    }
  });

  it('asks the rest in the order of the text', () => {
    for (const id of games) {
      const plan = buildPlan(id, bank, 5).slice(0, -1);
      const paragraphs = plan.map((p) => p.evidenceParagraph!);
      expect([...paragraphs].sort((a, b) => a - b)).toEqual(paragraphs);
    }
  });

  it('spreads the questions across the text instead of bunching them', () => {
    for (const id of games) {
      const plan = buildPlan(id, bank, 5).slice(0, -1);
      // four questions over six paragraphs: never all from the first half
      expect(Math.max(...plan.map((p) => p.evidenceParagraph!))).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps any one kind to at most half, and always has a detail question', () => {
    const lopsided: BankQuestion[] = [
      q(0, 'gist'),
      ...Array.from({ length: 8 }, (_, i) => q(i + 1, 'vocabulary', i)),
      q(9, 'detail', 8),
      q(10, 'sequence', 9),
      q(11, 'inference', 9),
    ];
    for (const id of games) {
      const plan = buildPlan(id, lopsided, 5);
      expect(plan.filter((p) => p.kind === 'vocabulary').length).toBeLessThanOrEqual(3);
      expect(plan.some((p) => p.kind === 'detail')).toBe(true);
    }
  });

  it('is the same for the same game, and differs between games', () => {
    expect(buildPlan('g1', bank, 5)).toEqual(buildPlan('g1', bank, 5));
    const picks = new Set(games.map((id) => buildPlan(id, bank, 3).map((p) => p.questionId).join()));
    expect(picks.size).toBeGreaterThan(3);
  });

  it('works with a bank of exactly the count, and with no overall question', () => {
    const noGist = bank.slice(1, 6);
    const plan = buildPlan('g', noGist, 5);
    expect(plan.map((p) => p.questionId).sort()).toEqual(noGist.map((b) => b.id).sort());
    expect(plan.some((p) => p.kind === 'gist')).toBe(false);
  });
});

describe('planQuestion', () => {
  it('shuffles the options per game and question, and moves the right answer with them', () => {
    const positions = new Set<number>();
    for (const id of games) {
      const p = planQuestion(id, q(3, 'detail'));
      expect([...p.options].sort()).toEqual([...q(3, 'detail').options].sort());
      expect(p.options[p.correctIndex]).toBe('right 3');
      positions.add(p.correctIndex);
    }
    // the right answer is not always in the same place
    expect(positions.size).toBe(3);
  });
});
