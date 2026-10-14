import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  defaultVariety,
  rememberCourseDialect,
  rememberVariety,
  rememberedEnglish,
  rememberedSolo,
  rememberedTextSize,
  resetSessionVariety,
  showEnglishFor,
  soloCountFor,
} from './prefs';

afterEach(() => {
  localStorage.clear();
  resetSessionVariety();
  vi.restoreAllMocks();
});

describe('the variety Stories opens on', () => {
  it('is the course the learner is on, first', () => {
    rememberCourseDialect('sorani');
    localStorage.setItem('hevalo.stories.variety', 'kurmanci');
    expect(defaultVariety('en')).toBe('sorani');
    // a course spelled the course's way is read as its variety
    rememberCourseDialect('kurmanji');
    expect(defaultVariety('ckb')).toBe('kurmanci');
  });

  it('is Soranî for a Soranî interface, without a course', () => {
    localStorage.setItem('hevalo.stories.variety', 'kurmanci');
    expect(defaultVariety('ckb')).toBe('sorani');
  });

  it('is the last choice next, then Kurmancî', () => {
    expect(defaultVariety('en')).toBe('kurmanci');
    localStorage.setItem('hevalo.stories.variety', 'sorani');
    expect(defaultVariety('de')).toBe('sorani');
  });

  it('keeps a choice made in this tab', () => {
    rememberCourseDialect('kurmanji');
    rememberVariety('sorani');
    expect(defaultVariety('en')).toBe('sorani');
  });

  it('works on a device that remembers nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberVariety('sorani')).not.toThrow();
    resetSessionVariety();
    expect(defaultVariety('en')).toBe('kurmanci');
    expect(rememberedTextSize()).toBe(1);
    expect(rememberedSolo()).toEqual({ questionCount: null, timerSeconds: 0, textDuring: 'visible' });
  });
});

describe('reading and quiz preferences', () => {
  it('ignores a text size it does not know', () => {
    localStorage.setItem('hevalo.stories.textSize', '9');
    expect(rememberedTextSize()).toBe(1);
    localStorage.setItem('hevalo.stories.textSize', '0');
    expect(rememberedTextSize()).toBe(0);
  });

  it('shows English under level-1 questions until the reader chooses', () => {
    expect(rememberedEnglish()).toBeNull();
    expect(showEnglishFor(1, null)).toBe(true);
    expect(showEnglishFor(2, null)).toBe(false);
    expect(showEnglishFor(1, false)).toBe(false);
    expect(showEnglishFor(3, true)).toBe(true);
  });

  it('uses a remembered count only where the length offers it', () => {
    expect(soloCountFor('short', 10)).toBe(3);
    expect(soloCountFor('long', 10)).toBe(10);
    expect(soloCountFor('medium', null)).toBe(5);
  });

  it('drops remembered quiz settings that are not presets', () => {
    localStorage.setItem('hevalo.stories.quiz', JSON.stringify({ questionCount: 5, timerSeconds: 45, textDuring: 'maybe' }));
    expect(rememberedSolo()).toEqual({ questionCount: 5, timerSeconds: 0, textDuring: 'visible' });
  });
});
