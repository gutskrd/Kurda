/**
 * A recording's lip-sync timeline, from its text and its sound.
 *
 * The text says which mouth shapes come in which order (letters.ts); the sound
 * says when (envelope.ts). The two are put together in three steps:
 *
 *   1. Pauses. The silences in the recording are matched to the places in the
 *      text a speaker can stop: punctuation first, then any gap between two
 *      words. Each run of words between matched pauses is said in the stretch
 *      of speech between them, so a sentence that pauses at its comma closes
 *      the mouth at the comma, wherever in the recording that falls.
 *   2. Syllables. Within a run, the sounds are spread over the speech by their
 *      weights, and then each vowel is pulled toward the loudness peak nearest
 *      it in order — a long vowel all the way, a short one part of it — with
 *      the consonants between stretched or squeezed to fit.
 *   3. Looks. A mouth that matches the sound frame for frame still looks wrong
 *      if it flickers. So: rest before the speech, at its pauses and after it;
 *      a closure for b, m and p held long enough to be seen; no shape shorter
 *      than a few frames; never more changes in a second than an eye can
 *      follow, however long the text and short the recording.
 *
 * `lipsyncFromText` does the third step alone, for a recording there is no
 * sound to analyse for: the sounds spread evenly by weight over its length.
 */
import { analyzeEnvelope, ENVELOPE_FRAME_MS, type Envelope, type VoicedSegment } from './envelope.js';
import { textToSounds, type LipsyncScript, type Sound } from './letters.js';
import type { LipsyncCue, LipsyncTimeline } from './timeline.js';
import type { Viseme } from './visemes.js';

export interface LipsyncOptions {
  /** the text's script; detected from its letters when not given */
  script?: LipsyncScript;
}

/** Lips pressed for less than this do not read as b, m or p; they read as nothing. */
export const MIN_CLOSURE_MS = 60;
/** A shape held for less than this is a flicker, not a movement. */
export const MIN_HOLD_MS = 40;
/** The most changes of shape in any one second: faster than this is a flutter the eye cannot follow. */
export const MAX_CHANGES_PER_SECOND = 15;

/** A silence inside a run of words this long rests the mouth; shorter, it only narrows an open vowel. */
const QUIET_REST_MS = 200;
const QUIET_MIN_MS = 60;
/** How far under the speech threshold a stretch must fall to be quiet (the envelope's own margin). */
const QUIET_BELOW_DB = 4;
/** A rest at least this long is a pause the speaker made, and stays through every merge. */
const PAUSE_KEEP_MS = 100;

/** A long vowel lands on its peak; a short one moves only part of the way. */
const FULL_PULL_WEIGHT = 1.6;
const MIN_PULL = 0.35;
/** How far a vowel may be from a peak and still be matched to it, in syllables. */
const PEAK_REACH = 1.5;
/** Pulling vowels to peaks may stretch or squeeze the time between them by up to this much. */
const MIN_SLOPE = 0.3;
const MAX_SLOPE = 3.5;

/** With no sound to listen to: slow, careful speech at most, after a short breath. */
const TEXT_MAX_UNIT_MS = 180;
const TEXT_LEAD_MS = 80;
const TEXT_TAIL_MS = 150;

interface Span {
  start: number;
  end: number;
  viseme: Viseme;
  /** a pause in the speech: rest that every merge keeps */
  pause?: boolean;
}

const VOWEL_VISEMES: ReadonlySet<Viseme> = new Set<Viseme>(['a', 'e', 'i', 'o', 'u']);

/** Which shape a too-short neighbour is better folded into: the open, visible ones. */
const ABSORB_INTO: Record<Viseme, number> = { a: 5, o: 5, u: 4.5, e: 4.5, i: 4, fv: 3, l: 2, mbp: 1.5, etc: 1, rest: 0 };
/** Which shapes to keep when there are too many: closures and open vowels say the most. */
const KEEP: Record<Viseme, number> = { mbp: 6, a: 5, o: 5, u: 4.5, e: 4.5, i: 4, fv: 3, rest: 2.5, l: 2, etc: 1 };

