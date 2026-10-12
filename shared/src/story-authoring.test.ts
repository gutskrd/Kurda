import { describe, expect, it } from 'vitest';
import {
  isStorySlug,
  storySlugFor,
  validateStory,
  type StoryInput,
  type StoryQuestionInput,
  type StoryValidation,
} from './story-authoring.js';
import { countStoryWords, storyLengthFor } from './stories.js';

// a short Kurmancî story (82 words, three paragraphs) with a complete bank:
// nothing in it is wrong, so each test below breaks exactly one thing
const BODY = [
  'Rojîn deh salî ye. Ew li gundekî biçûk dijî. Bavê wê cotkar e û diya wê mamoste ye. Her sibê Rojîn bi birayê xwe re diçe dibistanê.',
  'Rojekê mamosteya wan dibêje: Sibê em ê herin çiyê. Zarok gelek kêfxweş dibin. Rojîn şevê xewa wê nayê, ji ber ku ew li ser rêwîtiyê difikire.',
  'Li çiyê ew kulîlkên sor dibînin. Rojîn çend kulîlkan ji diya xwe re berhev dike. Êvarê ew westiyayî lê dilxweş vedigere malê, û diya wê kulîlkan dixe nav avê.',
].join('\n\n');

function question(over: Partial<StoryQuestionInput> = {}): StoryQuestionInput {
  return {
    kind: 'detail',
    prompt: 'Rojîn çend salî ye?',
    promptEn: 'How old is Rojîn?',
    options: ['Heşt salî', 'Deh salî', 'Diwanzdeh salî'],
    correctIndex: 1,
    explanation: 'Çîrok dibêje: “Rojîn deh salî ye.”',
    explanationEn: 'The story says: “Rojîn is ten years old.”',
    evidenceParagraph: 0,
    evidenceSentence: 0,
    ...over,
  };
}

function story(over: Partial<StoryInput> = {}): StoryInput {
  return {
    dialect: 'kurmanci',
    level: 1,
    title: 'Kulîlkên Sor',
    summary: 'Rojîn bi dibistanê re diçe çiyê.',
    body: BODY,
    glossary: [
      { term: 'cotkar', meanings: { en: 'farmer' } },
      { term: 'kulîlkên sor', meanings: { en: 'red flowers', de: 'rote Blumen' } },
    ],
    questions: [
      question(),
      question({ prompt: 'Bavê Rojînê çi kar dike?', promptEn: 'What does her father do?', options: ['Mamoste ye', 'Cotkar e', 'Bazirgan e'], correctIndex: 1, evidenceSentence: 2 }),
      question({ prompt: 'Mamoste dibêje ew ê herin ku?', promptEn: 'Where will they go?', options: ['Çiyê', 'Bajêr', 'Behrê'], correctIndex: 0, evidenceParagraph: 1, evidenceSentence: 1 }),
      question({ kind: 'vocabulary', prompt: '“Kêfxweş” tê çi wateyê?', promptEn: 'What does “kêfxweş” mean?', options: ['xemgîn', 'dilşad', 'westiyayî'], correctIndex: 1, evidenceParagraph: 1, evidenceSentence: 2 }),
      question({ kind: 'sequence', prompt: 'Rojîn piştî çiyê çi dike?', promptEn: 'What does Rojîn do after the mountain?', options: ['Diçe dibistanê', 'Vedigere malê', 'Radizê'], correctIndex: 1, evidenceParagraph: 2, evidenceSentence: 2 }),
      question({ kind: 'gist', prompt: 'Çîrok li ser çi ye?', promptEn: 'What is the story about?', options: ['Rojeke li çiyê', 'Rojeke li bajêr', 'Rojeke li malê'], correctIndex: 0, evidenceParagraph: null, evidenceSentence: null }),
    ],
    ...over,
  };
}

const codes = (problems: StoryValidation['errors']): string[] => problems.map((p) => p.code);

