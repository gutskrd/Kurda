import { describe, expect, it } from 'vitest';
import { MAX_CHANGES_PER_SECOND, MIN_CLOSURE_MS, MIN_HOLD_MS, lipsyncFromAudio, lipsyncFromText } from './align.js';
import { LIPSYNC_MAX_CUES, decodeLipsync, encodeLipsync, visemeAt, type LipsyncTimeline } from './timeline.js';
import type { Viseme } from './visemes.js';

const RATE = 22050;

/**
 * Synthetic speech: each number is a syllable that long, swelling to its
 * vowel and dipping (never to silence) between; `{ pause }` is silence. Like
 * a studio clip, it has a short lead and a longer tail of silence.
 */
type Plan = Array<number | { pause: number }>;
function speech(plan: Plan, options: { rate?: number; lead?: number; tail?: number; hiss?: number } = {}): Float32Array {
  const rate = options.rate ?? RATE;
  const lead = options.lead ?? 80;
  const tail = options.tail ?? 150;
  const total = lead + tail + plan.reduce<number>((sum, p) => sum + (typeof p === 'number' ? p : p.pause), 0);
  const pcm = new Float32Array(Math.round((total / 1000) * rate));
  let state = 5;
  if (options.hiss) {
    for (let i = 0; i < pcm.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      pcm[i] = options.hiss * ((state / 0x7fffffff) * 2 - 1);
    }
  }
  let at = lead;
  for (const part of plan) {
    if (typeof part !== 'number') {
      at += part.pause;
      continue;
    }
    const a = Math.round((at / 1000) * rate);
    const n = Math.round((part / 1000) * rate);
    for (let i = 0; i < n; i++) {
      const t = (a + i) / rate;
      const level = 0.15 + 0.85 * Math.sin((Math.PI * i) / n) ** 2;
      const wave = Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t) + 0.3 * Math.sin(2 * Math.PI * 420 * t);
      pcm[a + i]! += (0.35 * level * wave) / 1.8;
    }
    at += part;
  }
  return pcm;
}

/** Where each syllable's middle falls, in ms, for a plan made with the default lead. */
function middles(plan: Plan, lead = 80): number[] {
  const out: number[] = [];
  let at = lead;
  for (const part of plan) {
    if (typeof part === 'number') out.push(at + part / 2);
    at += typeof part === 'number' ? part : part.pause;
  }
  return out;
}

/** How long each cue holds. */
const lengths = (tl: LipsyncTimeline): number[] =>
  tl.cues.map((cue, i) => (i + 1 < tl.cues.length ? tl.cues[i + 1]!.startMs : tl.durationMs) - cue.startMs);

/** Everything a timeline must be to look right, whatever it was made from. */
function looksRight(tl: LipsyncTimeline): void {
  const held = lengths(tl);
  tl.cues.forEach((cue, i) => {
    if (i > 0) expect(cue.viseme, `cue ${i} repeats the one before`).not.toBe(tl.cues[i - 1]!.viseme);
    // the last runs on past the end of the sound, where the mouth is at rest anyway
    if (i === tl.cues.length - 1) return;
    expect(held[i], `cue ${i} (${cue.viseme} at ${cue.startMs}) flickers`).toBeGreaterThanOrEqual(MIN_HOLD_MS);
    if (cue.viseme === 'mbp') expect(held[i], `closure at ${cue.startMs}`).toBeGreaterThanOrEqual(MIN_CLOSURE_MS);
  });
  for (let i = 1; i < tl.cues.length; i++) {
    const from = tl.cues[i]!.startMs;
    const changes = tl.cues.slice(i).filter((c) => c.startMs < from + 1000).length;
    expect(changes, `changes in the second from ${from}`).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
  }
  // and it is a timeline the API will store
  expect(decodeLipsync(encodeLipsync(tl), { maxCues: LIPSYNC_MAX_CUES, maxDurationMs: tl.durationMs })).toEqual(tl);
}

const shapes = (tl: LipsyncTimeline): Viseme[] => tl.cues.map((c) => c.viseme);
const restAt = (tl: LipsyncTimeline, ...times: number[]): void => {
  for (const t of times) expect(visemeAt(tl, t), `at ${t} ms`).toBe('rest');
};