const len = (span: Span): number => span.end - span.start;
const minHold = (span: Span): number => (span.viseme === 'mbp' ? MIN_CLOSURE_MS : MIN_HOLD_MS);

interface Word {
  sounds: Sound[];
  weight: number;
  /** what follows it: 0 nothing, 1 a short pause, 2 a long one */
  pauseAfter: number;
}

function wordsOf(sounds: Sound[]): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  let index = -1;
  for (const sound of sounds) {
    if (sound.kind === 'pause') {
      if (current) current.pauseAfter = Math.max(current.pauseAfter, sound.pause === 'long' ? 2 : 1);
      continue;
    }
    if (!current || sound.word !== index) {
      current = { sounds: [], weight: 0, pauseAfter: 0 };
      words.push(current);
      index = sound.word;
    }
    current.sounds.push(sound);
    current.weight += sound.weight;
  }
  return words;
}

/** Syllables to move the mouth with when the text has nothing to say (a clip of "?" or of a symbol). */
function babble(syllables: number): Sound[] {
  const out: Sound[] = [];
  for (let word = 0; word < syllables; word++) {
    out.push({ viseme: 'etc', kind: 'consonant', weight: 0.7, word, letters: '' });
    out.push({ viseme: word % 2 === 0 ? 'a' : 'e', kind: 'vowel', weight: 1.4, word, letters: '' });
  }
  return out;
}

/**
 * Which of the recording's pauses fall at which of the text's word boundaries,
 * as [gap, boundary] pairs in order. A monotonic alignment, scored so that a
 * pause near the place the text's proportions put a boundary matches it,
 * punctuation pulls hardest, a long silence left unmatched costs more than a
 * short one, and a comma read straight through costs a little.
 */
function matchPauses(words: Word[], segments: VoicedSegment[]): Array<[number, number]> {
  const boundaries = words.length - 1;
  const gaps = segments.length - 1;
  if (boundaries <= 0 || gaps <= 0) return [];
  const total = words.reduce((sum, w) => sum + w.weight, 0);
  const bPos: number[] = [];
  let acc = 0;
  for (let j = 0; j < boundaries; j++) {
    acc += words[j]!.weight;
    bPos.push(acc / total);
  }
  const voiced = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const gPos: number[] = [];
  const gMs: number[] = [];
  acc = 0;
  for (let k = 0; k < gaps; k++) {
    acc += segments[k]!.end - segments[k]!.start;
    gPos.push(acc / voiced);
    gMs.push((segments[k + 1]!.start - segments[k]!.end) * ENVELOPE_FRAME_MS);
  }
  const match = (k: number, j: number): number =>
    1 + 1.5 * words[j]!.pauseAfter + 0.5 * Math.min(1, gMs[k]! / 300) - 8 * Math.abs(gPos[k]! - bPos[j]!);
  const skipGap = (k: number): number => -(0.3 + 0.7 * Math.min(1, gMs[k]! / 400));
  const skipBoundary = (j: number): number => -0.4 * words[j]!.pauseAfter;

  const width = boundaries + 1;
  const score = new Float64Array((gaps + 1) * width).fill(-Infinity);
  const step = new Uint8Array((gaps + 1) * width);
  score[0] = 0;
  for (let k = 0; k <= gaps; k++) {
    for (let j = 0; j <= boundaries; j++) {
      if (k === 0 && j === 0) continue;
      let best = -Infinity;
      let how = 0;
      if (k > 0 && j > 0) {
        const v = score[(k - 1) * width + j - 1]! + match(k - 1, j - 1);
        if (v > best) [best, how] = [v, 0];
      }
      if (k > 0) {
        const v = score[(k - 1) * width + j]! + skipGap(k - 1);
        if (v > best) [best, how] = [v, 1];
      }
      if (j > 0) {
        const v = score[k * width + j - 1]! + skipBoundary(j - 1);
        if (v > best) [best, how] = [v, 2];
      }
      score[k * width + j] = best;
      step[k * width + j] = how;
    }
  }
  const pairs: Array<[number, number]> = [];
  let k = gaps;
  let j = boundaries;
  while (k > 0 || j > 0) {
    const how = step[k * width + j];
    if (how === 0) {
      pairs.push([k - 1, j - 1]);
      k -= 1;
      j -= 1;
    } else if (how === 1) k -= 1;
    else j -= 1;
  }
  return pairs.reverse();
}

