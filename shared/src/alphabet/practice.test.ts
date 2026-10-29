import { describe, expect, it } from 'vitest';
import { LETTER_CLIPS } from '../alphabet-audio.js';
import { APP_LOCALES } from '../locales.js';
import { CLIPS } from './clips.js';
import { LATIN, PAIRS, SORANI } from './letters.js';
import { ROUND, again, makeRound, type Question } from './practice.js';
import { alphabetSounds } from './sounds.js';

/** A seeded generator, so a failing round can be replayed exactly. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const SCRIPTS = ['kmr', 'ckb'] as const;
const LOCALES = APP_LOCALES.map((l) => l.code);

function sound(q: Question): string | null {
  return 'clip' in q ? q.clip : null;
}

describe('check yourself', () => {
  /** Every question has to be answerable: one right option, among distinct ones. */
  it('builds a full round of answerable questions for every reader', () => {
    for (const locale of LOCALES) {
      for (const script of SCRIPTS) {
        for (let seed = 1; seed <= 40; seed++) {
          const round = makeRound(script, locale, null, seeded(seed));
          expect(round, `${script} ${locale} ${seed}`).toHaveLength(ROUND);
          for (const q of round) {
            const ids = q.options.map((o) => o.id);
            const texts = q.options.map((o) => o.text);
            expect(new Set(ids).size, `${q.kind} ${ids}`).toBe(ids.length);
            expect(new Set(texts).size, `${q.kind} ${texts}`).toBe(texts.length);
            expect(ids.filter((id) => id === q.answer), `${q.kind} ${q.answer}`).toHaveLength(1);
            expect(q.options.length).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  /** Interleaving: a round mixes kinds of question rather than repeating one. */
  it('mixes the kinds of question', () => {
    for (const locale of LOCALES) {
      for (const script of SCRIPTS) {
        const kinds = new Set(makeRound(script, locale, null, seeded(7)).map((q) => q.kind));
        expect(kinds.size, `${script} ${locale}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  /** A listening question with no sound would be a guess, not a question. */
  it('only asks to listen where there is a sound to hear', () => {
    for (const script of SCRIPTS) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const q of makeRound(script, 'en', null, seeded(seed))) {
          if (q.kind === 'hear' || q.kind === 'spell' || q.kind === 'pair') expect(sound(q)).toMatch(/^\/audio\/alphabet\/a[0-9a-f]+\.mp3$/);
        }
      }
    }
  });

  /** The wrong spellings are real near-misses: the word with one confusable letter swapped. */
  it('spells the example word once right and twice nearly right', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const q of makeRound('kmr', 'en', null, seeded(seed))) {
        if (q.kind !== 'spell') continue;
        const word = LATIN.find((l) => l.id === q.topic.id)!.word;
        expect(q.answer).toBe(word);
        for (const o of q.options) expect([...o.text].length).toBeLessThanOrEqual([...word].length + 1);
      }
    }
  });

  /** "Practise these again" is a round of just the letters missed. */
  it('narrows a round to the letters given', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const round = makeRound('kmr', 'en', ['c', 'î'], seeded(seed));
      for (const q of round) expect(['c', 'î', 'i']).toContain(q.topic.id);
      const ckb = makeRound('ckb', 'en', ['pe'], seeded(seed));
      for (const q of ckb) expect(q.topic.id).toBe('pe');
    }
  });

  it('asks a missed question again with the same answer', () => {
    const q = makeRound('kmr', 'en', null, seeded(3))[0]!;
    const back = again(q, seeded(9));
    expect(back.answer).toBe(q.answer);
    expect(back.options.map((o) => o.id).sort()).toEqual(q.options.map((o) => o.id).sort());
  });
});

describe('the sounds', () => {
  const { latinSound, latinWord, pairWord, soraniSound } = alphabetSounds();

  /** the admin panel records exactly the sounds the pages play — no more, no fewer */
  it('records the same sounds the pages ship', () => {
    expect(LETTER_CLIPS.map((c) => c.key).sort()).toEqual(Object.keys(CLIPS).sort());
  });

  it('can say every letter, every example word and every minimal pair', () => {
    for (const l of LATIN) {
      expect(latinSound(l.id), l.id).not.toBeNull();
      expect(latinWord(l.id), l.id).not.toBeNull();
    }
    for (const l of SORANI) expect(soraniSound(l), l.id).not.toBeNull();
    for (const p of PAIRS) {
      expect(pairWord(p.a.word), p.a.word).not.toBeNull();
      expect(pairWord(p.b.word), p.b.word).not.toBeNull();
    }
  });

  /** a round started after the recordings arrive asks with them */
  it('asks with the recordings it is given', () => {
    const recorded = Object.fromEntries(LATIN.map((l) => [`kmr:sound:${l.id}`, `https://cdn.test/${l.id}.wav`]));
    for (let seed = 1; seed <= 10; seed++) {
      for (const q of makeRound('kmr', 'en', null, seeded(seed), alphabetSounds(recorded))) {
        if (q.kind === 'hear') expect(q.clip).toMatch(/^https:\/\/cdn\.test\/.+\.wav$/);
      }
    }
  });
});
