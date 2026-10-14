import { describe, it, expect, vi, afterEach } from 'vitest';
import { GIFT_REDUCED_MOTION_MS, GIFT_UNWRAP_MS } from '@kurda/shared';
import { CHIME_NOTES, giftSoundOn, playChime, scatter, sendMs, setGiftSound, unwrapMs } from './motion';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('gift timing', () => {
  it('plays each tier for its shared time, and a short fade with less motion', () => {
    expect(unwrapMs('common', false)).toBe(GIFT_UNWRAP_MS.common);
    expect(unwrapMs('rare', false)).toBe(GIFT_UNWRAP_MS.rare);
    expect(unwrapMs('legendary', false)).toBeLessThanOrEqual(2500);
    expect(unwrapMs('legendary', true)).toBe(GIFT_REDUCED_MOTION_MS);
    expect(sendMs(true)).toBe(GIFT_REDUCED_MOTION_MS);
  });

  it('scatters the same way every time', () => {
    expect(scatter(3)).toBe(scatter(3));
    expect(scatter(3)).toBeGreaterThanOrEqual(0);
    expect(scatter(3)).toBeLessThan(1);
  });
});

describe('the chime', () => {
  it('is on until it is turned off, on this device', () => {
    expect(giftSoundOn()).toBe(true);
    setGiftSound(false);
    expect(giftSoundOn()).toBe(false);
    setGiftSound(true);
    expect(giftSoundOn()).toBe(true);
  });

  it('rises, and grows with the tier', () => {
    for (const notes of Object.values(CHIME_NOTES)) expect([...notes]).toEqual([...notes].sort((a, b) => a - b));
    expect(CHIME_NOTES.legendary.length).toBeGreaterThan(CHIME_NOTES.common.length);
  });

  function fakeAudio(): { made: number } {
    const counter = { made: 0 };
    class FakeContext {
      currentTime = 0;
      state = 'running';
      destination = {};
      constructor() {
        counter.made += 1;
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
      createOscillator() {
        return { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
      }
      createGain() {
        const node = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
        return node;
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    return counter;
  }

  it('stays silent when turned off, or when the device asks for less motion', () => {
    const audio = fakeAudio();
    setGiftSound(false);
    playChime('rare');
    expect(audio.made).toBe(0);
    setGiftSound(true);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    playChime('rare');
    expect(audio.made).toBe(0);
  });

  it('sounds when allowed, without a file to fetch', () => {
    const audio = fakeAudio();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
    expect(() => playChime('legendary')).not.toThrow();
    expect(audio.made).toBe(1);
  });
});
