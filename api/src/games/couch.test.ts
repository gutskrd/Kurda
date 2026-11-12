import { describe, expect, it } from 'vitest';
import { IMPOSTOR_GUESS_OPTIONS, learnGame } from '@kurda/shared';
import { couchDeck, couchOffer } from './couch.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const MINIMUM = learnGame('impostor').minimum;
const letters = (i: number): string => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
const card = (i: number, category: string, level = 1) => ({
  level,
  payload: { word: `peyv${letters(i)}`, meanings: { en: `meaning ${i}` }, category, hint: { ku: `kom${category}`, meanings: { en: `the ${category}` } }, forms: [] },
});
/** A pool with enough beginner cards: most in one category, a few in another, one alone in a third. */
const pool = [
  ...Array.from({ length: MINIMUM }, (_, i) => card(i, 'animals')),
  ...Array.from({ length: IMPOSTOR_GUESS_OPTIONS }, (_, i) => card(100 + i, 'fruit')),
  card(200, 'alone'),
  card(300, 'hard', 4),
];

describe('where couch play is offered', () => {
  it('is each difficulty with enough approved cards, and in it the categories large enough to guess in', () => {
    const offer = couchOffer(pool, 'kmr');
    expect(offer.dialect).toBe('kmr');
    expect(offer.difficulties.map((d) => d.difficulty)).toEqual(['beginner']);
    const [beginner] = offer.difficulties;
    expect(beginner!.cards).toBe(MINIMUM + IMPOSTOR_GUESS_OPTIONS + 1);
    expect(beginner!.categories).toEqual([
      { slug: 'animals', ku: 'komanimals', meanings: { en: 'the animals' }, cards: MINIMUM },
      { slug: 'fruit', ku: 'komfruit', meanings: { en: 'the fruit' }, cards: IMPOSTOR_GUESS_OPTIONS },
    ]);
  });

  it('is nowhere while the cards are too few', () => {
    expect(couchOffer(pool.slice(0, MINIMUM - 1), 'kmr').difficulties).toEqual([]);
  });
});

describe('an evening’s cards', () => {
  it('are drawn without a word twice, each with three other words and a second word of its own category', () => {
    const deck = couchDeck(pool, 'kmr', 'beginner', null, 8, 'seed')!;
    expect(deck).toHaveLength(8);
    expect(new Set(deck.map((c) => c.word)).size).toBe(8);
    for (const c of deck) {
      expect(c.decoys).toHaveLength(IMPOSTOR_GUESS_OPTIONS - 1);
      expect(c.decoys).not.toContain(c.word);
      expect(new Set(c.decoys).size).toBe(c.decoys.length);
      if (c.twin) {
        expect(c.twin.word).not.toBe(c.word);
        const category = pool.find((p) => p.payload.word === c.word)!.payload.category;
        expect(pool.find((p) => p.payload.word === c.twin!.word)!.payload.category).toBe(category);
      }
    }
  });

  it('are the same for the same seed and differ for another', () => {
    const words = (seed: string) => couchDeck(pool, 'kmr', 'beginner', null, 10, seed)!.map((c) => c.word);
    expect(words('a')).toEqual(words('a'));
    expect(words('a')).not.toEqual(words('b'));
  });

  it('keep to one category when one is asked for, and take its other words from it first', () => {
    const deck = couchDeck(pool, 'kmr', 'beginner', 'fruit', 10, 'seed')!;
    expect(deck).toHaveLength(IMPOSTOR_GUESS_OPTIONS);
    const fruit = new Set(pool.filter((p) => p.payload.category === 'fruit').map((p) => p.payload.word));
    for (const c of deck) {
      expect(fruit.has(c.word)).toBe(true);
      expect(c.decoys.every((d) => fruit.has(d))).toBe(true);
      expect(fruit.has(c.twin!.word)).toBe(true);
    }
  });

  it('give a card alone in its category no second word', () => {
    const lonely = [...Array.from({ length: MINIMUM }, (_, i) => card(i, `c${i}`))];
    const deck = couchDeck(lonely, 'kmr', 'beginner', null, 3, 'seed')!;
    expect(deck.every((c) => c.twin === null)).toBe(true);
  });

  it('are refused for a category too small to guess in, one that is not there, or a difficulty without enough cards', () => {
    expect(couchDeck(pool, 'kmr', 'beginner', 'alone', 5, 'seed')).toBeNull();
    expect(couchDeck(pool, 'kmr', 'beginner', 'nowhere', 5, 'seed')).toBeNull();
    expect(couchDeck(pool, 'kmr', 'advanced', null, 5, 'seed')).toBeNull();
  });

  it('never deal a card of another difficulty', () => {
    const deck = couchDeck(pool, 'kmr', 'beginner', null, 20, 'seed')!;
    expect(deck.some((c) => c.word === card(300, 'hard', 4).payload.word)).toBe(false);
    expect(deck.flatMap((c) => c.decoys)).not.toContain(card(300, 'hard', 4).payload.word);
  });
});
