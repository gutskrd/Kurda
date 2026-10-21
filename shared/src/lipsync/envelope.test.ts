import { describe, expect, it } from 'vitest';
import { ENVELOPE_FRAME_MS, analyzeEnvelope, type Envelope } from './envelope.js';

/** A recording of `ms` milliseconds of digital silence. */
function silence(ms: number, rate: number): Float32Array {
  return new Float32Array(Math.round((ms / 1000) * rate));
}

/** A voiced buzz (140 Hz and two overtones) from `fromMs` to `toMs`, at `amp`; `swell` rises and falls like a syllable. */
function buzz(pcm: Float32Array, rate: number, fromMs: number, toMs: number, amp: number, swell = false): Float32Array {
  const a = Math.round((fromMs / 1000) * rate);
  const n = Math.round(((toMs - fromMs) / 1000) * rate);
  for (let i = 0; i < n && a + i < pcm.length; i++) {
    const t = (a + i) / rate;
    const level = swell ? 0.15 + 0.85 * Math.sin((Math.PI * i) / n) ** 2 : 1;
    const wave = Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t) + 0.3 * Math.sin(2 * Math.PI * 420 * t);
    pcm[a + i]! += (amp * level * wave) / 1.8;
  }
  return pcm;
}

/** Steady hiss at `amp`, the same every run. */
function hiss(pcm: Float32Array, amp: number, seed = 11): Float32Array {
  let state = seed;
  for (let i = 0; i < pcm.length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    pcm[i]! += amp * ((state / 0x7fffffff) * 2 - 1);
  }
  return pcm;
}

const ms = (frame: number): number => frame * ENVELOPE_FRAME_MS;
const spans = (env: Envelope): Array<[number, number]> => env.segments.map((s) => [ms(s.start), ms(s.end)]);

/** Within `tolerance` ms of each other, edge for edge. */
function near(actual: Array<[number, number]>, expected: Array<[number, number]>, tolerance: number): void {
  expect(actual.length, JSON.stringify(actual)).toBe(expected.length);
  actual.forEach(([a, b], i) => {
    expect(Math.abs(a - expected[i]![0]), `start ${i}: ${a}`).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(b - expected[i]![1]), `end ${i}: ${b}`).toBeLessThanOrEqual(tolerance);
  });
}

