import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_RUNGS,
  SENTENCE_RUNGS,
  firstMisplaced,
  roundRung,
  rungAt,
  rungStep,
  sentenceShape,
  stepAfterRound,
} from './build-sentence/ladder.js';
import { GAME_DIFFICULTIES, DIFFICULTY_LEVELS, answerXp, availableDifficulties, roundCountsAsLearning, roundXpCeiling } from './solo.js';
import { LEARN_GAMES, LEARN_GAME_XP_SOURCES, LEARN_GAME_IDS, learnGame, listedLearnGames } from './registry.js';

describe('the ladder', () => {
  it('puts a sentence on the rung its shape says', () => {
    expect(sentenceShape('Ev dîwar e.', 'This is a wall.', 'kmr').rung).toBe('short');
    expect(sentenceShape('Tu çawa yî?', 'How are you?', 'kmr').rung).toBe('question');
    expect(sentenceShape('Ez nizanim.', 'I do not know.', 'kmr').rung).toBe('negation');
    expect(sentenceShape('Ez naxwazim.', 'I don’t want to.', 'kmr').rung).toBe('negation');
    expect(sentenceShape('Ev mala min e.', 'This is my house.', 'kmr').rung).toBe('ezafe');
    expect(sentenceShape('Ez her roj nan dixwim.', 'I eat bread every day.', 'kmr').rung).toBe('verb-final');
    expect(sentenceShape('Ez naçim, ji ber ku baran dibare.', 'I am not going, because it is raining.', 'kmr').rung).toBe('two-clauses');
  });

  it('reads the Soranî question mark and ezafe too', () => {
    expect(sentenceShape('ئەمە ماڵە', 'This is a house', 'ckb').rung).toBe('short');
    expect(sentenceShape('تۆ چۆنی باشی؟', 'How are you, well?', 'ckb').rung).toBe('question');
    expect(sentenceShape('ئەمە ماڵی منە', 'This is my house', 'ckb').rung).toBe('ezafe');
  });

  it('does not take a greeting’s comma for a second clause', () => {
    expect(sentenceShape('Silav, ez Hevalo me.', 'Hello, I am Hevalo.', 'kmr').rung).not.toBe('two-clauses');
  });

  it('gives each rung a level in the difficulty that climbs it', () => {
    for (const d of GAME_DIFFICULTIES) {
      for (const rung of DIFFICULTY_RUNGS[d]) {
        const level = sentenceShape('a b c d e f g h i', rung === 'two-clauses' ? 'one, and because two' : 'x', 'kmr').level;
        if (rung === 'two-clauses') expect(DIFFICULTY_LEVELS[d]).toContain(level);
      }
    }
    expect(SENTENCE_RUNGS.map(rungStep)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rungAt(0)).toBe('short');
    expect(rungAt(99)).toBe('two-clauses');
  });

  it('opens the next rung after a good round on the learner’s own rung, and never closes one', () => {
    expect(stepAfterRound(1, 'short', 6)).toBe(2);
    expect(stepAfterRound(1, 'short', 5)).toBe(1);
    expect(stepAfterRound(4, 'short', 8)).toBe(4);
    expect(stepAfterRound(2, 'verb-final', 7)).toBe(6);
    expect(stepAfterRound(6, 'two-clauses', 8)).toBe(6);
  });

  it('plays a round on the highest opened rung with enough sentences', () => {
    const all = () => true;
    expect(roundRung('beginner', 1, all)).toBe('short');
    expect(roundRung('beginner', 3, all)).toBe('negation');
    expect(roundRung('beginner', 6, all)).toBe('ezafe');
    expect(roundRung('beginner', 3, (r) => r !== 'negation')).toBe('question');
    expect(roundRung('advanced', 1, all)).toBe('two-clauses');
    expect(roundRung('intermediate', 6, () => false)).toBeNull();
  });
});

