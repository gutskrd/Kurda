import { describe, expect, it } from 'vitest';
import { summaryParts } from './labels';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}(${Object.values(vars).join(',')})` : key);

describe('invite summaries', () => {
  it('names each game’s own settings and nothing else', () => {
    expect(summaryParts({ difficulty: 'hard' }, t as never)).toEqual(['games.difficulty.hard']);
    expect(summaryParts({ dialect: 'sorani' }, t as never)).toEqual(['dialect.sorani']);
    expect(summaryParts({ storyTitle: 'Dayika min', dialect: 'kurmanci', questionCount: 5, length: 'short' }, t as never)).toEqual([
      '“Dayika min”',
      'dialect.kurmanci',
      'stories.questionsCount(5)',
    ]);
  });

  it('quotes a Soranî title in the guillemets its texts use', () => {
    expect(summaryParts({ storyTitle: 'نانی گەرم', dialect: 'sorani' }, t as never)).toEqual(['«نانی گەرم»', 'dialect.sorani']);
  });

  it('leaves out what it does not recognise rather than showing it raw', () => {
    expect(summaryParts({ difficulty: 'impossible', dialect: 'zazaki', length: 'epic' }, t as never)).toEqual([]);
    expect(summaryParts({ length: 'long' }, t as never)).toEqual(['stories.length.long']);
  });
});
