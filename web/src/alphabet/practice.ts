import type { AppLocale } from '@kurda/shared';
import { latinSound, latinWord, pairWord, soraniSound } from './audio';
import {
  LATIN,
  PAIRS,
  SORANI,
  bandOf,
  compareLocaleOf,
  formsOf,
  likeFor,
  type LatinLetter,
  type Likeness,
  type Meaning,
  type SoraniLetter,
} from './letters';

/**
 * "Check yourself": a short round of questions, built to teach as much as to test.
 *
 * What the research on learning says, and what each part of this does about it:
 *
 *  - Retrieval beats rereading (the testing effect). Every question makes the
 *    reader produce the link — sound to letter, letter to script — rather than
 *    look at it again.
 *  - Mix the kinds (interleaving). Listening, comparing, spelling, minimal
 *    pairs and script matching alternate, so each answer has to be worked out
 *    rather than carried over from the question before.
 *  - Aim at what is hard (desirable difficulty). Questions are drawn first from
 *    the letters that are false friends or new for the reader's own language,
 *    and the wrong options are the letters people really confuse — c with ç and
 *    j, i with î, ب with پ and ت — never three letters nobody would mix up.
 *  - Correct at once, and come back to it (feedback, successive relearning). A
 *    miss shows the right answer with its sound and why; the same item returns
 *    later in the round, so the last thing remembered is the right one.
 *  - Keep the stakes low. Nothing is scored, saved or ranked; the summary names
 *    what to look at again, and offers a round of just those.
 */

export type Script = 'kmr' | 'ckb';

export interface Option {
  id: string;
  text: string;
  script: Script;
}

/** What a question is about, so a miss can point back at the letter. */
export interface Topic {
  script: Script;
  id: string;
}

export type Question =
  | { kind: 'hear'; clip: string; options: Option[]; answer: string; topic: Topic }
  | { kind: 'like'; like: Likeness; options: Option[]; answer: string; topic: Topic }
  | { kind: 'spell'; clip: string; meaning: Meaning; options: Option[]; answer: string; topic: Topic }
  | { kind: 'pair'; clip: string; pair: (typeof PAIRS)[number]; options: Option[]; answer: string; topic: Topic }
  | { kind: 'script'; prompt: Option; options: Option[]; answer: string; topic: Topic }
  | { kind: 'form'; prompt: string; position: 'start' | 'middle' | 'end'; options: Option[]; answer: string; topic: Topic };

export const ROUND = 8;

/** Letters people actually confuse, nearest first. */
const CONFUSE: Record<string, readonly string[]> = {
  c: ['ç', 'j'], ç: ['c', 'ş'], j: ['c', 'ş'], ş: ['s', 'ç'], s: ['ş', 'z'], z: ['s', 'j'],
  x: ['h', 'q'], h: ['x', 'k'], q: ['k', 'x'], k: ['q', 'g'], g: ['k', 'q'],
  e: ['ê', 'i'], ê: ['e', 'î'], i: ['î', 'e'], î: ['i', 'ê'], u: ['û', 'o'], û: ['u', 'o'], o: ['û', 'u'], a: ['e', 'ê'],
  v: ['w', 'f'], w: ['v', 'u'], f: ['v', 'p'], y: ['î', 'j'], r: ['l', 'w'], p: ['b', 'f'], b: ['p', 'v'],
  t: ['d', 'ç'], d: ['t', 'z'], l: ['r', 'n'], m: ['n', 'w'], n: ['m', 'l'],
};

/** Soranî letters that differ only by dots or marks — the ones the eye has to learn to tell apart. */
const SHAPES: readonly (readonly string[])[] = [
  ['ب', 'پ', 'ت'], ['ج', 'چ', 'ح', 'خ'], ['د', 'ر', 'ڕ', 'ز', 'ژ'], ['س', 'ش'], ['ع', 'غ'],
  ['ف', 'ڤ', 'ق'], ['ک', 'گ'], ['ل', 'ڵ'], ['و', 'ۆ', 'وو'], ['ی', 'ێ'], ['ە', 'ھ'], ['ا', 'ئ'],
  ['م', 'ن'],
];