describe('firstMisplaced', () => {
  const orders = ['Ez diçim malê', 'Malê ez diçim'];
  it('is null for any accepted order', () => {
    expect(firstMisplaced(['Ez', 'diçim', 'malê'], orders, 'kmr')).toBeNull();
    expect(firstMisplaced(['malê', 'Ez', 'diçim'], orders, 'kmr')).toBeNull();
  });

  it('marks where the line leaves the order it is closest to', () => {
    expect(firstMisplaced(['Ez', 'malê', 'diçim'], orders, 'kmr')).toBe(1);
    expect(firstMisplaced(['diçim', 'Ez', 'malê'], orders, 'kmr')).toBe(0);
    expect(firstMisplaced(['Ez', 'diçim'], orders, 'kmr')).toBe(2);
    expect(firstMisplaced(['Ez', 'diçim', 'malê', 'nan'], orders, 'kmr')).toBe(3);
  });
});

describe('what a round pays', () => {
  it('pays right answers by level, a bonus for the first try, and nothing for a repeat', () => {
    expect(answerXp(1, { correct: true, firstTry: true, repeat: false })).toBe(2);
    expect(answerXp(1, { correct: true, firstTry: false, repeat: false })).toBe(1);
    expect(answerXp(3, { correct: true, firstTry: true, repeat: false })).toBe(3);
    expect(answerXp(5, { correct: true, firstTry: true, repeat: false })).toBe(4);
    expect(answerXp(5, { correct: true, firstTry: true, repeat: true })).toBe(0);
    expect(answerXp(5, { correct: false, firstTry: false, repeat: false })).toBe(0);
    expect(roundXpCeiling([1, 2])).toBe(16);
  });

  it('counts a round as learning only when at least half was right', () => {
    expect(roundCountsAsLearning(4, 8)).toBe(true);
    expect(roundCountsAsLearning(3, 8)).toBe(false);
    expect(roundCountsAsLearning(0, 0)).toBe(false);
  });

  it('offers a difficulty only when its levels hold enough', () => {
    expect(availableDifficulties({ 1: 20, 2: 10, 3: 5, 4: 0, 5: 0 }, 30)).toEqual(['beginner']);
    expect(availableDifficulties({ 1: 0, 2: 0, 3: 0, 4: 20, 5: 10 }, 30)).toEqual(['advanced']);
    expect(availableDifficulties({ 1: 40, 2: 40, 3: 40, 4: 40, 5: 40 }, 30, false)).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(availableDifficulties({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 }, 30, false)).toEqual([]);
  });
});

describe('the registry', () => {
  it('has every game once, each with a game XP source of its own', () => {
    expect(LEARN_GAMES.map((g) => g.id)).toEqual([...LEARN_GAME_IDS]);
    const sources = LEARN_GAMES.flatMap((g) => g.xpSources);
    expect(new Set(sources).size).toBe(sources.length);
    for (const s of LEARN_GAME_XP_SOURCES) expect(s).toMatch(/^game_[a-z_]+$/);
    expect(learnGame('build-sentence').minimum).toBe(30);
    expect(learnGame('kingdom').xpSources).toEqual([]);
  });

  it('lists only the games an app can open that are available, in the registry’s order', () => {
    const availability = { games: [{ id: 'hear-it', available: true }, { id: 'build-sentence', available: true }, { id: 'detective', available: false }, { id: 'kingdom', available: true }] };
    expect(listedLearnGames(availability, ['build-sentence', 'hear-it', 'detective', 'kingdom']).map((g) => g.id)).toEqual(['build-sentence', 'hear-it']);
    expect(listedLearnGames(availability, ['build-sentence']).map((g) => g.id)).toEqual(['build-sentence']);
    expect(listedLearnGames(null, ['build-sentence'])).toEqual([]);
  });

  it('asks free text only of games played with others', () => {
    for (const g of LEARN_GAMES.filter((x) => x.freeText)) expect(g.players.min).toBeGreaterThanOrEqual(3);
  });
});
