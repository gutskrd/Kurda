import { describe, expect, it, vi } from 'vitest';
import type { GamesAvailability } from '@kurda/shared';
import { exercisesOf, leaveExercise } from './exercises';

const answer = (games: Array<[string, boolean]>): GamesAvailability =>
  ({ dialect: 'kmr', games: games.map(([id, available]) => ({ id, available, difficulties: available ? ['beginner'] : [] })) }) as unknown as GamesAvailability;

describe('the lessons’ exercises on the phone', () => {
  it('offers the two that have a screen, in the registry’s order, each only while it can be done', () => {
    expect(exercisesOf(answer([['hear-it', true], ['build-sentence', true]])).map((e) => e.route)).toEqual(['BuildSentence', 'HearIt']);
    expect(exercisesOf(answer([['hear-it', true], ['build-sentence', false]])).map((e) => e.key)).toEqual(['hear']);
    expect(exercisesOf(answer([]))).toEqual([]);
  });

  it('never offers a game, and nothing before the answer has arrived', () => {
    expect(exercisesOf(answer([['memory-thief', true], ['impostor', true], ['detective', true]]))).toEqual([]);
    expect(exercisesOf(null)).toEqual([]);
  });

  it('names each exercise as its own screen does, with one short line', () => {
    const [sentence, hear] = exercisesOf(answer([['build-sentence', true], ['hear-it', true]]));
    expect(sentence).toMatchObject({ title: 'games.sentence.name', detail: 'learn.tools.sentenceHint' });
    expect(hear).toMatchObject({ title: 'games.hear.name', detail: 'learn.tools.hearHint' });
    expect(sentence!.tone).not.toBe(hear!.tone);
  });
});

describe('leaving an exercise', () => {
  const nav = (back: boolean) => ({ canGoBack: () => back, goBack: vi.fn(), replace: vi.fn() });

  it('goes back to where it was opened from', () => {
    const n = nav(true);
    leaveExercise(n);
    expect(n.goBack).toHaveBeenCalledTimes(1);
    expect(n.replace).not.toHaveBeenCalled();
  });

  it('leaves to the practice hub when a link opened it and there is nothing behind it', () => {
    const n = nav(false);
    leaveExercise(n);
    expect(n.replace).toHaveBeenCalledWith('PracticeHub');
    expect(n.goBack).not.toHaveBeenCalled();
  });
});
