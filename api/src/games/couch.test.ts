import { describe, expect, it } from 'vitest';
import { IMPOSTOR_CATEGORY_MIN, IMPOSTOR_GUESS_OPTIONS, learnGame, type WordCardContent } from '@kurda/shared';
import { couchDeck, couchOffer } from './couch.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const MINIMUM = learnGame('impostor').minimum;
const letters = (i: number): string => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const card = (i: number, category: string, level = 1, more: Partial<WordCardContent> = {}) => ({
  level,
  payload: {
    word: `peyv${letters(i)}`,
    meanings: { en: `meaning ${i}` },
    category,
    hint: { ku: `kom${category}`, meanings: { en: `the ${category}` } },
    forms: [],
    ...more,
  } as WordCardContent,
});
/** A pool with enough beginner cards: most in one category, just enough in another, too few in a third, one alone in a fourth. */
const pool = [
  ...Array.from({ length: MINIMUM }, (_, i) => card(i, 'animals')),
  ...Array.from({ length: IMPOSTOR_CATEGORY_MIN }, (_, i) => card(100 + i, 'fruit')),
  ...Array.from({ length: IMPOSTOR_GUESS_OPTIONS }, (_, i) => card(150 + i, 'small')),
  card(200, 'alone'),
  card(300, 'hard', 4),
];

describe('where couch play is offered', () => {
  it('is each difficulty with enough approved cards, and in it the categories large enough to deal from', () => {
    const offer = couchOffer(pool, 'kmr');
    expect(offer.dialect).toBe('kmr');
    expect(offer.difficulties.map((d) => d.difficulty)).toEqual(['beginner']);
    const [beginner] = offer.difficulties;
    expect(beginner!.cards).toBe(MINIMUM + IMPOSTOR_CATEGORY_MIN + IMPOSTOR_GUESS_OPTIONS + 1);
    expect(beginner!.categories).toEqual([
      { slug: 'animals', ku: 'komanimals', meanings: { en: 'the animals' }, cards: MINIMUM },
      { slug: 'fruit', ku: 'komfruit', meanings: { en: 'the fruit' }, cards: IMPOSTOR_CATEGORY_MIN },
    ]);
  });

  it('is nowhere while the cards are too few, or none of their categories is large enough', () => {
    expect(couchOffer(pool.slice(0, MINIMUM - 1), 'kmr').difficulties).toEqual([]);
    const scattered = Array.from({ length: MINIMUM * 2 }, (_, i) => card(i, `c${i % 4}`));
    expect(couchOffer(scattered.slice(0, (IMPOSTOR_CATEGORY_MIN - 1) * 4), 'kmr').difficulties).toEqual([]);
  });
});

