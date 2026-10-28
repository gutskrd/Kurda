import { afterEach, describe, expect, it } from 'vitest';
import { autoplayOn, onLessonSound, playLessonSound, resetLessonSounds, setAutoplay, setLessonSounds, soundName } from './sounds';

afterEach(() => {
  setLessonSounds(true);
  resetLessonSounds();
});

describe('the lesson’s chimes on the website', () => {
  it('climbs with a run of right answers, up to the fourth step', () => {
    expect([0, 1, 2, 3, 7].map((step) => soundName('correct', step))).toEqual(['correct-1', 'correct-2', 'correct-3', 'correct-4', 'correct-4']);
  });

  it('has the reward of a streak kept, by its own name', () => {
    const heard: string[] = [];
    const stop = onLessonSound((s) => heard.push(s));
    playLessonSound('reward');
    stop();
    expect(heard).toEqual(['reward']);
  });

  it('plays pronunciations by themselves unless that is turned off on this device', () => {
    expect(autoplayOn()).toBe(true);
    setAutoplay(false);
    expect(autoplayOn()).toBe(false);
    setAutoplay(true);
    expect(autoplayOn()).toBe(true);
  });

  it('is quiet when lesson sounds are turned off, and never twice at once', () => {
    const heard: string[] = [];
    const stop = onLessonSound((s) => heard.push(s));
    playLessonSound('correct');
    playLessonSound('wrong'); // within 90 ms of the last: not heard
    resetLessonSounds();
    setLessonSounds(false);
    playLessonSound('complete');
    stop();
    expect(heard).toEqual(['correct-1']);
  });
});