describe('lipsyncFromAudio', () => {
  // "Silav, tu çawa yî?": si-lav, a breath at the comma, tu-ça-wa-yî
  const plan: Plan = [170, 230, { pause: 300 }, 160, 170, 170, 220];
  const pcm = speech(plan);
  const tl = lipsyncFromAudio('Silav, tu çawa yî?', pcm, RATE);

  it('lasts as long as the recording', () => {
    expect(tl.durationMs).toBe(Math.round((pcm.length / RATE) * 1000));
  });

  it('rests before the speech starts, at the pause and after the speech ends', () => {
    expect(tl.cues[0]).toEqual({ startMs: 0, viseme: 'rest' });
    restAt(tl, 0, 40, 600, 700, tl.durationMs - 60, tl.durationMs + 100);
    expect(tl.cues[tl.cues.length - 1]!.viseme).toBe('rest');
  });

  it('closes the mouth at the comma, where the speaker paused', () => {
    // the pause runs from 480 to 780 ms in the recording
    const rest = tl.cues.find((c, i) => i > 0 && c.viseme === 'rest' && c.startMs < 900)!;
    expect(Math.abs(rest.startMs - 480)).toBeLessThanOrEqual(40);
    const after = tl.cues[tl.cues.indexOf(rest) + 1]!;
    expect(Math.abs(after.startMs - 780)).toBeLessThanOrEqual(40);
    // the words before the comma are said before it, the rest after
    const before = shapes({ ...tl, cues: tl.cues.filter((c) => c.startMs > 0 && c.startMs < rest.startMs) });
    expect(before).toEqual(['etc', 'i', 'l', 'a', 'fv']);
  });

  it('opens the mouth for each vowel while its syllable is loudest', () => {
    const centres = middles(plan);
    const vowels = new Set<Viseme>(['a', 'e', 'i', 'o', 'u']);
    // si-lav and tu-ça-wa-yî: every syllable's loudest moment shows its vowel
    expect(centres.map((t) => visemeAt(tl, t))).toEqual(['i', 'a', 'u', 'a', 'a', 'i']);
    for (const t of centres) expect(vowels.has(visemeAt(tl, t))).toBe(true);
  });

  it('looks right: closures held, no flicker, no flutter, no repeats', () => {
    looksRight(tl);
  });

  it('pulls the vowels onto the syllables, between closures', () => {
    // "ba ba ba ba" said without a pause: the lips meet between syllables, open at each peak
    const quick: Plan = [220, 220, 220, 220];
    const out = lipsyncFromAudio('ba ba ba ba', speech(quick), RATE);
    for (const t of middles(quick)) expect(visemeAt(out, t), `at ${t}`).toBe('a');
    expect(shapes(out).filter((v) => v === 'mbp')).toHaveLength(4);
    expect(shapes(out).filter((v) => v === 'a')).toHaveLength(4);
    looksRight(out);
  });

  it('rests the mouth in a silence the text does not mark, and narrows it in a short one', () => {
    // one word, said with a hesitation in the middle
    const out = lipsyncFromAudio('Bavo', speech([200, { pause: 300 }, 200]), RATE);
    restAt(out, 350, 500);
    expect(visemeAt(out, 180)).toBe('a');
    expect(visemeAt(out, 680)).toBe('o');
    looksRight(out);
  });

  it('matches a pause to a word boundary even without punctuation', () => {
    const out = lipsyncFromAudio('Ez baş im', speech([150, { pause: 250 }, 200, 180]), RATE);
    // the pause is from 230 to 480 ms: "ez" before it, "baş im" after
    const pause = out.cues.find((c, i) => i > 0 && c.viseme === 'rest')!;
    expect(Math.abs(pause.startMs - 230)).toBeLessThanOrEqual(40);
    expect(out.cues.filter((c) => c.startMs > 0 && c.startMs < pause.startMs).map((c) => c.viseme)).toEqual(['e', 'etc']);
    looksRight(out);
  });

  it('never flutters, however long the text is for the recording', () => {
    const long =
      'Ez ji bajarê Amedê me û ez li zanîngehê dixwînim, lê niha ez li malê me bi malbata xwe re, ji ber ku betlane ye.';
    const out = lipsyncFromAudio(long, speech([200, 200, 200, 200]), RATE);
    looksRight(out);
    expect(out.cues[0]!.viseme).toBe('rest');
    expect(out.cues[out.cues.length - 1]!.viseme).toBe('rest');
    expect(out.cues.length).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND + 2);
  });

  it('keeps every closure visible', () => {
    const out = lipsyncFromAudio('Bimbim pembû', speech([150, 150, { pause: 200 }, 160, 160]), RATE);
    expect(shapes(out)).toContain('mbp');
    looksRight(out);
  });

  it('reads Soranî, pausing at its own punctuation', () => {
    // sipas, a breath at the comma, zor başim
    const out = lipsyncFromAudio('سوپاس، زۆر باشم.', speech([150, 220, { pause: 250 }, 200, 150, 200]), RATE, { script: 'arabic' });
    restAt(out, 500, 600);
    expect(shapes(out)).toEqual(expect.arrayContaining(['mbp', 'a', 'o', 'u']));
    const pause = out.cues.find((c, i) => i > 0 && c.viseme === 'rest')!;
    expect(Math.abs(pause.startMs - 450)).toBeLessThanOrEqual(40);
    looksRight(out);
  });

  it('works through background noise', () => {
    const noisy = lipsyncFromAudio('Silav, tu çawa yî?', speech(plan, { hiss: 0.01, lead: 300, tail: 300 }), RATE);
    restAt(noisy, 100, 250, 800, 900);
    expect(middles(plan, 300).map((t) => visemeAt(noisy, t))).toEqual(['i', 'a', 'u', 'a', 'a', 'i']);
    looksRight(noisy);
  });

  it('rests throughout a recording with no speech in it', () => {
    const quiet = lipsyncFromAudio('Silav', new Float32Array(RATE), RATE);
    expect(quiet).toEqual({ durationMs: 1000, cues: [{ startMs: 0, viseme: 'rest' }] });
    const hiss = speech([], { hiss: 0.02, lead: 500, tail: 500 });
    expect(shapes(lipsyncFromAudio('Silav', hiss, RATE))).toEqual(['rest']);
  });

  it('still moves the mouth with the speech when the text says nothing', () => {
    const out = lipsyncFromAudio('?', speech([200, 200]), RATE);
    expect(shapes(out).filter((v) => v !== 'rest').length).toBeGreaterThan(0);
    restAt(out, 20, out.durationMs - 50);
    looksRight(out);
  });

  it('gives the same timeline for the same recording at any sample rate', () => {
    const at48 = lipsyncFromAudio('Silav, tu çawa yî?', speech(plan, { rate: 48000 }), 48000);
    expect(shapes(at48)).toEqual(shapes(tl));
    at48.cues.forEach((cue, i) => expect(Math.abs(cue.startMs - tl.cues[i]!.startMs)).toBeLessThanOrEqual(15));
  });

  it('is fast: ten seconds at 48 kHz in well under 50 ms', () => {
    const syllables: Plan = [];
    for (let i = 0; i < 40; i++) syllables.push(i % 8 === 7 ? { pause: 300 } : 180 + (i % 3) * 40);
    const pcm48 = speech(syllables, { rate: 48000, lead: 200, tail: 300 });
    expect(pcm48.length / 48000).toBeGreaterThanOrEqual(8);
    const text =
      'Ez ji bajarê Amedê me. Ez li zanîngehê dixwînim, lê niha ez li malê me. Malbata min mezin e, du bira û sê xwişkên min hene.';
    lipsyncFromAudio(text, pcm48, 48000); // warm up
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      lipsyncFromAudio(text, pcm48, 48000);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(50);
  });
});