describe('an evening’s cards', () => {
  it('are drawn without a word twice, each with three other words of its own category and a second word of it', () => {
    const deck = couchDeck(pool, 'kmr', 'beginner', null, 8, 'seed')!;
    expect(deck).toHaveLength(8);
    expect(new Set(deck.map((c) => c.word)).size).toBe(8);
    const categoryOf = (word: string) => pool.find((p) => p.payload.word === word)!.payload.category;
    for (const c of deck) {
      expect(['animals', 'fruit']).toContain(categoryOf(c.word));
      expect(c.decoys).toHaveLength(IMPOSTOR_GUESS_OPTIONS - 1);
      expect(c.decoys).not.toContain(c.word);
      expect(new Set(c.decoys).size).toBe(c.decoys.length);
      expect(c.decoys.every((d) => categoryOf(d) === categoryOf(c.word))).toBe(true);
      expect(c.twin).not.toBeNull();
      expect(c.twin!.word).not.toBe(c.word);
      expect(categoryOf(c.twin!.word)).toBe(categoryOf(c.word));
    }
  });

  it('are the same for the same seed and differ for another', () => {
    const words = (seed: string) => couchDeck(pool, 'kmr', 'beginner', null, 10, seed)!.map((c) => c.word);
    expect(words('a')).toEqual(words('a'));
    expect(words('a')).not.toEqual(words('b'));
  });

  it('keep to one category when one is asked for, and take its other words from it', () => {
    const deck = couchDeck(pool, 'kmr', 'beginner', 'fruit', 20, 'seed')!;
    expect(deck).toHaveLength(IMPOSTOR_CATEGORY_MIN);
    const fruit = new Set(pool.filter((p) => p.payload.category === 'fruit').map((p) => p.payload.word));
    for (const c of deck) {
      expect(fruit.has(c.word)).toBe(true);
      expect(c.decoys.every((d) => fruit.has(d))).toBe(true);
      expect(fruit.has(c.twin!.word)).toBe(true);
    }
  });

  it('are refused for a category too small to deal from, one that is not there, or a difficulty without enough cards', () => {
    expect(couchDeck(pool, 'kmr', 'beginner', 'small', 5, 'seed')).toBeNull();
    expect(couchDeck(pool, 'kmr', 'beginner', 'alone', 5, 'seed')).toBeNull();
    expect(couchDeck(pool, 'kmr', 'beginner', 'nowhere', 5, 'seed')).toBeNull();
    expect(couchDeck(pool, 'kmr', 'advanced', null, 5, 'seed')).toBeNull();
  });

  it('never deal a card of another difficulty, or of a category too small, in a game of any category', () => {
    const deck = couchDeck(pool, 'kmr', 'beginner', null, 20, 'seed')!;
    const words = [...deck.map((c) => c.word), ...deck.flatMap((c) => c.decoys)];
    expect(words).not.toContain(card(300, 'hard', 4).payload.word);
    expect(words).not.toContain(card(200, 'alone').payload.word);
    expect(deck.some((c) => pool.find((p) => p.payload.word === c.word)!.payload.category === 'small')).toBe(false);
  });

  it('give the odd one out the twin an editor chose, of the same category, and another when it is not there', () => {
    const chosen = card(100, 'fruit', 1, { twin: 'peyvdd' });
    // card 81 is the word peyvdd
    const twinned = [...pool.filter((p) => p.payload.word !== chosen.payload.word), chosen, card(81, 'fruit')];
    const named = twinned.find((p) => p.payload.word === 'peyvdd');
    expect(named?.payload.category).toBe('fruit');
    const deck = couchDeck(twinned, 'kmr', 'beginner', 'fruit', 20, 'seed')!;
    expect(deck.find((c) => c.word === chosen.payload.word)!.twin).toEqual({ word: 'peyvdd', meanings: named!.payload.meanings });
    // a twin of another category, or no card at all, is passed over for one of the card's own
    const stray = couchDeck([...pool.filter((p) => p.payload.word !== chosen.payload.word), card(100, 'fruit', 1, { twin: 'peyvaa' })], 'kmr', 'beginner', 'fruit', 20, 's')!;
    const fruit = new Set(pool.filter((p) => p.payload.category === 'fruit').map((p) => p.payload.word));
    expect(fruit.has(stray.find((c) => c.word === chosen.payload.word)!.twin!.word)).toBe(true);
  });

  it('never put side by side two words that are the same give or take an ending, or that mean the same', () => {
    const close = [
      ...Array.from({ length: MINIMUM }, (_, i) => card(i, 'animals')),
      { level: 1, payload: { ...card(50, 'animals').payload, word: 'bizin', meanings: { en: 'goat' } } },
      { level: 1, payload: { ...card(51, 'animals').payload, word: 'bizinek', meanings: { en: 'a goat' } } },
      { level: 1, payload: { ...card(52, 'animals').payload, word: 'jîr', meanings: { en: 'clever' } } },
      { level: 1, payload: { ...card(53, 'animals').payload, word: 'zîrek', meanings: { en: 'clever, bright' } } },
    ];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      for (const c of couchDeck(close, 'kmr', 'beginner', 'animals', 20, seed)!) {
        // the guess's options side by side, and the word beside the odd one out's (who never sees the options)
        for (const together of [[c.word, ...c.decoys], [c.word, ...(c.twin ? [c.twin.word] : [])]]) {
          expect(together.includes('bizin') && together.includes('bizinek'), together.join(' ')).toBe(false);
          expect(together.includes('jîr') && together.includes('zîrek'), together.join(' ')).toBe(false);
        }
      }
    }
  });

  it('deal tonight’s words again only once every other word has been dealt', () => {
    const fruit = pool.filter((p) => p.payload.category === 'fruit').map((p) => p.payload.word);
    const played = fruit.slice(0, 5);
    const deck = couchDeck(pool, 'kmr', 'beginner', 'fruit', 3, 'seed', played)!;
    expect(deck.every((c) => !played.includes(c.word))).toBe(true);
    const all = couchDeck(pool, 'kmr', 'beginner', 'fruit', 20, 'seed', played)!;
    expect(all).toHaveLength(IMPOSTOR_CATEGORY_MIN);
    expect(all.slice(-5).every((c) => played.includes(c.word))).toBe(true);
  });
});
