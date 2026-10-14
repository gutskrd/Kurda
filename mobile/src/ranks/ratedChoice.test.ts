import { describe, expect, it } from 'vitest';
import { parseChoices, startingChoice } from './ratedChoice';

describe('parseChoices', () => {
  it('keeps a boolean per ranked game and drops anything else', () => {
    expect(parseChoices('{"wordle-battle":true,"stories":false,"race":true,"rhyme-match":"yes"}')).toEqual({
      'wordle-battle': true,
      stories: false,
    });
  });

  it('reads a broken or missing value as nothing remembered', () => {
    expect(parseChoices(null)).toEqual({});
    expect(parseChoices('not json')).toEqual({});
    expect(parseChoices('[1,2]')).toEqual({});
  });
});

describe('startingChoice', () => {
  it('starts where the host left it: the server’s memory, then this phone’s', () => {
    expect(startingChoice('wordle-battle', { 'wordle-battle': true }, { 'wordle-battle': false })).toBe(true);
    expect(startingChoice('wordle-battle', {}, { 'wordle-battle': true })).toBe(true);
    expect(startingChoice('wordle-battle', null, { 'wordle-battle': true })).toBe(true);
  });

  it('starts Friendly when nothing was ever chosen: a first game among friends puts nobody’s rank on the line', () => {
    expect(startingChoice('stories', null, {})).toBe(false);
    expect(startingChoice('rhyme-match', {}, {})).toBe(false);
  });
});
