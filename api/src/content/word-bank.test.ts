import { describe, expect, it } from 'vitest';
import { tileAnswer } from '@kurda/shared';
import { checkAnswer, gradingKey } from './exercises.js';
import { itemWords, leaning, wordsOf, type SessionItem } from './item-words.js';
import { BANK_MAX_TILES, wordBanks } from './word-bank.js';
import type { ExerciseType } from './repository.js';

const item = (type: ExerciseType, payload: unknown, dialect = 'kurmanji', seed = `s1:${type}:${JSON.stringify(payload).length}`): SessionItem => ({
  type,
  payload,
  dialect,
  seed,
});

/** The places in `bank` of the answer's words, in order: what a learner taps. */
function rightTiles(bank: readonly string[], answer: string): number[] {
  const placed: number[] = [];
  for (const word of wordsOf(answer)) placed.push(bank.findIndex((tile, i) => tile === word && !placed.includes(i)));
  return placed;
}

/** What the tiles that are not the answer's words are. */
const extras = (bank: readonly string[], answer: string): string[] => {
  const right = rightTiles(bank, answer);
  return bank.filter((_, i) => !right.includes(i));
};

const kurmanciPairs = item('match_pairs', {
  pairs: [
    { left: 'sêv', right: 'apple' },
    { left: 'av', right: 'water' },
    { left: 'nan', right: 'bread' },
    { left: 'goşt', right: 'meat' },
  ],
});
const KURDISH = ['sêv', 'av', 'nan', 'goşt'];
const ENGLISH = ['apple', 'water', 'bread', 'meat'];