/**
 * Which vowel each loudness peak belongs to, as [vowel, peak] pairs in order:
 * the monotonic matching that keeps each vowel as close to its peak as it can,
 * leaving a vowel with no peak near it (a weak syllable) or a peak with no
 * vowel (a stressed consonant) unmatched.
 */
function matchVowels(centres: number[], peaks: number[], spacing: number): Array<[number, number]> {
  const reach = PEAK_REACH * Math.max(spacing, 1);
  const width = peaks.length + 1;
  const score = new Float64Array((centres.length + 1) * width);
  const step = new Uint8Array((centres.length + 1) * width);
  for (let v = 0; v <= centres.length; v++) {
    for (let p = 0; p <= peaks.length; p++) {
      if (v === 0 && p === 0) continue;
      let best = -Infinity;
      let how = 0;
      if (v > 0 && p > 0) {
        const d = (centres[v - 1]! - peaks[p - 1]!) / reach;
        const gain = 1 - d * d;
        if (gain > 0) {
          best = score[(v - 1) * width + p - 1]! + gain;
          how = 0;
        }
      }
      if (v > 0 && score[(v - 1) * width + p]! > best) [best, how] = [score[(v - 1) * width + p]!, 1];
      if (p > 0 && score[v * width + p - 1]! > best) [best, how] = [score[v * width + p - 1]!, 2];
      score[v * width + p] = best;
      step[v * width + p] = how;
    }
  }
  const pairs: Array<[number, number]> = [];
  let v = centres.length;
  let p = peaks.length;
  while (v > 0 || p > 0) {
    const how = step[v * width + p];
    if (how === 0 && v > 0 && p > 0) {
      pairs.push([v - 1, p - 1]);
      v -= 1;
      p -= 1;
    } else if (how === 1 || p === 0) v -= 1;
    else p -= 1;
  }
  return pairs.reverse();
}

/** A piecewise-linear map through `anchors` (rising in both), flat outside them. */
function warp(anchors: Array<[number, number]>, x: number): number {
  if (x <= anchors[0]![0]) return anchors[0]![1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i]!;
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1]!;
      return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    }
  }
  return anchors[anchors.length - 1]![1];
}

/**
 * One run of words over its stretch of speech: spread by weight over the
 * voiced time (the silences inside it left out), vowels pulled to peaks.
 */
function placeRun(words: Word[], segs: VoicedSegment[], allPeaks: number[]): Span[] {
  const F = ENVELOPE_FRAME_MS;
  // the run's speech end to end: `axis` time skips the silences between its segments
  const pieces = segs.map((s) => ({ start: s.start * F, end: s.end * F, offset: 0 }));
  let total = 0;
  for (const piece of pieces) {
    piece.offset = total;
    total += piece.end - piece.start;
  }
  const toReal = (x: number): number => {
    let piece = pieces[0]!;
    for (const p of pieces) if (p.offset <= x) piece = p;
    return piece.start + Math.min(x - piece.offset, piece.end - piece.start);
  };
  const peaks: number[] = [];
  for (const frame of allPeaks) {
    const ms = frame * F + F / 2;
    const piece = pieces.find((p) => ms >= p.start && ms < p.end);
    if (piece) peaks.push(piece.offset + ms - piece.start);
  }

  const sounds = words.flatMap((w) => w.sounds);
  const weight = sounds.reduce((sum, s) => sum + s.weight, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const sound of sounds) {
    starts.push((acc / weight) * total);
    acc += sound.weight;
  }
  const endOf = (i: number): number => (i + 1 < starts.length ? starts[i + 1]! : total);

  const vowels = sounds.map((s, i) => (s.kind === 'vowel' ? i : -1)).filter((i) => i >= 0);
  const centres = vowels.map((i) => (starts[i]! + endOf(i)) / 2);
  const anchors: Array<[number, number]> = [[0, 0]];
  for (const [v, p] of matchVowels(centres, peaks, total / Math.max(1, vowels.length))) {
    const sound = sounds[vowels[v]!]!;
    const pull = Math.min(1, Math.max(MIN_PULL, sound.weight / FULL_PULL_WEIGHT));
    const from = centres[v]!;
    const to = from + pull * (peaks[p]! - from);
    const [px, py] = anchors[anchors.length - 1]!;
    if (from - px <= 1e-6 || to - py <= 1e-6) continue;
    const slope = (to - py) / (from - px);
    if (slope < MIN_SLOPE || slope > MAX_SLOPE) continue;
    anchors.push([from, to]);
  }
  // the stretch from the last vowel to the end of the run has to be reasonable as well
  while (anchors.length > 1) {
    const [px, py] = anchors[anchors.length - 1]!;
    const slope = (total - py) / (total - px);
    if (total - px > 1e-6 && slope >= MIN_SLOPE && slope <= MAX_SLOPE) break;
    anchors.pop();
  }
  anchors.push([total, total]);

  return sounds.map((sound, i) => ({
    start: toReal(warp(anchors, starts[i]!)),
    end: toReal(warp(anchors, endOf(i))),
    viseme: sound.viseme,
  }));
}

