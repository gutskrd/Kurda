/**
 * Fixtures for the riddle and proverb tests. The hint, answer and explanation are marked words found nowhere else,
 * so finding one anywhere on the page means it leaked.
 */
import type { ProverbView, RiddleAnswer, RiddleCard, RiddleDetail, RiddleHint, RiddleList } from '@kurda/shared';

export const SECRET = {
  hint: 'HINTWORD tê de ye',
  hintEn: 'HINTWORD-EN it is inside',
  answer: 'ANSWERWORD',
  answerEn: 'ANSWERWORD-EN',
  explanation: 'EXPLAINWORD ji ber ku',
  explanationEn: 'EXPLAINWORD-EN because',
} as const;

export function riddleCard(over: Partial<RiddleCard> = {}): RiddleCard {
  return {
    slug: 'kmr-sih',
    dialect: 'kmr',
    difficulty: 'easy',
    category: 'nature',
    tradition: 'traditional',
    region: null,
    question: 'Bi te re tê, lê qet nayê girtin. Ew çi ye?',
    translations: { en: { question: 'It comes with you, but can never be caught. What is it?' }, de: { question: 'Es geht mit dir, lässt sich aber nie fangen. Was ist es?' } },
    hintCount: 2,
    state: 'new',
    ...over,
  };
}

export function riddleDetail(over: Partial<RiddleDetail> = {}): RiddleDetail {
  return { ...riddleCard(), hintsUsed: [], ...over };
}

export function riddleHint(index: number): RiddleHint {
  return { index, text: `${SECRET.hint} ${index + 1}`, translations: { en: `${SECRET.hintEn} ${index + 1}` } };
}

export function riddleAnswer(over: Partial<RiddleAnswer> = {}): RiddleAnswer {
  return {
    answer: SECRET.answer,
    explanation: SECRET.explanation,
    translations: { en: { answer: SECRET.answerEn, explanation: SECRET.explanationEn } },
    tradition: 'traditional',
    region: 'Botan',
    sources: [{ title: 'Metelokên Kurdî', author: 'A. Collector', url: 'https://example.org/metelok', note: 'as told there' }],
    ...over,
  };
}

export function riddleList(over: Partial<RiddleList> = {}): RiddleList {
  const riddles = [
    riddleCard(),
    riddleCard({ slug: 'kmr-hek', question: 'Mala min a spî ye, derî tune ye.', translations: { en: { question: 'My house is white and has no door.' } }, state: 'solved' }),
    riddleCard({ slug: 'kmr-sterk', difficulty: 'hard', category: 'logic', question: 'Bi şev tên, bi roj diçin.', translations: {}, state: 'revealed' }),
  ];
  return { riddles, daily: 'kmr-hek', solved: 1, total: riddles.length, ...over };
}

export function proverb(over: Partial<ProverbView> = {}): ProverbView {
  return {
    slug: 'kmr-av-dilop-dilop',
    dialect: 'kmr',
    text: 'Av dilop dilop dibe gol.',
    themes: ['patience', 'hard-work'],
    tradition: 'traditional',
    region: null,
    variants: [{ text: 'ئاو دڵۆپ دڵۆپ دەبێتە گۆم.', dialect: 'ckb', note: 'the Soranî form' }],
    exampleKu: 'Rêzan her êvar pênc peyvên nû hîn dibe.',
    translations: {
      en: {
        translation: 'Drop by drop, water becomes a lake.',
        literal: 'Water becomes a pond drop by drop.',
        meaning: 'Small, steady efforts add up to something big.',
        explanation: 'The picture is a pond filling one drop at a time.',
        example: 'Rêzan learns five new words every evening.',
        equivalent: 'Many a little makes a mickle.',
        context: 'Said to someone who feels their effort is pointless.',
      },
    },
    sources: [{ title: 'Gotinên Pêşiyan' }],
    ...over,
  };
}
