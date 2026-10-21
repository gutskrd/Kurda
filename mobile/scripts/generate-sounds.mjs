/**
 * Generate the phone's sound effects: a handful of short chimes, synthesised
 * here from sine partials rather than taken from a sample library, so they are
 * the app's own and nobody else's.
 *
 * Every one is soft at the start (no click), short, and quiet beside speech:
 * they sit under the lesson's own audio, never over it. A wrong answer is a
 * low, muffled pair of notes falling a little — never a buzzer; the person
 * getting it wrong is often a child learning.
 *
 * Run from the repo root after changing a sound:
 *
 *   node mobile/scripts/generate-sounds.mjs
 *
 * Writes 16-bit mono WAV files to mobile/assets/sounds/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44_100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** A note's frequency, from its distance in semitones from A4. */
const hz = (semitonesFromA4) => 440 * 2 ** (semitonesFromA4 / 12);
const NOTE = { A3: -12, C4: -9, E4: -5, F4: -4, A4: 0, B4: 2, C5: 3, D5: 5, E5: 7, Fs5: 9, G5: 10, Gs5: 11, A5: 12, B5: 14, C6: 15, Cs6: 16, D6: 17, Ds6: 18, E6: 19, Fs6: 21, G6: 22, B6: 26, D7: 29 };

/**
 * One struck note: a few partials of a soft bell (the fundamental, its octave
 * and a quieter twelfth), a 6 ms rise so there is no click, and an
 * exponential fall whose length is `decay` seconds.
 */
function bell(buffer, start, freq, { gain = 0.5, decay = 0.35, length = 0.6, partials = [[1, 1], [2, 0.32], [3, 0.12]] } = {}) {
  const from = Math.round(start * RATE);
  const n = Math.round(length * RATE);
  for (let i = 0; i < n && from + i < buffer.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.006);
    const envelope = attack * Math.exp(-t / decay);
    let sample = 0;
    for (const [ratio, amp] of partials) sample += amp * Math.sin(2 * Math.PI * freq * ratio * t);
    buffer[from + i] += gain * envelope * sample;
  }
}

/** A short, soft room: a few faint echoes, so a chime rings rather than stops dead. */
function room(buffer, taps = [[0.043, 0.18], [0.071, 0.12], [0.113, 0.08]]) {
  const out = Float64Array.from(buffer);
  for (const [delay, amp] of taps) {
    const d = Math.round(delay * RATE);
    for (let i = d; i < out.length; i++) out[i] += amp * buffer[i - d];
  }
  return out;
}

/** Scaled so its loudest moment is `peak` of full scale, then faded out over the last 30 ms. */
function finish(buffer, peak) {
  let max = 0;
  for (const v of buffer) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? peak / max : 0;
  const fade = Math.round(0.03 * RATE);
  return buffer.map((v, i) => v * scale * Math.min(1, (buffer.length - i) / fade));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function make(seconds, draw, peak) {
  const buffer = new Float64Array(Math.round(seconds * RATE));
  draw(buffer);
  return wav(finish(room(buffer), peak));
}

/*
 * A right answer: two notes a fifth apart, the second a beat after the
 * first. A run of right answers climbs a step each time, up to the fourth,
 * so the run itself can be heard.
 */
const CORRECT = [
  [NOTE.E5, NOTE.B5],
  [NOTE.Fs5, NOTE.Cs6],
  [NOTE.Gs5, NOTE.Ds6],
  [NOTE.B5, NOTE.Fs6],
];

const SOUNDS = {
  ...Object.fromEntries(
    CORRECT.map(([a, b], i) => [
      `correct-${i + 1}`,
      make(0.7, (buf) => {
        bell(buf, 0, hz(a), { gain: 0.5, decay: 0.16 });
        bell(buf, 0.085, hz(b), { gain: 0.6, decay: 0.3 });
      }, 0.5),
    ]),
  ),
  // a miss: low and muffled (almost no upper partials), falling a little, and quieter than a right answer
  wrong: make(0.55, (buf) => {
    const soft = [[1, 1], [2, 0.08]];
    bell(buf, 0, hz(NOTE.A3), { gain: 0.6, decay: 0.12, partials: soft });
    bell(buf, 0.11, hz(NOTE.F4 - 12), { gain: 0.6, decay: 0.16, partials: soft });
  }, 0.32),
  // a lesson finished: four notes rising to the octave, the last left to ring
  complete: make(1.6, (buf) => {
    [NOTE.C5, NOTE.E5, NOTE.G5].forEach((n, i) => bell(buf, i * 0.09, hz(n), { gain: 0.45, decay: 0.2 }));
    bell(buf, 0.27, hz(NOTE.C6), { gain: 0.6, decay: 0.55, length: 1.3 });
    bell(buf, 0.27, hz(NOTE.G6), { gain: 0.16, decay: 0.45, length: 1.1 });
  }, 0.55),
  // something earned (a goal met, a streak kept, a badge, a gift): three quick high notes and a shimmer
  reward: make(1.2, (buf) => {
    [NOTE.G6, NOTE.B6, NOTE.D7].forEach((n, i) => bell(buf, i * 0.06, hz(n), { gain: 0.35, decay: 0.25, partials: [[1, 1], [2.01, 0.25]] }));
    bell(buf, 0.18, hz(NOTE.G6) / 2, { gain: 0.3, decay: 0.5, length: 1 });
  }, 0.45),
};

mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(SOUNDS)) {
  writeFileSync(join(OUT, `${name}.wav`), data);
  console.log(`${name}.wav  ${(data.length / 1024).toFixed(0)} KB`);
}