/** `spans` with [start, end) repainted by `paint`, splitting what it overlaps. */
function repaint(spans: Span[], start: number, end: number, paint: (span: Span) => Span): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    if (span.end <= start || span.start >= end) {
      out.push(span);
      continue;
    }
    if (span.start < start) out.push({ ...span, end: start });
    out.push(paint({ ...span, start: Math.max(span.start, start), end: Math.min(span.end, end) }));
    if (span.end > end) out.push({ ...span, start: end });
  }
  return out;
}

/**
 * Quiet stretches inside the speech: a long one (a hesitation, a breath the
 * text does not mark) rests the mouth; a shorter one inside a word narrows an
 * open vowel to the near-closed shape, since nothing loud is being said.
 */
function quiet(spans: Span[], env: Envelope): Span[] {
  const F = ENVELOPE_FRAME_MS;
  const below = env.thresholdDb - QUIET_BELOW_DB;
  let out = spans;
  let f = env.speechStart;
  while (f < env.speechEnd) {
    if (env.db[f]! >= below) {
      f += 1;
      continue;
    }
    const from = f;
    while (f < env.speechEnd && env.db[f]! < below) f += 1;
    const [start, end] = [from * F, f * F];
    if (end - start < QUIET_MIN_MS) continue;
    out =
      end - start >= QUIET_REST_MS
        ? repaint(out, start, end, (s) => ({ ...s, viseme: 'rest', pause: true }))
        : repaint(out, start, end, (s) => (VOWEL_VISEMES.has(s.viseme) ? { ...s, viseme: 'etc' } : s));
  }
  return out;
}

/** Contiguous from 0, inside the duration, nothing empty, no two neighbours alike. */
function tidy(spans: Span[], durationMs: number): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    const start = last ? last.end : 0;
    const end = Math.min(durationMs, span.end);
    if (end - start < 1e-6) continue;
    if (last && last.viseme === span.viseme) {
      last.end = end;
      last.pause = last.pause || span.pause;
      continue;
    }
    out.push({ ...span, start, end });
  }
  return out;
}

/**
 * `spans` with spans[at] folded into a neighbour: an open shape before a
 * closed one, and speech before a pause, so speech never shrinks into silence.
 */
function absorb(spans: Span[], at: number): Span[] {
  const prev = spans[at - 1];
  const next = spans[at + 1];
  const span = spans[at]!;
  let intoPrev: boolean;
  if (!prev || !next) intoPrev = Boolean(prev);
  else if ((prev.viseme === 'rest') !== (next.viseme === 'rest')) intoPrev = next.viseme === 'rest';
  else intoPrev = ABSORB_INTO[prev.viseme] >= ABSORB_INTO[next.viseme];
  if (intoPrev && prev) prev.end = span.end;
  else if (next) next.start = span.start;
  const out = spans.slice(0, at).concat(spans.slice(at + 1));
  return tidy(out, Infinity);
}