type Random = () => number;

function shuffle<T>(xs: readonly T[], rand: Random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const latin = (id: string): LatinLetter => LATIN.find((l) => l.id === id)!;
const sorani = (char: string): SoraniLetter | undefined => SORANI.find((l) => l.char === char);
const latinOpt = (l: LatinLetter): Option => ({ id: l.id, text: l.id, script: 'kmr' });
const soraniOpt = (l: SoraniLetter): Option => ({ id: l.id, text: l.char, script: 'ckb' });

/** The letter and two that are easy to mistake for it. */
function latinOptions(target: LatinLetter, rand: Random): Option[] {
  const near = (CONFUSE[target.id] ?? []).map(latin);
  const rest = shuffle(LATIN.filter((l) => l.id !== target.id && l.vowel === target.vowel && !near.includes(l)), rand);
  return shuffle([target, ...[...near, ...rest].slice(0, 2)], rand).map(latinOpt);
}

function soraniOptions(target: SoraniLetter, rand: Random, pool: readonly SoraniLetter[] = SORANI): Option[] {
  const family = SHAPES.find((f) => f.includes(target.char)) ?? [];
  const near = shuffle(family.filter((c) => c !== target.char).map(sorani).filter((l): l is SoraniLetter => !!l && pool.includes(l)), rand);
  const rest = shuffle(pool.filter((l) => l !== target && l.kind === target.kind && !near.includes(l)), rand);
  return shuffle([target, ...[...near, ...rest].slice(0, 2)], rand).map(soraniOpt);
}

/** The Kurmancî letters a reader should practise first: their false friends and new letters, or all of them. */
function hardLatin(locale: AppLocale): LatinLetter[] {
  const lang = compareLocaleOf(locale);
  if (!lang) return [...LATIN];
  return LATIN.filter((l) => bandOf(l.id, lang) !== 'same');
}

/** The example word, spelled three ways: once right, twice with a letter people mistake for one in it. */
function spellQuestion(target: LatinLetter, rand: Random): Question | null {
  const clip = latinWord(target.id);
  if (!clip) return null;
  const word = target.word;
  const at = word.indexOf(target.id);
  if (at < 0) return null;
  const wrong = (CONFUSE[target.id] ?? [])
    .map((c) => word.slice(0, at) + c + word.slice(at + target.id.length))
    .filter((w) => w !== word);
  if (wrong.length < 2) return null;
  const options = shuffle([word, ...wrong.slice(0, 2)], rand).map((w) => ({ id: w, text: w, script: 'kmr' as const }));
  return { kind: 'spell', clip, meaning: target.meaning, options, answer: word, topic: { script: 'kmr', id: target.id } };
}

function pairQuestion(rand: Random, focus: Set<string> | null): Question | null {
  // a pair practises the vowel that tells its two words apart
  const at = (p: (typeof PAIRS)[number]): number => [...p.b.word].findIndex((c, i) => c !== [...p.a.word][i]);
  const differs = (p: (typeof PAIRS)[number]): string => [...p.b.word][at(p)] ?? '';
  // a missed î brings back dil/dîl; so does a missed i
  const pool = PAIRS.filter((p) => !focus || focus.has(differs(p)) || focus.has([...p.a.word][at(p)] ?? ''));
  const pair = shuffle(pool.length ? pool : PAIRS, rand)[0]!;
  const said = rand() < 0.5 ? pair.a : pair.b;
  const clip = pairWord(said.word);
  if (!clip) return null;
  const options = shuffle([pair.a, pair.b], rand).map((w) => ({ id: w.word, text: w.word, script: 'kmr' as const }));
  return { kind: 'pair', clip, pair, options, answer: said.word, topic: { script: 'kmr', id: differs(pair) } };
}

/** Kurmancî letters and their Soranî partners, the pairs both alphabets share. */
const SHARED = SORANI.filter((l) => l.latin && !l.extra);

function scriptQuestion(target: SoraniLetter, toLatin: boolean, rand: Random): Question {
  if (toLatin) {
    const others = shuffle(SHARED.filter((l) => l !== target && l.kind === target.kind), rand).slice(0, 2);
    return {
      kind: 'script',
      prompt: soraniOpt(target),
      options: shuffle([target, ...others], rand).map((l) => ({ id: l.id, text: l.latin!, script: 'kmr' })),
      answer: target.id,
      topic: { script: 'ckb', id: target.id },
    };
  }
  return {
    kind: 'script',
    prompt: { id: target.id, text: target.latin!, script: 'kmr' },
    options: soraniOptions(target, rand, SHARED),
    answer: target.id,
    topic: { script: 'ckb', id: target.id },
  };
}

/** A letter as it looks inside a word, to be told from the letters shaped like it. */
function formQuestion(target: SoraniLetter, rand: Random): Question {
  const forms = formsOf(target);
  const position = target.joins ? shuffle(['start', 'middle', 'end'] as const, rand)[0]! : 'end';
  return {
    kind: 'form',
    prompt: forms[position],
    position,
    options: soraniOptions(target, rand),
    answer: target.id,
    topic: { script: 'ckb', id: target.id },
  };
}

/**
 * A round of eight. `focus` narrows it to letters the reader missed last time.
 * `rand` is injectable so the tests can pin a round down.
 */
export function makeRound(script: Script, locale: AppLocale, focus: readonly string[] | null = null, rand: Random = Math.random): Question[] {
  const want = focus && focus.length ? new Set(focus) : null;
  const out: Question[] = [];

  if (script === 'kmr') {
    const lang = compareLocaleOf(locale);
    const pool = shuffle(want ? LATIN.filter((l) => want.has(l.id)) : hardLatin(locale), rand);
    const pattern = lang
      ? (['hear', 'like', 'spell', 'pair', 'hear', 'like', 'spell', 'hear'] as const)
      : (['hear', 'spell', 'pair', 'script', 'hear', 'spell', 'pair', 'script'] as const);
    let i = 0;
    const next = (): LatinLetter => pool[i++ % pool.length]!;
    for (const kind of pattern) {
      let q: Question | null = null;
      for (let tries = 0; !q && tries < pool.length + 2; tries++) {
        const l = next();
        if (kind === 'hear') {
          const clip = latinSound(l.id);
          q = clip ? { kind, clip, options: latinOptions(l, rand), answer: l.id, topic: { script: 'kmr', id: l.id } } : null;
        } else if (kind === 'like') {
          const like = likeFor(l.id, locale);
          q = like ? { kind, like, options: latinOptions(l, rand), answer: l.id, topic: { script: 'kmr', id: l.id } } : null;
        } else if (kind === 'spell') {
          q = spellQuestion(l, rand);
        } else if (kind === 'pair') {
          q = pairQuestion(rand, want);
        } else {
          const partner = SHARED.find((s) => s.latin === l.id) ?? shuffle(SHARED, rand)[0]!;
          q = scriptQuestion(partner, locale === 'ckb', rand);
        }
      }
      if (q) out.push(q);
    }
    return out;
  }

  const pool = shuffle(want ? SORANI.filter((l) => want.has(l.id)) : SORANI.filter((l) => l.id !== 'hamza'), rand);
  const pattern = ['script', 'hear', 'form', 'script', 'hear', 'form', 'script', 'hear'] as const;
  let i = 0;
  for (const kind of pattern) {
    let q: Question | null = null;
    for (let tries = 0; !q && tries < pool.length + 2; tries++) {
      const l = pool[i++ % pool.length]!;
      if (kind === 'script') q = l.latin && !l.extra ? scriptQuestion(l, locale === 'ckb', rand) : null;
      else if (kind === 'hear') {
        const clip = soraniSound(l);
        q = clip ? { kind, clip, options: soraniOptions(l, rand), answer: l.id, topic: { script: 'ckb', id: l.id } } : null;
      } else q = formQuestion(l, rand);
    }
    if (q) out.push(q);
  }
  return out;
}

/** The same question again, its options in a new order — for a miss that comes back later in the round. */
export function again(q: Question, rand: Random = Math.random): Question {
  return { ...q, options: shuffle(q.options, rand) } as Question;
}
