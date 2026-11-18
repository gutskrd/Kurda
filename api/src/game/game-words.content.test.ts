/**
 * The game words migration 1751000580000 put in the pool, checked as the games use them: every Peyvok band deep enough
 * for a daily word, every word a typeable lemma the filter allows, and every curated rhyme prompt with at least eight
 * partners by its dialect's rule. Read from the migration itself.
 */
import { describe, expect, it } from 'vitest';
import { wordKey } from '@kurda/shared';
import { classifyRhyme, rhymeWordKey, type Dialect } from './rhyme.js';
import { RHYME_MIN_PROMPTS, RHYME_PARTS_OF_SPEECH } from './rhyme-words.js';
import { isWordleWord } from './word-pool.js';
import { filterByDifficulty, type Difficulty } from './wordle-daily.js';
import { filterText } from '../moderation/filter.js';

type Word = readonly [word: string, pos: string, en: string];

interface PoolMigration {
  OUT_OF_GAMES: string[];
  KMR_SEEDS: Word[];
  KMR_TAUGHT: Word[];
  KMR_EVERYDAY: Word[];
  KMR_PROMPTS: string[];
  CKB_WORDS: Word[];
  CKB_PROMPTS: string[];
}

// a path the compiler does not follow: a migration is plain JavaScript
const path = '../../migrations/1751000580000_peyvok-pool.js';
const pool = (await import(/* @vite-ignore */ path)) as PoolMigration;

const kmr = [...pool.KMR_SEEDS, ...pool.KMR_TAUGHT, ...pool.KMR_EVERYDAY];
const kmrWords = kmr.map(([w]) => w);
const ckbWords = pool.CKB_WORDS.map(([w]) => w);

/** A daily word needs this many answers in its band, so it does not come round again within months. */
const DAILY_BAND_MIN = 120;
/** A curated prompt has at least this many perfect partners among the game words. */
const PROMPT_PARTNERS_MIN = 8;

function partners(prompt: string, words: readonly string[], dialect: Dialect): string[] {
  return words.filter((w) => w !== prompt && classifyRhyme(prompt, w, dialect) === 'perfect');
}

describe('the Peyvok pool', () => {
  it('has no word twice, and none of the words it takes out', () => {
    expect(new Set(kmrWords).size).toBe(kmrWords.length);
    for (const out of pool.OUT_OF_GAMES) expect(kmrWords, out).not.toContain(out);
  });

  it.each(['easy', 'medium', 'hard'] as Difficulty[])('gives the %s band enough answers for a daily word', (band) => {
    expect(filterByDifficulty(kmrWords, band).length).toBeGreaterThanOrEqual(DAILY_BAND_MIN);
  });

  it('is lower-case Hawar words of two to nine letters, as the keyboard types them', () => {
    for (const w of kmrWords) {
      expect(isWordleWord(w), w).toBe(true);
      expect(wordKey('kmr', w), w).toBe(w);
      expect([...w].length, w).toBeLessThanOrEqual(9);
    }
  });

  it('gives every word a part of speech a rhyme takes, and a short meaning', () => {
    for (const [w, pos, en] of [...kmr, ...pool.CKB_WORDS]) {
      expect(RHYME_PARTS_OF_SPEECH.has(pos), `${w}: ${pos}`).toBe(true);
      expect(en.trim(), w).not.toBe('');
      expect(en.length, w).toBeLessThanOrEqual(60);
    }
  });

  it('has nothing the word filter refuses, in either dialect', () => {
    expect([...kmrWords, ...ckbWords].filter((w) => filterText(w).flagged)).toEqual([]);
  });
});

describe('the rhyme prompts', () => {
  it('open both dialects: at least as many curated prompts as a dialect needs to be offered', () => {
    expect(pool.KMR_PROMPTS.length).toBeGreaterThanOrEqual(RHYME_MIN_PROMPTS);
    expect(pool.CKB_PROMPTS.length).toBeGreaterThanOrEqual(RHYME_MIN_PROMPTS);
    expect(new Set(pool.KMR_PROMPTS).size).toBe(pool.KMR_PROMPTS.length);
    expect(new Set(pool.CKB_PROMPTS).size).toBe(pool.CKB_PROMPTS.length);
  });

  it('are Kurmancî game words, each with eight perfect partners by the rime', () => {
    for (const p of pool.KMR_PROMPTS) {
      expect(kmrWords, p).toContain(p);
      expect(partners(p, kmrWords, 'kurmanci').length, p).toBeGreaterThanOrEqual(PROMPT_PARTNERS_MIN);
    }
  });

  it('are Soranî words in Soranî letters, each with eight perfect partners by the last two letters', () => {
    expect(new Set(ckbWords).size).toBe(ckbWords.length);
    for (const w of ckbWords) expect(rhymeWordKey(w, 'sorani'), w).not.toBe('');
    for (const p of pool.CKB_PROMPTS) {
      expect(ckbWords, p).toContain(p);
      expect(partners(p, ckbWords, 'sorani').length, p).toBeGreaterThanOrEqual(PROMPT_PARTNERS_MIN);
    }
  });
});