describe('validateStory', () => {
  it('passes a whole story, at either stage, with nothing to say', () => {
    expect(storyLengthFor('kurmanci', countStoryWords(BODY))).toBe('short');
    expect(validateStory(story())).toEqual({ errors: [], warnings: [] });
    expect(validateStory(story(), 'draft')).toEqual({ errors: [], warnings: [] });
  });

  it('lets a draft be unfinished, and nothing unfinished be submitted or published', () => {
    // no text yet
    const empty = story({ body: '', glossary: [], questions: [] });
    expect(codes(validateStory(empty, 'draft').errors)).toEqual([]);
    expect(codes(validateStory(empty, 'draft').warnings)).toContain('BODY_EMPTY');
    expect(codes(validateStory(empty, 'publish').errors)).toContain('BODY_EMPTY');

    // a text between two lengths (137 words: 17 past short, 13 short of medium), named by the nearest
    const between = story({ body: `${BODY}\n\n${BODY.split('\n\n')[2]} ${BODY.split('\n\n')[1]}` });
    const words = countStoryWords(between.body);
    expect(storyLengthFor('kurmanci', words)).toBeNull();
    const draft = validateStory(between, 'draft');
    expect(codes(draft.errors)).toEqual([]);
    expect(draft.warnings.find((w) => w.code === 'LENGTH_BETWEEN_BANDS')?.message).toBe(
      `${words} words is between the lengths: the nearest is medium (150–250 words)`,
    );
    expect(codes(validateStory(between, 'publish').errors)).toEqual(['LENGTH_BETWEEN_BANDS']);

    // too few questions for a short story
    const few = story({ questions: story().questions.slice(0, 5) });
    expect(codes(validateStory(few, 'draft').warnings)).toContain('BANK_TOO_SMALL');
    expect(codes(validateStory(few, 'draft').errors)).toEqual([]);
    expect(codes(validateStory(few, 'publish').errors)).toEqual(['BANK_TOO_SMALL']);
  });

  it('refuses what is wrong at any stage, even in a draft', () => {
    const broken = story({ title: ' ', questions: [question({ options: ['Erê'] })] });
    for (const stage of ['draft', 'publish'] as const) {
      const { errors } = validateStory(broken, stage);
      expect(codes(errors)).toEqual(expect.arrayContaining(['TITLE_EMPTY', 'OPTIONS_COUNT', 'CORRECT_INDEX']));
    }
  });

  it('checks the limits of the title, summary and text', () => {
    expect(codes(validateStory(story({ title: 'x'.repeat(121) })).errors)).toEqual(['TITLE_TOO_LONG']);
    expect(codes(validateStory(story({ summary: 'x'.repeat(301) })).errors)).toEqual(['SUMMARY_TOO_LONG']);
    expect(codes(validateStory(story({ summary: null })).errors)).toEqual([]);
    expect(codes(validateStory(story({ body: `${BODY} ${'a'.repeat(6000)}` })).errors)).toContain('BODY_TOO_LONG');
    expect(codes(validateStory(story({ level: 4 })).errors)).toEqual(['LEVEL']);
    expect(codes(validateStory(story({ dialect: 'zazaki' as never })).errors)).toEqual(['DIALECT']);
  });

  describe('sentences', () => {
    const withSentence = (sentence: string): StoryInput => story({ body: `${BODY} ${sentence}` });
    const long = (n: number): string => `${'Rojîn '.repeat(Math.ceil(n / 6)).slice(0, n - 1).trim()}.`;

    it('warns about one too long for a 15-second recording and refuses one no recording can hold', () => {
      const soft = validateStory(withSentence(long(200)), 'draft');
      expect(codes(soft.warnings)).toContain('SENTENCE_LONG');
      expect(codes(soft.errors)).toEqual([]);
      const hard = validateStory(withSentence(long(320)), 'draft');
      expect(hard.errors.map((e) => [e.code, e.path])).toContainEqual(['SENTENCE_TOO_LONG', 'body.paragraphs[2]']);
    });

    it('warns about abbreviations and numbered lists, which cut sentences in the wrong place', () => {
      const dr = validateStory(withSentence('Ew diçe cem Dr. Azad.'));
      expect(dr.warnings.find((w) => w.code === 'SENTENCE_ABBREVIATION')?.message).toContain('“dr.”');
      expect(codes(validateStory(withSentence('Nan, penîr, av û hwd.')).warnings)).toContain('SENTENCE_ABBREVIATION');
      expect(codes(validateStory(withSentence('Ev çîrok e.')).warnings)).not.toContain('SENTENCE_ABBREVIATION');

      expect(codes(validateStory(withSentence('1. Nan. 2. Av.')).warnings)).toContain('NUMBERED_LIST');
      const parenthesised = story({ body: `${BODY}\n\n1) Nan bikire û vegere malê.` });
      expect(codes(validateStory(parenthesised, 'draft').warnings)).toContain('NUMBERED_LIST');
      // a number inside a sentence is just a number
      expect(codes(validateStory(withSentence('Ew 3 sêvan dixwe.')).warnings)).not.toContain('NUMBERED_LIST');
    });
  });

  describe('glossary', () => {
    it('refuses a word the reader would never find — matched as the reader matches it', () => {
      const missing = story({ glossary: [{ term: 'pirtûk', meanings: { en: 'book' } }] });
      expect(missing.glossary.length).toBe(1);
      expect(validateStory(missing, 'draft').errors).toEqual([
        { code: 'GLOSS_NOT_IN_TEXT', path: 'glossary[0].term', message: expect.stringContaining('pirtûk') },
      ]);
      // only whole words: "kar" is inside "cotkar", not a word of its own
      expect(codes(validateStory(story({ glossary: [{ term: 'kar', meanings: { en: 'work' } }] })).errors)).toEqual([
        'GLOSS_NOT_IN_TEXT',
      ]);
      // case does not matter, as in the reader
      expect(codes(validateStory(story({ glossary: [{ term: 'COTKAR', meanings: { en: 'farmer' } }] })).errors)).toEqual([]);
    });

    it('finds a Soranî term typed with the Arabic yeh', () => {
      const sorani = story({
        dialect: 'sorani',
        body: 'ژیان لە گوندێکی بچووک دەژی. '.repeat(12).trim(),
        glossary: [{ term: 'گوندێكی', meanings: { en: 'a village' } }],
        questions: [],
      });
      expect(codes(validateStory(sorani, 'draft').errors)).toEqual([]);
    });

    it('refuses repeats, empty meanings, unknown languages and more than twenty words', () => {
      const repeat = story({
        glossary: [
          { term: 'cotkar', meanings: { en: 'farmer' } },
          { term: 'Cotkar ', meanings: { en: 'a farmer' } },
        ],
      });
      expect(codes(validateStory(repeat).errors)).toEqual(['GLOSS_DUPLICATE']);
      expect(codes(validateStory(story({ glossary: [{ term: 'cotkar', meanings: { en: ' ' } }] })).errors)).toEqual([
        'GLOSS_MEANING_EMPTY',
      ]);
      expect(
        codes(validateStory(story({ glossary: [{ term: 'cotkar', meanings: { en: 'farmer', xx: 'Bauer' } }] })).errors),
      ).toEqual(['GLOSS_LOCALE']);
      expect(
        codes(validateStory(story({ glossary: [{ term: 'cotkar', meanings: { en: 'f'.repeat(121) } }] })).errors),
      ).toEqual(['GLOSS_MEANING_TOO_LONG']);
      expect(codes(validateStory(story({ glossary: [{ term: '', meanings: { en: 'x' } }] })).errors)).toEqual(['GLOSS_TERM_EMPTY']);
      const many = Array.from({ length: 21 }, () => ({ term: 'cotkar', meanings: { en: 'farmer' } }));
      expect(codes(validateStory(story({ glossary: many })).errors)).toContain('GLOSSARY_TOO_MANY');
    });
  });

  describe('questions', () => {
    const withQuestion = (over: Partial<StoryQuestionInput>): StoryInput =>
      story({ questions: [...story().questions.slice(1), question(over)] });
    const errorsOf = (over: Partial<StoryQuestionInput>): string[] => codes(validateStory(withQuestion(over)).errors);
    const warningsOf = (over: Partial<StoryQuestionInput>): string[] => codes(validateStory(withQuestion(over)).warnings);

    it('needs a kind, a prompt, and 2 to 4 distinct options with the right one marked', () => {
      expect(errorsOf({ kind: 'trivia' })).toEqual(['QUESTION_KIND']);
      expect(errorsOf({ prompt: '' })).toEqual(['PROMPT_EMPTY']);
      expect(errorsOf({ prompt: 'x'.repeat(301) })).toEqual(['PROMPT_TOO_LONG']);
      expect(errorsOf({ promptEn: 'x'.repeat(301) })).toEqual(['PROMPT_EN_TOO_LONG']);
      expect(errorsOf({ options: ['a', 'b', 'c', 'd', 'e'] })).toEqual(['OPTIONS_COUNT']);
      expect(errorsOf({ options: ['Deh salî', ' deh  SALÎ '] })).toEqual(['OPTIONS_REPEAT']);
      expect(errorsOf({ options: ['Deh salî', ''] })).toEqual(['OPTION_EMPTY']);
      expect(errorsOf({ options: ['Deh salî', 'x'.repeat(161)] })).toContain('OPTION_TOO_LONG');
      expect(errorsOf({ correctIndex: 3 })).toEqual(['CORRECT_INDEX']);
      expect(errorsOf({ correctIndex: -1 })).toEqual(['CORRECT_INDEX']);
      // true / false is fine
      expect(errorsOf({ options: ['Erê', 'Na'], correctIndex: 0 })).toEqual([]);
    });

    it('keeps an explanation to one line', () => {
      expect(errorsOf({ explanation: 'x'.repeat(161) })).toEqual(['EXPLANATION_TOO_LONG']);
      expect(errorsOf({ explanationEn: 'x'.repeat(161) })).toEqual(['EXPLANATION_TOO_LONG']);
      expect(warningsOf({ explanation: 'x'.repeat(130) })).toEqual(['EXPLANATION_LONG']);
      expect(errorsOf({ explanation: null, explanationEn: null })).toEqual([]);
    });

    it('points its evidence at a paragraph and sentence the text has', () => {
      expect(errorsOf({ evidenceParagraph: 3, evidenceSentence: null })).toEqual(['EVIDENCE_PARAGRAPH']);
      expect(errorsOf({ evidenceParagraph: 0, evidenceSentence: 4 })).toEqual(['EVIDENCE_SENTENCE']);
      expect(errorsOf({ evidenceParagraph: null, evidenceSentence: 0 })).toEqual(['EVIDENCE_SENTENCE']);
      expect(errorsOf({ evidenceParagraph: 2, evidenceSentence: 2 })).toEqual([]);
      // a detail question with nothing to show at the reveal is allowed, and noted
      expect(warningsOf({ evidenceParagraph: null, evidenceSentence: null })).toEqual(['EVIDENCE_MISSING']);
    });

    it('notes a missing English prompt and an option that gives itself away', () => {
      expect(warningsOf({ promptEn: null })).toEqual(['PROMPT_EN_MISSING']);
      expect(warningsOf({ options: ['Deh', 'Heşt', 'Ew deh salî ye, wek ku çîrok dibêje'], correctIndex: 2 })).toEqual([
        'OPTION_MUCH_LONGER',
      ]);
      expect(warningsOf({ options: ['Erê', 'Na'], correctIndex: 0 })).toEqual([]);
    });

    it('notes a bank without a gist, with one kind everywhere, or with the answer always in one place', () => {
      const bank = story().questions;
      const noGist = story({ questions: bank.map((q) => (q.kind === 'gist' ? { ...q, kind: 'inference', evidenceParagraph: 2 } : q)) });
      expect(codes(validateStory(noGist).warnings)).toEqual(['NO_GIST']);

      const vocabulary = story({ questions: bank.map((q, i) => (i < 4 ? { ...q, kind: 'vocabulary' } : q)) });
      expect(validateStory(vocabulary).warnings).toEqual([
        { code: 'KIND_DOMINANT', path: 'questions', message: '4 of 6 questions are vocabulary questions; mix the kinds' },
      ]);

      const same = story({ questions: bank.map((q) => ({ ...q, options: ['A a', 'B b', 'C c'], correctIndex: 0 })) });
      expect(codes(validateStory(same).warnings)).toEqual(['ANSWER_SAME_POSITION']);
      // two questions is too few to call anything a pattern
      expect(codes(validateStory(story({ questions: same.questions.slice(0, 2) }), 'draft').warnings)).not.toContain(
        'ANSWER_SAME_POSITION',
      );
    });

    it('caps the bank', () => {
      const many = Array.from({ length: 31 }, (_, i) => question({ correctIndex: i % 3 }));
      expect(codes(validateStory(story({ questions: many })).errors)).toEqual(['BANK_TOO_LARGE']);
    });
  });
});

