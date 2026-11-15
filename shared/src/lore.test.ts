import { describe, expect, it } from 'vitest';
import { checkGameContent, contentHeadline, kurdishTexts } from './games/content.js';
import {
  RIDDLE_LEVELS,
  RIDDLE_PAID_GUESSES,
  checkLoreTranslation,
  dailyLorePick,
  loreDayNumber,
  originalLocale,
  riddleGuessForms,
  riddleGuessMatches,
  riddleXp,
  translationLocales,
} from './lore.js';

// stand-in Kurdish for the fixtures, never shown to a learner
const riddle = (over: Record<string, unknown> = {}) => ({
  slug: 'kmr-si',
  difficulty: 'easy',
  category: 'nature',
  tradition: 'new',
  question: 'Çi ye ku dikeve nav avê lê şil nabe?',
  hints: ['Ew bi te re dimeşe.', 'Roj wê çêdike.'],
  answer: 'Sî',
  accepted: ['sî', 'siya', 'sîber'],
  explanation: 'Sî dikeve nav avê, lê ew ne tiştek e ku şil bibe.',
  ...over,
});

const proverb = (over: Record<string, unknown> = {}) => ({
  slug: 'kmr-av-dilop',
  text: 'Av dilop dilop dibe gol.',
  themes: ['patience', 'hard-work'],
  tradition: 'traditional',
  variants: [{ text: 'دڵۆپ دڵۆپ دەبێتە گۆل', dialect: 'ckb', note: 'the Soranî counterpart' }],
  exampleKu: 'Dapîr got: “Av dilop dilop dibe gol”, û her roj deh pereyan danî ser hev.',
  sources: [{ title: 'A collection of proverbs', url: 'https://example.org/proverbs' }],
  ...over,
});

