import { describe, expect, it } from 'vitest';
import { dayLabel, isEmojiOnly, placeMessages, timeLabel, type DayWords } from './thread';

const WORDS: DayWords = { locale: 'en-GB', today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' };

/** A message at a local time on a local day, so the test reads the same in any time zone. */
const at = (id: string, senderId: string, day: number, hour: number, minute = 0) => ({
  id,
  senderId,
  createdAt: new Date(2026, 9, day, hour, minute).toISOString(),
});

const NOW = new Date(2026, 9, 20, 18, 0);

describe('placing the messages of a thread', () => {
  it('reads one person’s messages in a row as one run: the first, the ones between, the last', () => {
    const places = placeMessages([at('a', 'u1', 20, 10, 0), at('b', 'u1', 20, 10, 1), at('c', 'u1', 20, 10, 2), at('d', 'u2', 20, 10, 3)], NOW, WORDS);
    expect([places.get('a')!.first, places.get('a')!.last]).toEqual([true, false]);
    expect([places.get('b')!.first, places.get('b')!.last]).toEqual([false, false]);
    expect([places.get('c')!.first, places.get('c')!.last]).toEqual([false, true]);
    expect([places.get('d')!.first, places.get('d')!.last]).toEqual([true, true]);
  });

  it('starts a new run after five minutes, even for the same sender', () => {
    const places = placeMessages([at('a', 'u1', 20, 10, 0), at('b', 'u1', 20, 10, 6)], NOW, WORDS);
    expect(places.get('a')!.last).toBe(true);
    expect(places.get('b')!.first).toBe(true);
  });

  it('names a day over its first message only, and a new day always starts a new run', () => {
    const places = placeMessages([at('a', 'u1', 19, 23, 58), at('b', 'u1', 20, 0, 1), at('c', 'u1', 20, 0, 2)], NOW, WORDS);
    expect(places.get('a')!.day).toBe('Yesterday');
    expect(places.get('b')!.day).toBe('Today');
    expect(places.get('c')!.day).toBeNull();
    // two minutes apart, but midnight is between them
    expect(places.get('a')!.last).toBe(true);
    expect(places.get('b')!.first).toBe(true);
  });

  it('says the time once a moment: under the run a pause follows, and the last of a day', () => {
    const places = placeMessages(
      [at('a', 'u1', 20, 10, 0), at('b', 'u2', 20, 10, 1), at('c', 'u1', 20, 10, 2), at('d', 'u2', 20, 11, 0), at('e', 'u2', 20, 11, 1)],
      NOW,
      WORDS,
    );
    // a lively exchange: no column of the same minute down its side
    expect(places.get('a')!.timed).toBe(false);
    expect(places.get('b')!.timed).toBe(false);
    // the talk paused here for most of an hour
    expect(places.get('c')!.timed).toBe(true);
    // the time belongs to the last message of the run, not to each of them
    expect(places.get('d')!.timed).toBe(false);
    expect(places.get('e')!.timed).toBe(true);
  });

  it('keeps a message whose time will not parse on its own, under "Earlier"', () => {
    const places = placeMessages([{ id: 'x', senderId: 'u1', createdAt: 'not a date' }, at('a', 'u1', 20, 10, 0)], NOW, WORDS);
    expect(places.get('x')).toEqual({ day: 'Earlier', first: true, last: true, timed: true });
    expect(places.get('a')!.first).toBe(true);
  });
});

describe('what a day is called', () => {
  it('names today and yesterday, the rest of the week by weekday, and anything older by date', () => {
    expect(dayLabel(new Date(2026, 9, 20, 9), NOW, WORDS)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 19, 23), NOW, WORDS)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 16, 12), NOW, WORDS)).toBe('Friday');
    expect(dayLabel(new Date(2026, 9, 1, 12), NOW, WORDS)).toBe('1 October');
    // another year says which
    expect(dayLabel(new Date(2025, 2, 3, 12), NOW, WORDS)).toBe('3 March 2025');
  });

  it('writes the time on the clock, and nothing for a time that will not parse', () => {
    expect(timeLabel(new Date(2026, 9, 20, 14, 5).toISOString(), 'en-GB')).toBe('14:05');
    expect(timeLabel('not a date', 'en-GB')).toBe('');
  });
});

describe('a message that is only emoji', () => {
  it('is one to three emoji and nothing else', () => {
    expect(isEmojiOnly('❤️')).toBe(true);
    expect(isEmojiOnly('👋')).toBe(true);
    expect(isEmojiOnly('😀 😀 😀')).toBe(true);
    expect(isEmojiOnly('😀😀😀😀')).toBe(false);
    expect(isEmojiOnly('Silav 👋')).toBe(false);
    expect(isEmojiOnly('ok')).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly(null)).toBe(false);
  });

  it('counts a joined emoji, a skin tone and a flag as one each', () => {
    // a family is four people joined into one picture
    expect(isEmojiOnly('👨‍👩‍👧‍👦')).toBe(true);
    expect(isEmojiOnly('👍🏽👍🏽👍🏽')).toBe(true);
    // two halves make one flag
    expect(isEmojiOnly('🇩🇪🇳🇱🇫🇷')).toBe(true);
    expect(isEmojiOnly('🇩🇪🇳🇱🇫🇷🇪🇸')).toBe(false);
  });
});