describe('lipsyncFromText', () => {
  it('spreads the sounds evenly by weight, resting first, at the comma and at the end', () => {
    const tl = lipsyncFromText('Silav, heval', 2000);
    expect(tl.durationMs).toBe(2000);
    expect(tl.cues[0]).toEqual({ startMs: 0, viseme: 'rest' });
    expect(tl.cues[1]!.startMs).toBe(80);
    expect(shapes(tl)).toEqual(['rest', 'etc', 'i', 'l', 'a', 'fv', 'rest', 'etc', 'e', 'fv', 'a', 'l', 'rest']);
    // the long vowel a holds longer than the short i
    const held = lengths(tl);
    expect(held[4]!).toBeGreaterThan(held[2]!);
    expect(tl.cues[tl.cues.length - 1]!.startMs).toBeGreaterThanOrEqual(2000 - 150);
    looksRight(tl);
  });

  it('never stretches a short text over a long recording beyond slow speech', () => {
    const tl = lipsyncFromText('Na', 10_000);
    const end = tl.cues[tl.cues.length - 1]!;
    expect(end.viseme).toBe('rest');
    expect(end.startMs).toBeLessThan(1000);
    looksRight(tl);
  });

  it('caps the changes when the text is long for the time', () => {
    const tl = lipsyncFromText('Ez ji bajarê Amedê me û ez li zanîngehê dixwînim, lê niha ez li malê me.', 1200);
    looksRight(tl);
  });

  it('rests throughout when there is nothing to say, or no time to say it in', () => {
    expect(lipsyncFromText('…', 800)).toEqual({ durationMs: 800, cues: [{ startMs: 0, viseme: 'rest' }] });
    expect(lipsyncFromText('Silav', Number.NaN).durationMs).toBe(1);
    looksRight(lipsyncFromText('Silav', 30));
  });

  it('reads Soranî', () => {
    const tl = lipsyncFromText('سوپاس، زۆر باشم', 1800);
    expect(shapes(tl)).toContain('o');
    expect(shapes(tl).slice(1, -1)).toContain('rest');
    looksRight(tl);
  });
});
