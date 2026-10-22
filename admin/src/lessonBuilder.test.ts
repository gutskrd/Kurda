import { describe, expect, it } from 'vitest';
import { buildCounts, buildExercises, parseWords, type BuildKind } from './lessonBuilder';
import { exerciseIssues } from './lessons';

const ALL = new Set<BuildKind>(['match', 'meaning', 'translate', 'listen', 'speak']);

describe('the words to build from', () => {
  it('reads one a line, Kurdish beside its meaning, however they are separated', () => {
    const { pairs, problems } = parseWords('Silav = Hello\nSpas\tThanks\n\n  Roj baş – Good day  \nTu çawa yî? - How are you?');
    expect(problems).toEqual([]);
    expect(pairs).toEqual([
      { ku: 'Silav', en: 'Hello' },
      { ku: 'Spas', en: 'Thanks' },
      { ku: 'Roj baş', en: 'Good day' },
      { ku: 'Tu çawa yî?', en: 'How are you?' },
    ]);
  });

  it('says which lines it cannot read, and leaves out a word given twice', () => {
    const { pairs, problems } = parseWords('Silav = Hello\nSpas\nsilav = Hi');
    expect(pairs).toEqual([{ ku: 'Silav', en: 'Hello' }]);
    expect(problems).toEqual(['Line 2: write it as Kurdish = meaning, like “Silav = Hello”.', 'Line 3: “silav” is already in the list.']);
  });

  it('takes no more words than one lesson holds', () => {
    const { pairs, problems } = parseWords(Array.from({ length: 14 }, (_, i) => `Peyv${i} = word ${i}`).join('\n'));
    expect(pairs).toHaveLength(12);
    expect(problems).toEqual(['Use at most 12 words: a lesson with more is two lessons.']);
  });
});

describe('a lesson built from words', () => {
  const pairs = parseWords('Silav = Hello\nSpas = Thanks\nRoj baş = Good day\nTu çawa yî? = How are you?\nEz baş im = I am fine\nNa = No\nErê = Yes').pairs;

  it('goes from meeting the words to saying them, every exercise one the server takes', () => {
    const built = buildExercises(pairs, ALL);
    expect(built.map((e) => e.type)).toEqual([
      'match_pairs',
      'match_pairs',
      ...Array(7).fill('multiple_choice'),
      ...Array(7).fill('translate'),
      ...Array(3).fill('listening'),
      ...Array(3).fill('speaking'),
    ]);
    expect(built.map((e) => e.position)).toEqual(built.map((_, i) => i + 1));
    for (const ex of built) expect(exerciseIssues(ex)).toEqual([]);
  });

  it('splits the pairs into boards a phone can show, none of one', () => {
    const boards = buildExercises(pairs, new Set(['match'])).map((e) => (e.payload.pairs as unknown[]).length);
    expect(boards).toEqual([4, 3]);
    const six = buildExercises(pairs.slice(0, 6), new Set(['match'])).map((e) => (e.payload.pairs as unknown[]).length);
    expect(six).toEqual([3, 3]);
  });

  it('asks each meaning among the others’, the right one first', () => {
    const [first] = buildExercises(pairs, new Set(['meaning']));
    expect(first!.payload).toEqual({ say: 'Silav', prompt: '“Silav” tê çi wateyê?', options: ['Hello', 'Thanks', 'Good day'], correctIndex: 0 });
  });

  it('accepts a typed answer without its question mark, and hears and says the longest phrases', () => {
    const translate = buildExercises(pairs, new Set(['translate'])).find((e) => e.payload.prompt === 'How are you?');
    expect(translate!.payload.accepted).toEqual(['Tu çawa yî?', 'Tu çawa yî']);
    const listening = buildExercises(pairs, new Set(['listen'])).map((e) => (e.payload.accepted as string[])[0]);
    expect(listening).toEqual(['Tu çawa yî?', 'Ez baş im', 'Roj baş']);
  });

  it('counts what each kind would add', () => {
    expect(buildCounts(pairs)).toEqual({ match: 2, meaning: 7, translate: 7, listen: 3, speak: 3 });
    expect(buildCounts(pairs.slice(0, 1))).toEqual({ match: 0, meaning: 0, translate: 1, listen: 1, speak: 1 });
  });
});
