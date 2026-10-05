import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fresh(response: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => response })));
  return import('./audio');
}

describe('recordings from the admin panel', () => {
  it('play instead of the synthesised clip, for their keys only', async () => {
    const audio = await fresh({ clips: { 'kmr:sound:c': 'https://cdn.example/alphabet-audio/c.wav' } });
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(true);
    await audio.loadRecordings();
    expect(audio.latinSound('c')).toBe('https://cdn.example/alphabet-audio/c.wav');
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(false);
    expect(audio.isSynthesised(audio.latinSound('ç'))).toBe(true);
  });

  /** a Soranî letter shares its Kurmancî partner's sound, recording included */
  it('carry over to the Soranî partner letter', async () => {
    const audio = await fresh({ clips: { 'kmr:sound:c': 'https://cdn.example/c.wav' } });
    await audio.loadRecordings();
    const { SORANI } = await import('./letters');
    expect(audio.soraniSound(SORANI.find((l) => l.id === 'cîm')!)).toBe('https://cdn.example/c.wav');
  });

  it('ignore unknown keys and anything not https', async () => {
    const audio = await fresh({ clips: { 'kmr:sound:zz': 'https://x/y.wav', 'kmr:sound:c': 'javascript:alert(1)' } });
    await audio.loadRecordings();
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(true);
  });

  it('leave the synthesised clips in place when the API is down', async () => {
    const audio = await fresh({}, false);
    await audio.loadRecordings();
    expect(audio.isSynthesised(audio.latinSound('c'))).toBe(true);
  });
});
