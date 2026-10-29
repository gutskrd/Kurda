import { describe, expect, it } from 'vitest';
import type { PromptToken } from '@kurda/shared';
import { lexiconOf, type SessionItem } from './item-words.js';
import { dictionaryKeys, promptTokens, tokenize, wordLangs } from './prompt-tokens.js';
import type { ExerciseType } from './repository.js';

const item = (type: ExerciseType, payload: unknown, dialect = 'kurmanji'): SessionItem => ({ type, payload, dialect, seed: 's1:e1' });

/** The tokens of each item, with the dictionary answering from `dictionary` (by lookup key). */
function tokensOf(items: SessionItem[], dictionary: Record<string, string[]> = {}): Array<PromptToken[] | undefined> {
  const plan = promptTokens(items);
  return plan.finish(plan.lookups.map((l) => dictionary[l.key] ?? []));
}

/** Each word of a token list that has meanings, with them. */
const known = (tokens: PromptToken[] | undefined): Record<string, string[]> =>
  Object.fromEntries((tokens ?? []).flatMap((t) => (t.meanings ? [[t.text, t.meanings]] : [])));

const pairs = (...list: Array<[string, string]>) => item('match_pairs', { pairs: list.map(([left, right]) => ({ left, right })) });

describe('tokenize', () => {
  it('cuts a prompt into words and what lies between them, which joined give it back exactly', () => {
    const prompts = ['“Tu çawa yî?” tê çi wateyê?', 'I’m from Hewlêr — and you?', '«سڵاو» بە ئینگلیزی چییە؟', 'Ez baş im,  spas!', '...', ''];
    for (const prompt of prompts) expect(tokenize(prompt).map((t) => t.text).join('')).toBe(prompt);
    expect(tokenize('“Tu çawa yî?” tê')).toEqual([
      { text: '“', word: false },
      { text: 'Tu', word: true },
      { text: ' ', word: false },
      { text: 'çawa', word: true },
      { text: ' ', word: false },
      { text: 'yî', word: true },
      { text: '?” ', word: false },
      { text: 'tê', word: true },
    ]);
  });

  it('keeps an apostrophe or a hyphen inside a word, and the ZWNJ inside a Soranî one', () => {
    expect(tokenize('I’m well-known').filter((t) => t.word).map((t) => t.text)).toEqual(['I’m', 'well-known']);
    expect(tokenize('نامە‌کە، باشە').filter((t) => t.word).map((t) => t.text)).toEqual(['نامە‌کە', 'باشە']);
  });
});

describe('wordLangs', () => {
  const none = lexiconOf([]);

  it('tells the Kurdish in quotes from the English around it, and the other way round', () => {
    expect(wordLangs('“Ez ji Hewlêrê me.” in English', null, 'kurmanji', none)).toEqual(['ku', 'ku', 'ku', 'ku', 'meaning', 'meaning']);
    expect(wordLangs('"Hello" bi kurdî?', null, 'kurmanji', none)).toEqual(['ku', 'ku', 'ku']);
    expect(wordLangs('What is "nan"?', null, 'kurmanji', none)).toEqual(['meaning', 'meaning', 'meaning']);
    expect(wordLangs('"nan" tê çi wateyê?', null, 'kurmanji', none)).toEqual(['ku', 'ku', 'ku', 'ku']);
  });

  it('takes the language the item gives its prompt, and Soranî by script', () => {
    expect(wordLangs('Bread and water', 'meaning', 'kurmanji', none)).toEqual(['meaning', 'meaning', 'meaning']);
    expect(wordLangs('«سێو» in English', null, 'sorani', none)).toEqual(['ku', 'meaning', 'meaning']);
  });
});

