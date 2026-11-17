/**
 * The legends' questions as a player meets them (api/content/stories/legends.json):
 * a bank of twenty, so a second game of a saga is not the first one again; a
 * mix of kinds; no true-or-false item without its third answer (the story does
 * not say); the right option never given away by being the one long option;
 * and every question carried whole into each language the legend is read in,
 * its options in the same order, so a translated reveal names the right one.
 * Each legend is told in both varieties, and both tellings ask the same
 * questions, so neither is the easier game.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUESTION_KINDS } from '@kurda/shared';

interface Translated {
  prompt: string;
  options: string[];
  explanation: string;
}
interface FileQuestion {
  kind: string;
  prompt: string;
  promptEn: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  explanationEn: string;
  translations: Record<string, Translated>;
}
interface FileLegend {
  slug: string;
  dialect: string;
  questions: FileQuestion[];
}

const legends = (JSON.parse(readFileSync(new URL('../../content/stories/legends.json', import.meta.url), 'utf8')) as { stories: FileLegend[] }).stories;

/** How many questions each legend keeps, a game asking only some of them. */
const LEGEND_BANK = 20;

/** The three answers of a true-or-false item, by variety, and how its prompt asks for them. */
const THREE = {
  kurmanci: { options: ['Rast', 'Şaş', 'Çîrok nabêje'], asks: 'Rast, şaş an çîrok nabêje? ' },
  sorani: { options: ['ڕاستە', 'هەڵەیە', 'چیرۆکەکە ناڵێت'], asks: 'ڕاستە، هەڵەیە، یان چیرۆکەکە ناڵێت؟ ' },
} as const;

const isThree = (q: FileQuestion): boolean => Object.values(THREE).some((t) => q.options.length === 3 && t.options.every((o, i) => q.options[i] === o));

/** Whether the right option is the one longest option, which a guesser picks without reading. */
const longestGivesItAway = (q: FileQuestion): boolean => {
  const lengths = q.options.map((o) => [...o].length);
  const longest = Math.max(...lengths);
  return lengths[q.correctIndex] === longest && lengths.filter((l) => l === longest).length === 1;
};

/** The most a legend's right options may be the one long option: about the share chance gives three options. */
const LONGEST_SHARE = 0.4;

describe.each(legends.map((l) => [l.slug, l] as const))('%s', (_slug, legend) => {
  it('keeps a bank of twenty questions of more than one kind, each with three or four options', () => {
    expect(legend.questions).toHaveLength(LEGEND_BANK);
    const kinds = new Set(legend.questions.map((q) => q.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    for (const [i, q] of legend.questions.entries()) {
      expect(QUESTION_KINDS as readonly string[], `q${i}`).toContain(q.kind);
      expect(q.options.length, `q${i}: ${q.prompt}`).toBeGreaterThanOrEqual(3);
      expect(q.options.length, `q${i}: ${q.prompt}`).toBeLessThanOrEqual(4);
      expect(q.correctIndex, `q${i}`).toBeLessThan(q.options.length);
      // two options that read the same would make one of them a free second guess
      expect(new Set(q.options).size, `q${i}: ${q.prompt}`).toBe(q.options.length);
    }
  });

  it('gives a true-or-false item its third answer, asked for in the prompt', () => {
    const three = THREE[legend.dialect as keyof typeof THREE];
    for (const [i, q] of legend.questions.entries()) {
      expect(/^(Rast an şaş\?|ڕاستە یان هەڵە)/u.test(q.prompt), `q${i}: ${q.prompt}`).toBe(false);
      if (!isThree(q)) continue;
      expect(q.options, `q${i}`).toEqual(three.options);
      expect(q.prompt.startsWith(three.asks), `q${i}: ${q.prompt}`).toBe(true);
    }
  });

  it('does not give the right option away by its length', () => {
    const counted = legend.questions.filter((q) => !isThree(q));
    const away = counted.filter(longestGivesItAway);
    expect(away.length / counted.length, away.map((q) => q.prompt).join(' | ')).toBeLessThanOrEqual(LONGEST_SHARE);
  });

  it('carries every question whole into each language, its options in the same order', () => {
    const problems: string[] = [];
    for (const [i, q] of legend.questions.entries()) {
      if (q.translations.en?.prompt !== q.promptEn) problems.push(`q${i}: promptEn is not the English prompt`);
      if (q.translations.en?.explanation !== q.explanationEn) problems.push(`q${i}: explanationEn is not the English explanation`);
      for (const [locale, t] of Object.entries(q.translations)) {
        if (!t.prompt.trim() || !t.explanation.trim()) problems.push(`q${i} ${locale}: empty`);
        if (t.options.length !== q.options.length) problems.push(`q${i} ${locale}: ${t.options.length} options of ${q.options.length}`);
        if (t.options.some((o) => !o.trim())) problems.push(`q${i} ${locale}: an empty option`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('the two tellings of each legend', () => {
  const kurmanci = legends.filter((l) => l.dialect === 'kurmanci');
  it.each(kurmanci.map((l) => [l.slug, l] as const))('%s asks what its Soranî telling asks', (_slug, legend) => {
    // the Soranî telling carries the Kurmancî wording of its questions as its "ku" translation
    const other = legends.find((l) => l.dialect === 'sorani' && l.questions.length === legend.questions.length && l.questions[0]?.translations.ku?.prompt === legend.questions[0]?.prompt);
    expect(other, 'its Soranî telling').toBeDefined();
    legend.questions.forEach((q, i) => {
      const twin = other!.questions[i]!;
      expect(twin.kind, `q${i}`).toBe(q.kind);
      expect(twin.correctIndex, `q${i}`).toBe(q.correctIndex);
      // a question about a word quotes each telling's own word, so only the others read the same
      if (q.kind === 'vocabulary') return;
      expect(twin.translations.ku?.prompt, `q${i}`).toBe(q.prompt);
      expect(q.translations.ckb?.prompt, `q${i}`).toBe(twin.prompt);
    });
  });
});
