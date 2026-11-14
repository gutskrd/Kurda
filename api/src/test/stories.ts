/**
 * Stories for tests: whole ones (they pass `validateStory` at the publish
 * stage), so a suite can create, publish and read them through the real
 * routes and break one thing at a time.
 */
import { MIN_QUESTION_BANK, type StoryDialect, type StoryLength, type StoryLibraryInput } from '@kurda/shared';

/** Three paragraphs, 82 words: a short Kurmancî story. */
export const KURMANCI_PARAGRAPHS = [
  'Rojîn deh salî ye. Ew li gundekî biçûk dijî. Bavê wê cotkar e û diya wê mamoste ye. Her sibê Rojîn bi birayê xwe re diçe dibistanê.',
  'Rojekê mamosteya wan dibêje: Sibê em ê herin çiyê. Zarok gelek kêfxweş dibin. Rojîn şevê xewa wê nayê, ji ber ku ew li ser rêwîtiyê difikire.',
  'Li çiyê ew kulîlkên sor dibînin. Rojîn çend kulîlkan ji diya xwe re berhev dike. Êvarê ew westiyayî lê dilxweş vedigere malê, û diya wê kulîlkan dixe nav avê.',
];

/** One paragraph of 65 words: a short Soranî story. */
export const SORANI_PARAGRAPHS = ['ژیان لە گوندێکی بچووک دەژی. '.repeat(13).trim()];

/** How many copies of the paragraphs make a text of each length (Kurmancî 82 / 164 / 328 / 656 words, Soranî 65 / 130 / 260 / 520). */
const COPIES: Record<StoryLength, number> = { short: 1, medium: 2, long: 4, saga: 8 };

export interface TestQuestion {
  kind: string;
  prompt: string;
  promptEn: string | null;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  explanationEn: string | null;
  evidenceParagraph: number | null;
  evidenceSentence: number | null;
  /** by interface language, as `StoryQuestionInput` carries them */
  translations?: Record<string, { prompt: string; options: string[]; explanation?: string }>;
}

export interface TestStory extends StoryLibraryInput {
  slug: string;
  dialect: StoryDialect;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  glossary: Array<{ term: string; meanings: Record<string, string> }>;
  questions: TestQuestion[];
}

/** The two section headings of a test saga, per variety. */
export const SAGA_HEADINGS: Record<StoryDialect, [string, string]> = {
  kurmanci: ['## Beşa yekem', '## Beşa duyem'],
  sorani: ['## بەشی یەکەم', '## بەشی دووەم'],
};

const KINDS = ['detail', 'vocabulary', 'detail', 'sequence', 'inference'];

/** A bank of `n` questions: mixed kinds, the answer moving around, a gist question last. */
export function testBank(n: number, tag = ''): TestQuestion[] {
  return Array.from({ length: n }, (_, i) => {
    const gist = i === n - 1;
    return {
      kind: gist ? 'gist' : KINDS[i % KINDS.length]!,
      prompt: `Pirs ${i + 1}${tag}?`,
      promptEn: `Question ${i + 1}?`,
      options: [`Yek ${i}`, `Du ${i}`, `Sê ${i}`],
      correctIndex: i % 3,
      explanation: 'Çîrok wiha dibêje.',
      explanationEn: 'The story says so.',
      evidenceParagraph: gist ? null : 0,
      evidenceSentence: gist ? null : 0,
    };
  });
}

/** A story that can be published as it is: filed under a seeded category, written for learners. */
export function testStory(
  slug: string,
  over: Partial<TestStory> & { length?: StoryLength } = {},
): TestStory {
  const { length = 'short', ...rest } = over;
  const dialect = rest.dialect ?? 'kurmanci';
  const paragraphs = dialect === 'sorani' ? SORANI_PARAGRAPHS : KURMANCI_PARAGRAPHS;
  const copies = Array.from({ length: COPIES[length] }, () => paragraphs.join('\n\n'));
  // a saga is told in sections: the first copy is its introduction, and each half of the rest opens with a heading
  const [first, second] = SAGA_HEADINGS[dialect];
  const parts = length === 'saga' ? [copies[0]!, first, ...copies.slice(1, 4), second, ...copies.slice(4)] : copies;
  const body = parts.join('\n\n');
  return {
    slug,
    dialect,
    level: 1,
    title: `Çîrok ${slug}`,
    summary: 'Kurteya çîrokê.',
    body,
    glossary: dialect === 'sorani' ? [] : [{ term: 'cotkar', meanings: { en: 'farmer' } }],
    questions: testBank(MIN_QUESTION_BANK[length]),
    language: 'ku',
    category: 'folktale',
    tradition: 'original',
    author: null,
    source: null,
    sourceUrl: null,
    attributionNote: null,
    translations: {},
    cover: null,
    readingMinutes: null,
    ...rest,
  };
}
