import { describe, expect, it } from 'vitest';
import { gameLine, summaryParts } from './labels';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}(${Object.values(vars).join(',')})` : key);

describe('invite summaries', () => {
  it('names each game’s own settings and nothing else', () => {
    expect(gameLine('wordle-battle', { difficulty: 'hard' }, t as never)).toBe('games.battle.name · games.difficulty.hard');
    expect(gameLine('rhyme-match', { dialect: 'sorani' }, t as never)).toBe('games.rhymeMatch.name · Soranî');
    expect(summaryParts({ storyTitle: 'Dayika min', dialect: 'kurmanci', questionCount: 5, length: 'short' }, t as never)).toEqual([
      '“Dayika min”',
      'Kurmancî',
      'stories.questionsCount(5)',
    ]);
  });

  it('quotes a Soranî title in the guillemets its texts use', () => {
    expect(summaryParts({ storyTitle: 'نانی گەرم', dialect: 'sorani' }, t as never)).toEqual(['«نانی گەرم»', 'Soranî']);
  });

  it('leaves out what it does not recognise rather than showing it raw', () => {
    expect(summaryParts({ difficulty: 'impossible', dialect: 'zazaki', length: 'epic' }, t as never)).toEqual([]);
    expect(summaryParts({ length: 'long' }, t as never)).toEqual(['stories.length.long']);
  });
});