/** What a span can give a neighbour and still be seen; the rest after the speech has all the time there is. */
function spare(spans: Span[], at: number): number {
  const span = spans[at];
  if (!span) return 0;
  if (at === spans.length - 1 && span.viseme === 'rest') return len(span);
  return Math.max(0, len(span) - (span.viseme === 'rest' && span.pause ? PAUSE_KEEP_MS : minHold(span)));
}

/** Lengthen spans[at] by `need`, from what follows first (the lips close, then open into it), then from what precedes. */
function lengthen(spans: Span[], at: number, need: number, force: boolean): boolean {
  const span = spans[at]!;
  const prev = spans[at - 1];
  const next = spans[at + 1];
  const fromNext = Math.min(need, force ? (next ? len(next) : 0) : spare(spans, at + 1));
  const fromPrev = Math.min(need - fromNext, force ? (prev ? len(prev) : 0) : spare(spans, at - 1));
  if (!force && fromNext + fromPrev < need - 1e-6) return false;
  if (next && fromNext > 0) {
    span.end += fromNext;
    next.start += fromNext;
  }
  if (prev && fromPrev > 0) {
    span.start -= fromPrev;
    prev.end -= fromPrev;
  }
  return true;
}

/**
 * No shape too brief to see. The shortest first: a closure or a vowel is
 * lengthened from a neighbour that can spare the time; anything else, or a
 * vowel with no time to be had, is folded into a neighbour. A closure is
 * never folded away: with no time to spare around it, it takes the time it
 * needs from its neighbours anyway, and a neighbour left too short is folded
 * away in its turn.
 */
function holdLongEnough(input: Span[]): Span[] {
  let spans = input;
  for (let guard = spans.length * 4 + 16; guard > 0; guard--) {
    let at = -1;
    // the last span runs on past the end of the sound, so it is never too short
    for (let i = 0; i < spans.length - 1; i++) {
      const short = len(spans[i]!) < minHold(spans[i]!) - 1e-6;
      if (short && (at < 0 || len(spans[i]!) < len(spans[at]!))) at = i;
    }
    if (at < 0) break;
    const span = spans[at]!;
    const need = minHold(span) - len(span);
    if ((span.viseme === 'mbp' || VOWEL_VISEMES.has(span.viseme)) && lengthen(spans, at, need, false)) {
      spans = tidy(spans, Infinity);
      continue;
    }
    if (span.viseme === 'mbp') {
      lengthen(spans, at, need, true);
      spans = tidy(spans, Infinity);
      continue;
    }
    spans = absorb(spans, at);
  }
  return spans;
}

/**
 * At most MAX_CHANGES_PER_SECOND changes in any second. Where there are more,
 * the least telling change in the busiest second is folded into a neighbour
 * (the near-closed consonants first, closures and open vowels last) until
 * every second is within the limit. Pauses and the rests either side of the
 * speech are not changes to drop.
 */
function capRate(input: Span[]): Span[] {
  let spans = input;
  for (let guard = spans.length + 16; guard > 0; guard--) {
    let window: [number, number] | null = null;
    let lo = 1;
    for (let hi = 1; hi < spans.length; hi++) {
      while (spans[hi]!.start - spans[lo]!.start >= 1000) lo += 1;
      if (hi - lo + 1 > MAX_CHANGES_PER_SECOND) {
        window = [lo, hi];
        break;
      }
    }
    if (!window) break;
    let pick = -1;
    for (let i = window[0]; i <= window[1]; i++) {
      const span = spans[i]!;
      if (i === spans.length - 1 && span.viseme === 'rest') continue;
      if (span.viseme === 'rest' && span.pause && len(span) >= PAUSE_KEEP_MS) continue;
      const better =
        pick < 0 ||
        KEEP[span.viseme] < KEEP[spans[pick]!.viseme] ||
        (KEEP[span.viseme] === KEEP[spans[pick]!.viseme] && len(span) < len(spans[pick]!));
      if (better) pick = i;
    }
    if (pick < 0) break;
    spans = absorb(spans, pick);
  }
  return spans;
}