describe('storySlugFor', () => {
  it('spells a Kurmancî title in plain letters', () => {
    expect(storySlugFor('Qelema Şîn', 'kurmanci')).toBe('qelema-sin');
    expect(storySlugFor('  Çîroka Rovî û Hirç!  ', 'kurmanci')).toBe('ciroka-rovi-u-hirc');
    expect(storySlugFor('Newroz — 2026', 'kurmanci')).toBe('newroz-2026');
    expect(storySlugFor('Café', 'kurmanci')).toBe('cafe');
    const long = storySlugFor(`${'Dapîr '.repeat(13)}x`, 'kurmanci');
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('-')).toBe(false);
    expect(isStorySlug(long)).toBe(true);
  });

  it('gives a Soranî title, or one too short to spell, a placeholder to edit', () => {
    const zero = () => 0;
    expect(storySlugFor('کلیلی ماڵەوە', 'sorani', zero)).toBe('sorani-aaaaaa');
    expect(storySlugFor('کلیلی ماڵەوە', 'sorani')).toMatch(/^sorani-[a-z2-9]{6}$/);
    expect(storySlugFor('Av', 'kurmanci', zero)).toBe('kurmanci-aaaaaa');
    expect(storySlugFor('!!!', 'kurmanci')).toMatch(/^kurmanci-[a-z2-9]{6}$/);
  });

  it('checks a slug the way the table does', () => {
    expect(isStorySlug('qelema-sin')).toBe(true);
    expect(isStorySlug('ab')).toBe(false);
    expect(isStorySlug('Qelema')).toBe(false);
    expect(isStorySlug('qelema_sin')).toBe(false);
    expect(isStorySlug(42)).toBe(false);
  });
});
