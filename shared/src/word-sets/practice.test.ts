import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from '../locales.js';
import { WORD_ROUND, askWordAgain, makeWordRound, type WordQuestion } from './practice.js';
import { wordClipKey, wordSetSounds, type WordSetSounds } from './sounds.js';
import { WORD_SET_IDS, dayAfter, monthAfter, wordGloss, wordIn, wordSet, type SetWord } from './words.js';

/** A seeded generator, so a failing round can be replayed exactly. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const DIALECTS = ['kmr', 'ckb'] as const;

/** Every word with a sound, as if each had been recorded. */
const RECORDED: WordSetSounds = wordSetSounds(
  Object.fromEntries(
    WORD_SET_IDS.flatMap((set) => wordSet(set).flatMap((w) => DIALECTS.map((d) => [wordClipKey(w, d), `https://cdn.test/${set}/${w.id}.${d}.wav`]))),
  ),
);
/** No sound for anything: a phone that has not heard from the server, for a set with no synthesised clips. */
const SILENT: WordSetSounds = { url: () => null, of: () => null, isSynthesised: () => false };

/** What an option shows, for checking that no two look the same. */
function face(q: WordQuestion, w: SetWord, dialect: 'kmr' | 'ckb'): string {
  if (q.shows === 'word') return wordIn(w, dialect);
  return w.set === 'colours' ? w.hex : (wordGloss(w, 'en') ?? '');
}

describe('check yourself, with words', () => {
  /** Every question has to be answerable: one right option, among options that look different. */
  it('builds a full round of answerable questions for every set and dialect', () => {
    for (const set of WORD_SET_IDS) {
      for (const dialect of DIALECTS) {
        for (const sounds of [RECORDED, SILENT]) {
          for (let seed = 1; seed <= 40; seed++) {
            const round = makeWordRound(set, dialect, null, seeded(seed), sounds);
            expect(round, `${set} ${dialect} ${seed}`).toHaveLength(WORD_ROUND);
            for (const q of round) {
              const ids = q.options.map((o) => o.id);
              const faces = q.options.map((o) => face(q, o, dialect));
              expect(q.options.length, `${set} ${q.kind}`).toBe(3);
              expect(new Set(ids).size, `${q.kind} ${ids}`).toBe(ids.length);
              expect(new Set(faces).size, `${q.kind} ${faces}`).toBe(faces.length);
              expect(faces.every((f) => f !== ''), `${q.kind} ${faces}`).toBe(true);
              expect(ids.filter((id) => id === q.answer)).toHaveLength(1);
              expect(q.topic.id).toBe(q.answer);
              for (const o of q.options) expect(o.set).toBe(set);
            }
          }
        }
      }
    }
  });

  it('mixes the kinds of question', () => {
    for (const set of WORD_SET_IDS) {
      const kinds = new Set(makeWordRound(set, 'kmr', null, seeded(7), RECORDED).map((q) => q.kind));
      expect(kinds.size, set).toBeGreaterThanOrEqual(3);
    }
  });

  /** A listening question with no sound would be a guess, not a question. */
  it('asks to listen only where there is something to hear, and reads instead where there is not', () => {
    for (const set of WORD_SET_IDS) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const q of makeWordRound(set, 'ckb', null, seeded(seed), RECORDED)) {
          if (q.kind === 'hear') expect(q.clip).toBe(RECORDED.of(q.topic, 'ckb'));
          else expect(q.clip).toBeNull();
        }
        expect(makeWordRound(set, 'ckb', null, seeded(seed), SILENT).some((q) => q.kind === 'hear')).toBe(false);
      }
    }
  });

  it('asks a number by its digits and a colour by its swatch when it is heard', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const set of ['colours', 'numbers'] as const) {
        for (const q of makeWordRound(set, 'kmr', null, seeded(seed), RECORDED)) if (q.kind === 'hear') expect(q.shows).toBe('meaning');
      }
      for (const q of makeWordRound('days', 'kmr', null, seeded(seed), RECORDED)) if (q.kind === 'hear') expect(q.shows).toBe('word');
    }
  });

  /** the wrong numbers are the ones built on the same digit: heft, hivdeh, heftê */
  it('offers the numbers easiest to mix up', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of makeWordRound('numbers', 'kmr', ['7'], seeded(seed), RECORDED)) {
        expect(q.answer).toBe('7');
        expect(q.options.map((o) => o.id).sort()).toEqual(['17', '7', '70']);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('asks for the day after, round the week, and the month after, on its own calendar', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of makeWordRound('days', 'kmr', null, seeded(seed), RECORDED)) {
        if (q.kind !== 'after') continue;
        expect(q.prompt).not.toBeNull();
        expect(dayAfter(q.prompt as never).id).toBe(q.answer);
        expect(q.options.some((o) => o.id === q.prompt!.id)).toBe(false);
      }
      for (const q of makeWordRound('months', 'ckb', null, seeded(seed), RECORDED)) {
        if (q.kind === 'next') {
          expect(monthAfter(q.prompt as never).id).toBe(q.answer);
          for (const o of q.options) expect((o as { calendar: string }).calendar).toBe((q.topic as { calendar: string }).calendar);
        }
        if (q.kind === 'newroz') expect(['mar', 'xakelewe']).toContain(q.answer);
      }
    }
  });

  it('shows a meaning only where a word has one of its own', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const q of makeWordRound('months', 'kmr', null, seeded(seed), SILENT)) {
        if (q.kind === 'see' || q.kind === 'read') expect((q.topic as { calendar: string }).calendar).toBe('gregorian');
      }
    }
  });

  /** "Practise these again" is a round of just the words missed. */
  it('narrows a round to the words given', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const q of makeWordRound('colours', 'kmr', ['red', 'grey'], seeded(seed), RECORDED)) expect(['red', 'grey']).toContain(q.answer);
      for (const q of makeWordRound('days', 'ckb', ['fri'], seeded(seed), SILENT)) expect(q.answer).toBe('fri');
      // a Kurdish month has no meaning to show: it is followed instead
      const solar = makeWordRound('months', 'kmr', ['rezber'], seeded(seed), SILENT);
      expect(solar).toHaveLength(WORD_ROUND);
      for (const q of solar) expect(q.answer).toBe('rezber');
    }
  });

  it('builds a round for every reader the same way, whatever their language', () => {
    for (const { code } of APP_LOCALES) expect(makeWordRound('days', code === 'ckb' ? 'ckb' : 'kmr', null, seeded(3))).toHaveLength(WORD_ROUND);
  });

  it('asks a missed question again with the same answer', () => {
    const q = makeWordRound('numbers', 'kmr', null, seeded(3), RECORDED)[0]!;
    const back = askWordAgain(q, seeded(9));
    expect(back.answer).toBe(q.answer);
    expect(back.options.map((o) => o.id).sort()).toEqual(q.options.map((o) => o.id).sort());
  });
});