describe('promptTokens', () => {
  it('gives a word the meanings the session pairs it with, either way round', () => {
    const translate = item('translate', { prompt: 'I drink water.', accepted: ['Ez av vedixwim.'] });
    const question = item('multiple_choice', { prompt: '"Sêv" sor e?', options: ['Yes', 'No'], correctIndex: 0 });
    const [tokens, , asked] = tokensOf([translate, pairs(['sêv', 'apple'], ['av', 'water'], ['ez', 'I']), question]);
    expect(tokens!.map((t) => t.text).join('')).toBe('I drink water.');
    expect(known(tokens)).toEqual({ I: ['ez'], water: ['av'] });
    expect(known(asked)).toEqual({ Sêv: ['apple'] });
  });

  it('pairs one-word translations and one-word questions with their answers', () => {
    const translate = item('translate', { prompt: 'bread', accepted: ['nan'] });
    const question = item('multiple_choice', { prompt: '"Şîr"?', options: ['Milk', 'Fire'], correctIndex: 0 });
    const sentence = item('translate', { prompt: 'Bread and milk', accepted: ['Nan û şîr'] });
    expect(known(tokensOf([translate, question, sentence])[2])).toEqual({ Bread: ['nan'], milk: ['Şîr'] });
    // which of a one-word question and its answer is the Kurdish must be told: "Av" and "Water" do not tell
    const untold = item('multiple_choice', { prompt: '"Av"?', options: ['Water', 'Fire'], correctIndex: 0 });
    expect(tokensOf([untold, item('translate', { prompt: 'Bread and water', accepted: ['Nan û av'] })])[1]).toBeUndefined();
  });

  it('looks up each Kurdish word of the session once, and no English one', () => {
    const plan = promptTokens([
      item('multiple_choice', { prompt: '"keç" tê çi wateyê?', options: ['girl', 'boy'], correctIndex: 0 }),
      item('multiple_choice', { prompt: '"kur" tê çi wateyê?', options: ['girl', 'boy'], correctIndex: 1 }),
      item('translate', { say: 'Ez ji Amedê me.', prompt: '“Ez ji Amedê me.” in English', accepted: ['I am from Amed'] }),
      item('translate', { prompt: 'Where is the bread?', accepted: ['Nan li ku ye?'] }),
    ]);
    expect(plan.lookups.map((l) => l.key)).toEqual(['keç', 'tê', 'çi', 'wateyê', 'kur', 'ez', 'ji', 'amedê', 'me']);
    expect(new Set(plan.lookups.map((l) => l.variety))).toEqual(new Set(['kurmanji']));
  });

  it('adds what the dictionary gives after what the session does, each meaning once and three at most', () => {
    const question = item('multiple_choice', { prompt: '"Sêv" sor e?', options: ['Yes', 'No'], correctIndex: 0 });
    const dictionary = { sêv: ['Apple', 'apple tree', 'fruit', 'pome'], sor: ['red'], e: ['is'] };
    const [, tokens] = tokensOf([pairs(['sêv', 'apple'], ['av', 'water']), question], dictionary);
    expect(known(tokens)).toEqual({ Sêv: ['apple', 'apple tree', 'fruit'], sor: ['red'], e: ['is'] });
  });

  it('never gives a word of a multiple-choice question a meaning that is one of its options, or a part of one', () => {
    const question = item('multiple_choice', { say: 'keç', prompt: '"keç" tê çi wateyê?', options: ['girl/daughter', 'boy/son', 'mother'], correctIndex: 0 });
    const newroz = item('multiple_choice', { say: 'Newroz', prompt: '"Newroz" tê çi wateyê?', options: ['Roja nû (the new day)', 'Havîn (summer)'], correctIndex: 0 });
    const dictionary = { keç: ['girl'], tê: ['comes'], çi: ['what'], newroz: ['the new day', 'Kurdish new year'] };
    const [keç, day] = tokensOf([question, newroz, pairs(['dayik', 'mother'])], dictionary);
    expect(known(keç)).toEqual({ tê: ['comes'], çi: ['what'] });
    expect(known(day)).toEqual({ tê: ['comes'], çi: ['what'] });
  });

  it('never gives a word of a translation a meaning that is its whole answer', () => {
    const translate = item('translate', { prompt: 'apple', accepted: ['sêv'] });
    const fromKurdish = item('translate', { say: 'Spas', prompt: 'Spas', accepted: ['Thanks', 'Thank you'] });
    expect(tokensOf([translate, fromKurdish, pairs(['sêv', 'apple'], ['Spas', 'Thanks'])])).toEqual([undefined, undefined, undefined]);
  });

  it('keeps the words of a Soranî course to its own prompts in a practice session', () => {
    const kurmanci = item('translate', { prompt: 'the apple', accepted: ['sêv'] });
    const sentence = item('translate', { prompt: 'the apple is red', accepted: ['sêv sor e'] });
    const sorani = item('match_pairs', { pairs: [{ left: 'سێو', right: 'apple' }, { left: 'سوور', right: 'red' }] }, 'sorani');
    const soraniQuestion = item('multiple_choice', { prompt: '«سێو» بە ئینگلیزی چییە؟', options: ['apple', 'bread'], correctIndex: 0 }, 'sorani');
    const [, tokens, , asked] = tokensOf([kurmanci, sentence, sorani, soraniQuestion]);
    expect(known(tokens)).toEqual({});
    expect(tokens).toBeUndefined();
    expect(asked).toBeUndefined();
    const plan = promptTokens([sorani, soraniQuestion]);
    expect(plan.lookups).toEqual([
      { variety: 'sorani', key: 'سێو' },
      { variety: 'sorani', key: 'بە' },
      { variety: 'sorani', key: 'ئینگلیزی' },
      { variety: 'sorani', key: 'چییە' },
    ]);
  });

  it('gives a Soranî prompt meanings from its pairs and the dictionary, by script', () => {
    const sentence = item('translate', { prompt: 'Apple and bread', accepted: ['سێو و نان'] }, 'sorani');
    const question = item('multiple_choice', { prompt: '«نان» چییە؟', options: ['bread', 'water'], correctIndex: 0 }, 'sorani');
    const [tokens, , asked] = tokensOf([sentence, pairs(['سێو', 'apple'], ['ئاو', 'water']), question], { چییە: ['what is it'] });
    // the pairs here are in a Kurmancî item: a Soranî prompt takes nothing from them
    expect(known(tokens)).toEqual({});
    expect(known(asked)).toEqual({ چییە: ['what is it'] });
    const soraniPairs = item('match_pairs', { pairs: [{ left: 'سێو', right: 'apple' }, { left: 'ئاو', right: 'water' }] }, 'sorani');
    expect(known(tokensOf([sentence, soraniPairs])[0])).toEqual({ Apple: ['سێو'] });
  });

  it('never gives a word itself as its meaning, and sends nothing for a prompt it knows no word of', () => {
    const question = item('multiple_choice', { prompt: 'Hamo çi dike?', options: ['He eats', 'He sleeps'], correctIndex: 0 });
    expect(tokensOf([question, pairs(['Hamo', 'Hamo'], ['av', 'water'])])[0]).toBeUndefined();
    expect(tokensOf([item('listening', { prompt: 'Type what you hear.', accepted: ['av'] }), pairs(['av', 'water'], ['nan', 'bread'])])).toEqual([undefined, undefined]);
  });

  it('reads a word typed on an Arabic or Persian keyboard as the Kurdish letters it stands for', () => {
    expect(dictionaryKeys('كتێب')).toEqual(['كتێب', 'کتێب']);
    expect(dictionaryKeys('Sêv')).toEqual(['sêv']);
  });
});