/** Make the spans look right (see the top of this file) and read them out as cues. */
function finish(spans: Span[], durationMs: number): LipsyncTimeline {
  // whole milliseconds first, so what the holds below promise is what is stored
  const rounded = spans.map((span) => ({ ...span, start: Math.round(span.start), end: Math.round(span.end) }));
  const out = tidy(capRate(holdLongEnough(tidy(rounded, durationMs))), durationMs);

  const cues: LipsyncCue[] = [];
  for (const span of out) {
    const startMs = Math.round(span.start);
    if (startMs >= durationMs) break;
    const last = cues[cues.length - 1];
    if (last && startMs <= last.startMs) {
      last.viseme = span.viseme;
    } else {
      cues.push({ startMs, viseme: span.viseme });
    }
    const before = cues[cues.length - 2];
    if (before && before.viseme === cues[cues.length - 1]!.viseme) cues.pop();
  }
  return { durationMs, cues };
}

function durationOf(ms: number): number {
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms)) : 1;
}

/**
 * The timeline for a recording of `text`, from its samples: mono PCM in
 * -1…1 at `sampleRate`, exactly as the file plays from its first sample (the
 * times are measured from there). The text can be either script; say which
 * with `options.script`, or let its letters decide.
 *
 * A recording with no speech in it is rest throughout. Store the result with
 * `encodeLipsync`.
 */
export function lipsyncFromAudio(
  text: string,
  pcm: Float32Array,
  sampleRate: number,
  options: LipsyncOptions = {},
): LipsyncTimeline {
  const env = analyzeEnvelope(pcm, sampleRate);
  const durationMs = durationOf(env.durationMs);
  if (env.segments.length === 0) return finish([{ start: 0, end: durationMs, viseme: 'rest', pause: true }], durationMs);

  let words = wordsOf(textToSounds(text, options));
  if (words.length === 0) words = wordsOf(babble(Math.max(env.peaks.length, env.segments.length)));

  const F = ENVELOPE_FRAME_MS;
  const spans: Span[] = [{ start: 0, end: env.speechStart * F, viseme: 'rest', pause: true }];
  let word = 0;
  let seg = 0;
  const run = (wordEnd: number, segEnd: number): void => {
    const segs = env.segments.slice(seg, segEnd);
    const last = spans[spans.length - 1]!;
    if (last.end < segs[0]!.start * F) spans.push({ start: last.end, end: segs[0]!.start * F, viseme: 'rest', pause: true });
    spans.push(...placeRun(words.slice(word, wordEnd), segs, env.peaks));
    word = wordEnd;
    seg = segEnd;
  };
  for (const [gap, boundary] of matchPauses(words, env.segments)) run(boundary + 1, gap + 1);
  run(words.length, env.segments.length);
  spans.push({ start: env.speechEnd * F, end: durationMs, viseme: 'rest', pause: true });

  return finish(quiet(spans, env), durationMs);
}

/**
 * The timeline for a recording of `text` lasting `durationMs`, with no sound
 * to listen to: a short breath, then the sounds spread evenly by weight, with
 * rest at the punctuation and after the last word. However long the recording,
 * no sound is held longer than slow, careful speech would hold it; the mouth
 * rests for whatever time is left at the end.
 */
export function lipsyncFromText(text: string, durationMs: number, options: LipsyncOptions = {}): LipsyncTimeline {
  const d = durationOf(durationMs);
  const sounds = textToSounds(text, options);
  if (!sounds.some((s) => s.kind !== 'pause')) return finish([{ start: 0, end: d, viseme: 'rest', pause: true }], d);
  const lead = Math.min(TEXT_LEAD_MS, d * 0.05);
  const tail = Math.min(TEXT_TAIL_MS, d * 0.1);
  const weight = sounds.reduce((sum, s) => sum + s.weight, 0);
  const unit = Math.min((d - lead - tail) / weight, TEXT_MAX_UNIT_MS);
  const spans: Span[] = [{ start: 0, end: lead, viseme: 'rest', pause: true }];
  let at = lead;
  for (const sound of sounds) {
    const end = at + sound.weight * unit;
    spans.push({ start: at, end, viseme: sound.viseme, pause: sound.kind === 'pause' });
    at = end;
  }
  spans.push({ start: at, end: d, viseme: 'rest', pause: true });
  return finish(spans, d);
}
