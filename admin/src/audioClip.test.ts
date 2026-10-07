import { describe, expect, it } from 'vitest';
import { ClipError, RATE, encodeWav, shape, voicedRange } from './audioClip';

/** silence, then `voice` seconds of a 200 Hz tone at `level`, then silence */
function take(before: number, voice: number, after: number, level = 0.3): Float32Array {
  const out = new Float32Array(Math.round((before + voice + after) * RATE));
  const a = Math.round(before * RATE);
  const b = a + Math.round(voice * RATE);
  for (let i = a; i < b; i++) out[i] = Math.sin((2 * Math.PI * 200 * i) / RATE) * level;
  // a little room noise everywhere
  for (let i = 0; i < out.length; i++) out[i]! += (((i * 7919) % 100) / 100 - 0.5) * 0.002;
  return out;
}

describe('the alphabet clip', () => {
  it('finds the voice inside the silence', () => {
    const [s, e] = voicedRange(take(1, 0.5, 1))!;
    expect(s / RATE).toBeCloseTo(1, 1);
    expect(e / RATE).toBeCloseTo(1.5, 1);
  });

  it('cuts the dead air, keeping a breath either side', () => {
    const out = shape(take(1.2, 0.6, 2));
    expect(out.length / RATE).toBeGreaterThan(0.75);
    expect(out.length / RATE).toBeLessThan(0.95);
  });

  it('brings a quiet and a loud take to the same loudness, without clipping', () => {
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    const quiet = shape(take(0.3, 0.6, 0.3, 0.03));
    const loud = shape(take(0.3, 0.6, 0.3, 0.9));
    expect(rms(quiet) / rms(loud)).toBeCloseTo(1, 1);
    expect(Math.max(...loud.map(Math.abs))).toBeLessThanOrEqual(0.9);
  });

  it('fades in and out, so neither end clicks', () => {
    const out = shape(take(0, 0.6, 0));
    expect(Math.abs(out[0]!)).toBe(0);
    expect(Math.abs(out[out.length - 1]!)).toBe(0);
  });

  it('says what is wrong when there is nothing to keep', () => {
    expect(() => shape(take(1, 0, 1))).toThrow(ClipError);
    expect(() => shape(take(0.2, 5, 0.2))).toThrow(/under 4 s/);
    expect(() => shape(take(0.5, 0.05, 0.5))).toThrow(/Too short/);
  });

  it('takes a sentence, when the caller allows one', () => {
    const out = shape(take(0.3, 9, 0.3), RATE, 15, 'one sentence');
    expect(out.length / RATE).toBeGreaterThan(9);
    expect(() => shape(take(0.2, 16, 0.2), RATE, 15, 'one sentence')).toThrow(/Keep it to one sentence — under 15 s/);
  });

  it('writes a WAV the server can read', () => {
    const wav = encodeWav(new Float32Array(RATE));
    const text = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(wav.length).toBe(44 + RATE * 2);
  });
});
