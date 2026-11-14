import type { ProverbList, ProverbView, RiddleAnswer, RiddleCard, RiddleHint, RiddleList } from '@kurda/shared';

/**
 * Riddles and proverbs for the lore screens' tests (kept in a `test` folder,
 * whose English is test data rather than copy), in the shapes the server
 * sends (shared lore.ts). The answer, the hint and the explanation are their
 * own values here, kept apart from the cards, so a test can hand them out
 * only from the calls that send them and then look for them anywhere else.
 */

export const QUESTION = 'Ez dirêj im dema ciwan im, kurt im dema pîr im. Ez çi me?';
export const QUESTION_EN = 'I am tall when I am young and short when I am old. What am I?';

export const HINT: RiddleHint = { index: 0, text: 'Di tariyê de ronahiyê dide.', translations: { en: 'It gives light in the dark.' } };
export const HINT_2: RiddleHint = { index: 1, text: 'Li ser maseyê dişewite.', translations: { en: 'It burns on the table.' } };

export const ANSWER: RiddleAnswer = {
  answer: 'mûm',
  explanation: 'Mûm dema tê pêxistin dişewite û kurt dibe.',
  translations: { en: { answer: 'a candle', explanation: 'Once lit, it burns down and grows shorter.' } },
  tradition: 'regional',
  region: 'Behdînan',
  sources: [{ title: 'Mamikên gundê me', url: 'https://example.org/mamik', note: 'Gotin 12' }],
};

/** Every piece of text that would spoil the riddle, as it might be shown. */
export const SPOILERS = [ANSWER.answer, ANSWER.explanation, ANSWER.translations.en!.answer, ANSWER.translations.en!.explanation, HINT.text, HINT.translations.en!, HINT_2.text];

export const card = (over: Partial<RiddleCard> = {}): RiddleCard => ({
  slug: 'kmr-mum',
  dialect: 'kmr',
  difficulty: 'easy',
  category: 'everyday',
  tradition: 'regional',
  region: 'Behdînan',
  question: QUESTION,
  translations: { en: { question: QUESTION_EN } },
  hintCount: 2,
  state: 'new',
  ...over,
});

export const RIDDLES: RiddleList = {
  riddles: [
    card(),
    card({ slug: 'kmr-hive', question: 'Xaniyek heye bê derî, tijî şîrînî ye.', translations: { en: { question: 'A house without a door, full of sweetness.' } }, state: 'solved' }),
    card({ slug: 'kmr-ezman', difficulty: 'hard', category: 'nature', question: 'Bê bask difire, bê çav digirî.', translations: {}, state: 'trying' }),
  ],
  daily: 'kmr-mum',
  solved: 1,
  total: 3,
};

export const proverb = (over: Partial<ProverbView> = {}): ProverbView => ({
  slug: 'kmr-av-dilop',
  dialect: 'kmr',
  text: 'Av dilop dilop dibe gol.',
  themes: ['patience', 'hard-work'],
  tradition: 'traditional',
  region: null,
  variants: [{ text: 'ئاو دڵۆپ دڵۆپ دەبێتە گۆم.', dialect: 'ckb', note: 'the Soranî counterpart' }],
  exampleKu: 'Rêzan her êvar pênc peyvên nû hîn dibe. Dapîra wî dikene.',
  translations: {
    en: {
      translation: 'Drop by drop, water becomes a lake.',
      literal: 'Water becomes a pond drop by drop.',
      meaning: 'Small, steady efforts add up to something big.',
      explanation: 'The picture is a pond filling one drop at a time.',
      example: 'Rêzan learns five new words every evening. His grandmother laughs.',
      equivalent: 'Many a little makes a mickle.',
    },
    de: {
      translation: 'Tropfen für Tropfen wird das Wasser zum See.',
      meaning: 'Kleine, beharrliche Schritte ergeben am Ende etwas Großes.',
      explanation: 'Das Bild ist ein Teich, der sich Tropfen für Tropfen füllt.',
      example: 'Rêzan lernt jeden Abend fünf neue Wörter.',
    },
  },
  sources: [{ title: 'Pirtûka gotinan', author: 'Dapîra Rêzan' }],
  ...over,
});

export const PROVERBS: ProverbList = {
  proverbs: [
    proverb(),
    proverb({
      slug: 'kmr-dost',
      text: 'Dost ew e ku di roja teng de bê.',
      themes: ['friendship', 'trust'],
      tradition: 'new',
      translations: { en: { translation: 'A friend is the one who comes on the hard day.', meaning: 'True friends show up when it matters.', explanation: 'x', example: 'y' } },
    }),
  ],
  themes: ['patience', 'hard-work', 'friendship', 'trust'],
  today: 'kmr-av-dilop',
};