describe('a riddle row', () => {
  it('is stored with its sources defaulted, and headed by its question', () => {
    const res = checkGameContent('riddle', 'kmr', riddle());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payload.sources).toEqual([]);
    expect(contentHeadline('riddle', res.payload)).toBe('Çi ye ku dikeve nav avê lê şil nabe?');
    expect(kurdishTexts('riddle', res.payload).map((t) => t.path)).toEqual([
      'question',
      'hints.0',
      'hints.1',
      'answer',
      'accepted.0',
      'accepted.1',
      'accepted.2',
      'explanation',
    ]);
  });

  it('needs one or two hints and at least one accepted form', () => {
    expect(checkGameContent('riddle', 'kmr', riddle({ hints: [] })).ok).toBe(false);
    expect(checkGameContent('riddle', 'kmr', riddle({ hints: ['a', 'b', 'c'] })).ok).toBe(false);
    expect(checkGameContent('riddle', 'kmr', riddle({ accepted: [] })).ok).toBe(false);
  });

  it('refuses its Kurdish in the other variety’s script, wherever it is', () => {
    const res = checkGameContent('riddle', 'kmr', riddle({ answer: 'سێبەر' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.map((i) => i.path)).toEqual(['answer']);
  });

  it('presents nothing as traditional without a source, nor as regional without its region', () => {
    const old = checkGameContent('riddle', 'kmr', riddle({ tradition: 'traditional' }));
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.issues.map((i) => i.path)).toEqual(['sources']);
    const local = checkGameContent('riddle', 'kmr', riddle({ tradition: 'regional', sources: [{ title: 'Folklore of Botan' }] }));
    expect(local.ok).toBe(false);
    if (!local.ok) expect(local.issues.map((i) => i.path)).toEqual(['region']);
    expect(checkGameContent('riddle', 'kmr', riddle({ tradition: 'regional', region: 'Botan', sources: [{ title: 'Folklore of Botan' }] })).ok).toBe(true);
  });

  it('takes a source’s address over https only', () => {
    expect(checkGameContent('riddle', 'kmr', riddle({ sources: [{ title: 'Book', url: 'http://example.org' }] })).ok).toBe(false);
    expect(checkGameContent('riddle', 'kmr', riddle({ sources: [{ title: 'Book', url: 'https://' }] })).ok).toBe(false);
    expect(checkGameContent('riddle', 'kmr', riddle({ sources: [{ title: 'Book', url: 'https://example.org/a' }] })).ok).toBe(true);
  });

  it('starts its slug with its variety, so no slug is taken for a word of the routes’ own', () => {
    const res = checkGameContent('riddle', 'kmr', riddle({ slug: 'daily' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.map((i) => i.path)).toEqual(['slug']);
    expect(checkGameContent('riddle', 'ckb', riddle({ slug: 'kmr-si' })).ok).toBe(false);
  });

  it('files each difficulty at one level', () => {
    expect(RIDDLE_LEVELS).toEqual({ easy: 1, medium: 3, hard: 5 });
  });
});

describe('a proverb row', () => {
  it('checks a variant in the other variety by that variety’s script', () => {
    expect(checkGameContent('proverb', 'kmr', proverb()).ok).toBe(true);
    const wrong = checkGameContent('proverb', 'kmr', proverb({ variants: [{ text: 'Av dilop dilop dibe gol', dialect: 'ckb' }] }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.issues.map((i) => i.path)).toEqual(['variants.0.text']);
  });

  it('takes one to three themes, each once, from the list', () => {
    expect(checkGameContent('proverb', 'kmr', proverb({ themes: [] })).ok).toBe(false);
    expect(checkGameContent('proverb', 'kmr', proverb({ themes: ['patience', 'patience'] })).ok).toBe(false);
    expect(checkGameContent('proverb', 'kmr', proverb({ themes: ['wisdom', 'trust', 'family', 'courage'] })).ok).toBe(false);
    expect(checkGameContent('proverb', 'kmr', proverb({ themes: ['bravery'] })).ok).toBe(false);
  });
});

describe('translations', () => {
  it('are every app language but the row’s own', () => {
    expect(originalLocale('kmr')).toBe('ku');
    expect(originalLocale('ckb')).toBe('ckb');
    expect(translationLocales('kmr')).toEqual(['ckb', 'en', 'nl', 'de', 'es', 'fr', 'tr', 'ar']);
    expect(translationLocales('ckb')).toEqual(['ku', 'en', 'nl', 'de', 'es', 'fr', 'tr', 'ar']);
    const own = checkLoreTranslation('riddle', { dialect: 'kmr', hints: 1 }, 'ku', { question: 'q', hints: ['h'], answer: 'a', explanation: 'e' });
    expect(own.ok).toBe(false);
  });

  it('translate each of a riddle’s hints, no more and no fewer', () => {
    const t = { question: 'What falls into water and never gets wet?', hints: ['It walks with you.'], answer: 'A shadow', explanation: 'A shadow is not a thing.' };
    expect(checkLoreTranslation('riddle', { dialect: 'kmr', hints: 1 }, 'en', t).ok).toBe(true);
    const short = checkLoreTranslation('riddle', { dialect: 'kmr', hints: 2 }, 'en', t);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.issues[0]!.path).toBe('hints');
  });

  it('keep the Kurdish interface languages in their own scripts', () => {
    const latin = { question: 'Çi ye?', hints: ['Ew bi te re ye.'], answer: 'Sî', explanation: 'Ji ber ku.' };
    expect(checkLoreTranslation('riddle', { dialect: 'ckb', hints: 1 }, 'ku', latin).ok).toBe(true);
    expect(checkLoreTranslation('riddle', { dialect: 'kmr', hints: 1 }, 'ckb', latin).ok).toBe(false);
  });

  it('of a proverb need its rendering, meaning, explanation and scene, and leave the rest out', () => {
    const t = { translation: 'Drop by drop, water becomes a lake.', meaning: 'Small efforts add up.', explanation: 'Water gathers slowly.', example: 'She saved a coin a day.' };
    const res = checkLoreTranslation('proverb', { dialect: 'kmr' }, 'en', t);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toEqual(t);
    expect(checkLoreTranslation('proverb', { dialect: 'kmr' }, 'en', { ...t, meaning: ' ' }).ok).toBe(false);
    expect(checkLoreTranslation('proverb', { dialect: 'kmr' }, 'en', { ...t, extra: 'no' }).ok).toBe(false);
  });
});

describe('what counts as solving a riddle', () => {
  const answers = ['Sî', 'sîber'];

  it('takes the answer or an accepted form, whatever the case, the marks or the spacing', () => {
    for (const guess of ['sî', 'SÎ', ' si ', 'Sî!', 'SIBER']) expect(riddleGuessMatches(guess, answers, 'kmr'), guess).toBe(true);
  });

  it('takes an ending on it, a demonstrative before it and the copula after it', () => {
    for (const guess of ['siya', 'sîyek', 'ew sî', 'sî ye', 'ew sîber e', 'sîbera']) expect(riddleGuessMatches(guess, answers, 'kmr'), guess).toBe(true);
  });

  it('refuses another word, a longer one holding it, or the answer inside a sentence', () => {
    for (const guess of ['s', 'sîv', 'sîberxane', 'ne sî', 'ez nizanim sî', '']) expect(riddleGuessMatches(guess, answers, 'kmr'), guess).toBe(false);
  });

  it('never cuts a short word down to another', () => {
    expect(riddleGuessForms('se', 'kmr')).toEqual(['se']);
    expect(riddleGuessMatches('xan', ['xanî'], 'kmr')).toBe(false);
    // the endings are taken off the guess, never off the answer: xanî with its ezafe is xanî, but xan is not
    expect(riddleGuessMatches('xaniyê', ['xanî'], 'kmr')).toBe(true);
    expect(riddleGuessMatches('xaniyek', ['xanî'], 'kmr')).toBe(true);
  });

  it('reads Soranî with its own endings and lenient letters', () => {
    const sorani = ['سێبەر'];
    for (const guess of ['سێبەر', 'سیبەر', 'سێبەرەکە', 'سێبەرێک', 'سێبەرە', 'ئەو سێبەرە']) expect(riddleGuessMatches(guess, sorani, 'ckb'), guess).toBe(true);
    expect(riddleGuessMatches('سێو', sorani, 'ckb')).toBe(false);
  });
});

describe('the riddle of the day', () => {
  const slugs = ['kmr-a', 'kmr-b', 'kmr-c', 'kmr-d', 'kmr-e'];

  it('is the same all day, whatever order the riddles come in', () => {
    expect(dailyLorePick(slugs, '2026-11-14')).toBe(dailyLorePick([...slugs].reverse(), '2026-11-14'));
  });

  it('steps through every riddle before one comes back', () => {
    const start = loreDayNumber('2026-11-14');
    const days = slugs.map((_, i) => new Date((start + i) * 86_400_000).toISOString().slice(0, 10));
    expect(new Set(days.map((d) => dailyLorePick(slugs, d))).size).toBe(slugs.length);
    expect(dailyLorePick(slugs, '2026-11-19')).toBe(dailyLorePick(slugs, '2026-11-14'));
  });

  it('is none while there is none', () => {
    expect(dailyLorePick([], '2026-11-14')).toBeNull();
  });
});

describe('what solving a riddle pays', () => {
  it('pays its difficulty, half after a hint, nothing after a reveal or too many guesses', () => {
    expect(riddleXp('easy', { hintsUsed: 0, guesses: 1, revealed: false })).toBe(3);
    expect(riddleXp('medium', { hintsUsed: 0, guesses: 2, revealed: false })).toBe(5);
    expect(riddleXp('hard', { hintsUsed: 0, guesses: 1, revealed: false })).toBe(8);
    expect(riddleXp('hard', { hintsUsed: 2, guesses: 1, revealed: false })).toBe(4);
    expect(riddleXp('easy', { hintsUsed: 1, guesses: 1, revealed: false })).toBe(2);
    expect(riddleXp('hard', { hintsUsed: 0, guesses: 1, revealed: true })).toBe(0);
    expect(riddleXp('hard', { hintsUsed: 0, guesses: RIDDLE_PAID_GUESSES + 1, revealed: false })).toBe(0);
  });
});