describe('wordBanks', () => {
  it('lays out the answer words beside Kurdish words from the other items', () => {
    const translate = item('translate', { prompt: 'I am fine', accepted: ['Ez baş im'] });
    const [bank, none] = wordBanks([translate, kurmanciPairs]);
    expect(none).toBeUndefined();
    expect(rightTiles(bank!, 'Ez baş im')).not.toContain(-1);
    const others = extras(bank!, 'Ez baş im');
    expect(others).toHaveLength(4);
    for (const word of others) expect(KURDISH).toContain(word);
  });

  it('is the same every time a session asks, and another session shuffles it again', () => {
    const translate = (seed: string) => item('translate', { prompt: 'I am fine', accepted: ['Ez baş im'] }, 'kurmanji', seed);
    const banks = (seed: string) => wordBanks([translate(seed), kurmanciPairs])[0]!.join(' ');
    expect(banks('session-a:1')).toBe(banks('session-a:1'));
    const seen = new Set(Array.from({ length: 12 }, (_, i) => banks(`session-${i}:1`)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('trims punctuation from the tiles, which joined grade as the answer: capitals, commas and diacritics', () => {
    const payload = { prompt: 'I am fine, thanks.', accepted: ['Ez baş im, spas.'] };
    const [bank] = wordBanks([item('translate', payload), kurmanciPairs]);
    expect(bank).toEqual(expect.arrayContaining(['Ez', 'baş', 'im', 'spas']));
    for (const tile of bank!) expect(tile).not.toMatch(/[.,]/);
    const text = tileAnswer(bank!, rightTiles(bank!, payload.accepted[0]!));
    expect(text).toBe('Ez baş im spas');
    expect(checkAnswer('translate', payload, { text }, 'seed')).toEqual({ verdict: 'correct', accepted: true });
  });

  it('builds a Soranî bank in Arabic script, its punctuation trimmed and no Latin word among it', () => {
    const payload = { prompt: 'I am fine, thanks.', accepted: ['باشم، سوپاس.'] };
    const pairs = item('match_pairs', { pairs: [{ left: 'سێو', right: 'apple' }, { left: 'ئاو', right: 'water' }, { left: 'نان', right: 'bread' }] }, 'sorani');
    const listening = item('listening', { prompt: 'Type what you hear.', accepted: ['ناوم هامۆیە.'] }, 'sorani');
    const [bank, , heard] = wordBanks([item('translate', payload, 'sorani'), pairs, listening]);
    expect(bank).toEqual(expect.arrayContaining(['باشم', 'سوپاس']));
    for (const tile of [...bank!, ...heard!]) expect(tile).toMatch(/^[؀-ۿ‌]+$/);
    expect(bank!.length).toBe(5);
    const text = tileAnswer(bank!, rightTiles(bank!, payload.accepted[0]!));
    expect(checkAnswer('translate', payload, { text }, 'seed')).toEqual({ verdict: 'correct', accepted: true });
  });

  it('keeps a word that is said twice as two tiles, and sets no tile beside it that reads the same', () => {
    const payload = { prompt: 'day by day', accepted: ['Roj bi roj'] };
    const others = item('match_pairs', { pairs: [{ left: 'roj', right: 'day' }, { left: 'şev', right: 'night' }, { left: 'Roj', right: 'Sun' }] });
    const [bank] = wordBanks([item('translate', payload), others]);
    expect(bank!.filter((tile) => gradingKey(tile) === 'roj')).toHaveLength(2);
    expect(extras(bank!, 'Roj bi roj')).toEqual(['şev']);
    expect(checkAnswer('translate', payload, { text: tileAnswer(bank!, rightTiles(bank!, 'Roj bi roj')) }, 'seed').accepted).toBe(true);
  });

  it('never sets an English tile beside a Kurdish answer, nor a Kurdish one beside an English answer', () => {
    const toKurdish = item('translate', { prompt: 'bread and water', accepted: ['nan û av'] });
    const fromKurdish = item('translate', { say: 'Ez ji Amedê me.', prompt: '“Ez ji Amedê me.” in English', accepted: ['I am from Amed'] });
    const conversation = item('conversation', {
      id: 'meet01',
      speakers: [{ character: 'hevalo' }, { character: 'hamo' }],
      lines: [
        { speaker: 0, text: 'Silav! Navê min Hevalo ye.', en: 'Hello! My name is Hevalo.' },
        { speaker: 1, text: 'Tu çawa yî?', en: 'How are you?' },
      ],
      prompt: 'Who speaks first?',
      options: ['Hevalo', 'Hamo'],
      correctIndex: 0,
    });
    const [kurdish, english] = wordBanks([toKurdish, fromKurdish, kurmanciPairs, conversation]);
    for (const word of extras(kurdish!, 'nan û av')) expect(leaning([word])).not.toBe('meaning');
    for (const word of extras(kurdish!, 'nan û av')) expect([...ENGLISH, 'hello', 'my', 'name', 'how', 'are', 'you']).not.toContain(word.toLowerCase());
    for (const word of extras(english!, 'I am from Amed')) expect([...KURDISH, 'silav', 'navê', 'min', 'tu', 'çawa', 'yî', 'ez', 'ji']).not.toContain(word.toLowerCase());
    expect(extras(english!, 'I am from Amed').length).toBeGreaterThan(0);
  });

  it('leaves out every accepted answer word, and a diacritic slip of one', () => {
    const payload = { prompt: 'Thank you', accepted: ['Spas', 'Spas dikim'] };
    const others = item('match_pairs', { pairs: [{ left: 'dikim', right: 'I do' }, { left: 'spas', right: 'x' }, { left: 'Spaş', right: 'y' }, { left: 'sêv', right: 'apple' }] });
    const [bank] = wordBanks([item('translate', payload), others]);
    expect(bank!.sort()).toEqual(['Spas', 'sêv'].sort());
  });

  it('takes three tiles beside one or two words, four beside three to five, five beside six or more, and twelve at most', () => {
    const many = item('match_pairs', { pairs: 'bav dê bira xwişk keç kur mal gund'.split(' ').map((left, i) => ({ left, right: `w${i}` })) });
    const bankOf = (answer: string) => wordBanks([item('translate', { prompt: 'x y', accepted: [answer] }), many])[0]!;
    expect(bankOf('sêv')).toHaveLength(1 + 3);
    expect(bankOf('sêv av')).toHaveLength(2 + 3);
    expect(bankOf('ez sêv av dixwim')).toHaveLength(4 + 4);
    expect(bankOf('ez û tu sêv dixwin îro')).toHaveLength(6 + 5);
    expect(bankOf('ez û tu sêv û av dixwin')).toHaveLength(8 + 4);
    expect(bankOf('ez û tu sêv û av dixwin')).toHaveLength(BANK_MAX_TILES);
    expect(bankOf('ez û tu û ew sêv û av dixwin')).toHaveLength(10 + 2);
    expect(bankOf('ez û tu û ew û em sêv û av dixwin')).toBeUndefined();
  });

  it('sends no bank where the language cannot be told, or there is nothing to set beside one word', () => {
    // a translation read as into Kurdish whose answer is plainly English and prompt plainly Kurdish
    const backwards = item('translate', { prompt: 'Ez ji Amedê me', accepted: ['I am from Amed'] });
    // Arabic script in a Kurmancî course; both scripts in one Soranî answer
    const arabicInKurmanci = item('translate', { prompt: 'apple', accepted: ['سێو'] });
    const mixedInSorani = item('translate', { prompt: 'apple', accepted: ['سێو apple'] }, 'sorani');
    const lone = item('translate', { prompt: 'apple', accepted: ['sêv'] });
    expect(wordBanks([backwards, kurmanciPairs])[0]).toBeUndefined();
    expect(wordBanks([arabicInKurmanci, kurmanciPairs])[0]).toBeUndefined();
    expect(wordBanks([mixedInSorani, item('listening', { accepted: ['نان و ئاو'] }, 'sorani')])[0]).toBeUndefined();
    expect(wordBanks([lone])[0]).toBeUndefined();
    expect(wordBanks([item('translate', { prompt: 'I am fine', accepted: ['Ez baş im'] })])[0]!.sort()).toEqual(['Ez', 'baş', 'im'].sort());
  });

  it('gives no bank to an item answered any other way', () => {
    const others = ['multiple_choice', 'match_pairs', 'writing', 'speaking'] as const;
    const payloads = {
      multiple_choice: { prompt: '"Sêv"?', options: ['Apple', 'Bread'], correctIndex: 0 },
      match_pairs: { pairs: [{ left: 'av', right: 'water' }, { left: 'nan', right: 'bread' }] },
      writing: { prompt: 'Write: I am fine', accepted: ['Ez baş im'] },
      speaking: { prompt: 'Say: hello', reference: 'Silav' },
    };
    expect(wordBanks(others.map((type) => item(type, payloads[type])))).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('draws a practice session tiles only from its items of the same variety', () => {
    const sorani = item('match_pairs', { pairs: [{ left: 'خانوو', right: 'house' }, { left: 'ڕووبار', right: 'river' }] }, 'sorani');
    const fromKurdish = item('translate', { say: 'Sêv', prompt: '“Sêv” in English', accepted: ['the apple'] });
    const [kurmanci, english] = wordBanks([item('translate', { prompt: 'bread and water', accepted: ['nan û av'] }), fromKurdish, sorani]);
    expect(kurmanci!.sort()).toEqual(['av', 'nan', 'Sêv', 'û'].sort());
    // the Soranî course's meanings are not this one's, though both are English
    expect(extras(english!, 'the apple').sort()).toEqual(['and', 'bread', 'water']);
  });
});

describe('itemWords', () => {
  it('reads a translation into Kurdish, and one out of it by its say', () => {
    expect(itemWords('translate', { prompt: 'Thank you', accepted: ['Spas'] }, 'kurmanji')).toMatchObject({
      answer: { text: 'Spas', lang: 'ku' },
      promptLang: 'meaning',
      pairs: [],
    });
    expect(itemWords('translate', { say: 'Spas', prompt: 'Spas', accepted: ['Thanks'] }, 'kurmanji')).toMatchObject({
      answer: { text: 'Thanks', lang: 'meaning' },
      pairs: [{ ku: 'Spas', meaning: 'Thanks' }],
    });
  });

  it('reads the options of a multiple-choice item as Kurdish or as meanings by what it asks', () => {
    const kurdishOptions = itemWords('multiple_choice', { say: 'Silav', prompt: '"Hello" bi kurdî?', options: ['Silav', 'Spas'], correctIndex: 0 }, 'kurmanji');
    expect(kurdishOptions.texts.filter((t) => t.lang === 'ku').map((t) => t.text)).toEqual(['Silav', 'Silav', 'Spas']);
    const meaningOptions = itemWords('multiple_choice', { say: 'keç', prompt: '"keç" tê çi wateyê?', options: ['girl', 'boy'], correctIndex: 0 }, 'kurmanji');
    expect(meaningOptions.texts.filter((t) => t.lang === 'meaning').map((t) => t.text)).toEqual(['girl', 'boy']);
    expect(itemWords('multiple_choice', { prompt: '"Sêv"?', options: ['Apple', 'Bread'], correctIndex: 0 }, 'kurmanji').pairs).toEqual([{ ku: 'Sêv', meaning: 'Apple' }]);
  });
});
