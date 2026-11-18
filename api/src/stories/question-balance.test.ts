/**
 * Story game questions in the road, Kurmancî and Soranî stories (api/content/stories): no two-answer coin tosses, every
 * true-or-false item has its third answer, each road story asks about its words more than once, and the right option is
 * not the one long option. The legends have their own test.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUESTION_KINDS } from '@kurda/shared';

interface FileQuestion {
  kind: string;
  prompt: string;
  promptEn: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
interface FileStory {
  slug: string;
  dialect: string;
  questions: FileQuestion[];
}

const FILES = ['road', 'kurmanci', 'sorani'] as const;
const stories = (name: (typeof FILES)[number]): FileStory[] =>
  (JSON.parse(readFileSync(new URL(`../../content/stories/${name}.json`, import.meta.url), 'utf8')) as { stories: FileStory[] }).stories;

/** The three answers of a true-or-false item, by variety, and how its prompt asks for them. */
const THREE = {
  kurmanci: { options: ['Rast', 'Şaş', 'Çîrok nabêje'], asks: 'Rast, şaş an çîrok nabêje? ', notSaid: 'Çîrok behsa vê nake.' },
  sorani: { options: ['ڕاستە', 'هەڵەیە', 'چیرۆکەکە ناڵێت'], asks: 'ڕاستە، هەڵەیە، یان چیرۆکەکە ناڵێت؟ ', notSaid: 'چیرۆکەکە باسی ئەمە ناکات.' },
} as const;

const isThree = (q: FileQuestion): boolean => Object.values(THREE).some((t) => t.options.every((o, i) => q.options[i] === o) && q.options.length === 3);

/** Whether the right option is the one longest option, which a guesser picks without reading. */
const longestGivesItAway = (q: FileQuestion): boolean => {
  const lengths = q.options.map((o) => [...o].length);
  const longest = Math.max(...lengths);
  return lengths[q.correctIndex] === longest && lengths.filter((l) => l === longest).length === 1;
};

/** The most a story's right options may be the one long option: about the share chance gives three options. */
const LONGEST_SHARE = 0.4;

/**
 * Stories still to rebalance, with how many questions currently give the answer away by length: counts may fall, never
 * rise, until each is under the share and removed.
 */
const STILL_TO_BALANCE: Readonly<Record<string, number>> = {
  'road-06-nameya-bave-me': 7,
  'road-07-sercopi': 7,
  'road-09-gure-min': 7,
  'road-10-ke-got-bizin': 6,
  'kmr-qelema-sin': 4,
  'kmr-nameya-dapire': 4,
  'kmr-rovi-u-hirc': 7,
  'ckb-a-dress-for-newroz': 7,
  'ckb-the-fox-and-the-old-woman': 8,
  'ckb-the-road-to-the-village': 7,
};

describe.each(FILES)('the %s stories’ questions', (name) => {
  for (const story of stories(name)) {
    describe(story.slug, () => {
      it('are each of a known kind, with three or four options', () => {
        for (const [i, q] of story.questions.entries()) {
          expect(QUESTION_KINDS as readonly string[], `q${i}`).toContain(q.kind);
          expect(q.options.length, `q${i}: ${q.prompt}`).toBeGreaterThanOrEqual(3);
        }
      });

      it('give every true-or-false item its third answer, asked for in the prompt', () => {
        const three = THREE[story.dialect as keyof typeof THREE];
        for (const [i, q] of story.questions.entries()) {
          const twoWay = /^(Rast an şaş\?|ڕاستە یان هەڵە)/u.test(q.prompt);
          expect(twoWay, `q${i}: ${q.prompt}`).toBe(false);
          if (!isThree(q)) continue;
          expect(q.options, `q${i}`).toEqual(three.options);
          expect(q.prompt.startsWith(three.asks), `q${i}: ${q.prompt}`).toBe(true);
          // an item the story never settles says so, in the same words every time
          if (q.correctIndex === 2) expect(q.explanation, `q${i}`).toBe(three.notSaid);
        }
      });

      it('do not give the right option away by its length', () => {
        const counted = story.questions.filter((q) => !isThree(q));
        const away = counted.filter(longestGivesItAway).length;
        const ceiling = STILL_TO_BALANCE[story.slug];
        if (ceiling !== undefined) expect(away, 'still to balance: may fall, never rise').toBeLessThanOrEqual(ceiling);
        else expect(away / counted.length, `${away} of ${counted.length}`).toBeLessThanOrEqual(LONGEST_SHARE);
      });

      if (name === 'road') {
        it('ask about the story’s words at least twice', () => {
          expect(story.questions.filter((q) => q.kind === 'vocabulary').length).toBeGreaterThanOrEqual(2);
        });
      }
    });
  }
});