describe('analyzeEnvelope', () => {
  it('measures loudness every 10 ms, whatever the sample rate', () => {
    for (const rate of [22050, 44100, 48000, 16000]) {
      const env = analyzeEnvelope(silence(1234, rate), rate);
      expect(env.frameMs).toBe(10);
      expect(env.durationMs).toBeCloseTo(1234, 0);
      expect(env.frameCount).toBe(Math.ceil((silence(1234, rate).length * 100) / rate));
      expect(env.db).toHaveLength(env.frameCount);
    }
  });

  it('finds tone bursts separated by silence, and where the speech starts and ends', () => {
    const rate = 48000;
    const pcm = silence(1700, rate);
    buzz(pcm, rate, 100, 400, 0.4);
    buzz(pcm, rate, 700, 1000, 0.4);
    buzz(pcm, rate, 1300, 1500, 0.4);
    const env = analyzeEnvelope(pcm, rate);
    near(spans(env), [[100, 400], [700, 1000], [1300, 1500]], 30);
    expect(ms(env.speechStart)).toBe(spans(env)[0]![0]);
    expect(ms(env.speechEnd)).toBe(spans(env)[2]![1]);
    expect(env.floorDb).toBe(-100);
    expect(env.peakDb).toBeGreaterThan(-20);
    // a flat burst's nucleus is its middle
    expect(env.peaks).toHaveLength(3);
    env.peaks.forEach((p, i) => expect(Math.abs(ms(p) - [250, 850, 1400][i]!)).toBeLessThanOrEqual(40));
  });

  it('sets its threshold from the noise floor, so the same speech in a noisy room is found the same', () => {
    const rate = 22050;
    const pcm = hiss(silence(1700, rate), 0.02);
    buzz(pcm, rate, 100, 400, 0.4);
    buzz(pcm, rate, 700, 1000, 0.4);
    buzz(pcm, rate, 1300, 1500, 0.4);
    const env = analyzeEnvelope(pcm, rate);
    // hiss at 0.02 is about -40 dB
    expect(env.floorDb).toBeGreaterThan(-45);
    expect(env.floorDb).toBeLessThan(-35);
    expect(env.thresholdDb).toBeGreaterThanOrEqual(env.floorDb + 6);
    near(spans(env), [[100, 400], [700, 1000], [1300, 1500]], 30);
    expect(env.peaks).toHaveLength(3);
  });

  it('finds no speech in noise alone, in silence, or in nothing', () => {
    for (const pcm of [hiss(silence(2000, 22050), 0.02), hiss(silence(2000, 22050), 0.002), silence(2000, 22050), new Float32Array(0)]) {
      const env = analyzeEnvelope(pcm, 22050);
      expect(env.segments).toEqual([]);
      expect(env.peaks).toEqual([]);
      expect(env.speechStart).toBe(-1);
      expect(env.speechEnd).toBe(-1);
    }
  });

  it('does not hear a DC offset as sound', () => {
    const offset = new Float32Array(22050).fill(0.3);
    expect(analyzeEnvelope(offset, 22050).segments).toEqual([]);
    const pcm = buzz(silence(1000, 22050), 22050, 300, 700, 0.3);
    for (let i = 0; i < pcm.length; i++) pcm[i]! += 0.25;
    near(spans(analyzeEnvelope(pcm, 22050)), [[300, 700]], 30);
  });

  it('keeps a silence too short to be a pause inside the word, and ignores a lone click', () => {
    const rate = 22050;
    const closure = silence(1000, rate);
    buzz(closure, rate, 100, 400, 0.4);
    buzz(closure, rate, 470, 800, 0.4);
    near(spans(analyzeEnvelope(closure, rate)), [[100, 800]], 30);

    const click = silence(1500, rate);
    buzz(click, rate, 100, 120, 0.8);
    buzz(click, rate, 800, 1200, 0.4);
    near(spans(analyzeEnvelope(click, rate)), [[800, 1200]], 30);
  });

  it('reaches back to a soft sound before the loud part, and on to one after it', () => {
    const rate = 22050;
    const pcm = silence(1500, rate);
    // a quiet s-like hiss leading into the vowel, and a fading tail
    const soft = hiss(silence(80, rate), 0.004);
    pcm.set(soft, Math.round(0.32 * rate));
    buzz(pcm, rate, 400, 900, 0.4);
    buzz(pcm, rate, 900, 1000, 0.006);
    const env = analyzeEnvelope(pcm, rate);
    expect(env.segments).toHaveLength(1);
    expect(ms(env.speechStart)).toBeLessThanOrEqual(340);
    expect(ms(env.speechEnd)).toBeGreaterThanOrEqual(980);
  });

  it('finds each syllable of continuous speech as a peak', () => {
    const rate = 22050;
    const pcm = silence(1300, rate);
    // four syllables with no pause between them, each swelling to its vowel
    const syllables: Array<[number, number]> = [
      [100, 300],
      [300, 560],
      [560, 760],
      [760, 1100],
    ];
    for (const [a, b] of syllables) buzz(pcm, rate, a, b, 0.4, true);
    const env = analyzeEnvelope(pcm, rate);
    expect(env.segments).toHaveLength(1);
    expect(env.peaks).toHaveLength(4);
    env.peaks.forEach((p, i) => {
      const [a, b] = syllables[i]!;
      expect(Math.abs(ms(p) - (a + b) / 2), `peak ${i} at ${ms(p)}`).toBeLessThanOrEqual(40);
    });
  });

  it('takes a held sound cut with no silence around it for speech throughout', () => {
    const rate = 22050;
    const held = buzz(silence(600, rate), rate, 0, 600, 0.4);
    const env = analyzeEnvelope(held, rate);
    expect(env.segments).toEqual([{ start: 0, end: env.frameCount }]);
    expect(env.peaks).toHaveLength(1);
  });

  it('reads the same at any volume', () => {
    const rate = 22050;
    const make = (amp: number): Envelope => {
      const pcm = silence(1500, rate);
      buzz(pcm, rate, 100, 500, amp, true);
      buzz(pcm, rate, 800, 1300, amp, true);
      return analyzeEnvelope(pcm, rate);
    };
    const loud = make(0.8);
    const quiet = make(0.02);
    expect(quiet.segments).toEqual(loud.segments);
    expect(quiet.peaks).toEqual(loud.peaks);
  });
});
