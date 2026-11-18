/**
 * A lip-sync timeline: cues, each the moment a mouth shape starts and holds until the next; the mouth rests before the
 * first cue and from the end of the recording on. Stored (the `lipsync` jsonb column) and sent compactly:
 *
 *   { "v": 1, "d": 1840, "k": [[0, 0], [80, 3], [150, 5], …, [1690, 0]] }
 *
 * v is the format version, d the recording's length in ms, k the cues as [start ms, index into VISEMES] in rising order.
 * VISEMES is append-only, so an index never changes meaning. Times are media time (ms into the file), so a player asking
 * `visemeAt` with its own playback position stays in step at any playback rate.
 */
import { VISEMES, type Viseme } from './visemes.js';

export const LIPSYNC_VERSION = 1;

/** The most cues a stored timeline may have: far more than any recording the studio takes needs. */
export const LIPSYNC_MAX_CUES = 2000;

/** The longest recording a timeline may describe, ten minutes; the API holds each recording to its own length. */
export const LIPSYNC_MAX_DURATION_MS = 10 * 60 * 1000;

/** The moment one mouth shape starts. */
export interface LipsyncCue {
  startMs: number;
  viseme: Viseme;
}

/** A timeline to play: what `lipsyncFromAudio` makes and `decodeLipsync` reads. */
export interface LipsyncTimeline {
  durationMs: number;
  /** in time order, no two neighbours alike */
  cues: LipsyncCue[];
}

/** One cue as stored: [start in ms, index into VISEMES]. */
export type LipsyncKeyframe = [startMs: number, visemeIndex: number];

/** A timeline as stored and sent. */
export interface LipsyncData {
  v: typeof LIPSYNC_VERSION;
  d: number;
  k: LipsyncKeyframe[];
}

export interface LipsyncLimits {
  /** at most this many cues; LIPSYNC_MAX_CUES when not given */
  maxCues?: number;
  /** a recording at most this long; LIPSYNC_MAX_DURATION_MS when not given */
  maxDurationMs?: number;
}

export class LipsyncFormatError extends Error {
  override name = 'LipsyncFormatError';
}

/**
 * The stored form of a timeline: times rounded to whole ms, cues at or after the end dropped, the later of two cues at
 * one moment kept, and repeats of the previous shape left out. Throws on a duration that is not a positive number of ms,
 * a cue before 0, cues out of order, or a shape not in VISEMES.
 */
export function encodeLipsync(timeline: LipsyncTimeline): LipsyncData {
  const d = Math.round(timeline.durationMs);
  if (!Number.isFinite(d) || d < 1 || d > LIPSYNC_MAX_DURATION_MS) {
    throw new LipsyncFormatError(`a timeline lasts from 1 ms to ${LIPSYNC_MAX_DURATION_MS} ms, not ${timeline.durationMs}`);
  }
  const k: LipsyncKeyframe[] = [];
  let lastStart = -1;
  for (const cue of timeline.cues) {
    const t = Math.round(cue.startMs);
    const index = VISEMES.indexOf(cue.viseme);
    if (!Number.isFinite(t) || t < 0) throw new LipsyncFormatError(`a cue cannot start at ${cue.startMs} ms`);
    if (index < 0) throw new LipsyncFormatError(`"${String(cue.viseme)}" is not a mouth shape`);
    if (t < lastStart) throw new LipsyncFormatError('cues must be in time order');
    lastStart = t;
    if (t >= d) break;
    // two cues in one millisecond: only the later one is ever seen
    if (k.length > 0 && k[k.length - 1]![0] === t) k.pop();
    if (k.length > 0 && k[k.length - 1]![1] === index) continue;
    k.push([t, index]);
  }
  if (k.length > LIPSYNC_MAX_CUES) throw new LipsyncFormatError(`a timeline holds at most ${LIPSYNC_MAX_CUES} cues`);
  return { v: LIPSYNC_VERSION, d, k };
}

/** Why `data` is not a stored timeline within `limits`, or the timeline it is. */
function read(data: unknown, limits: LipsyncLimits): LipsyncTimeline | string {
  const maxCues = limits.maxCues ?? LIPSYNC_MAX_CUES;
  const maxDurationMs = limits.maxDurationMs ?? LIPSYNC_MAX_DURATION_MS;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'a timeline is an object { v, d, k }';
  const keys = Object.keys(data);
  const extra = keys.find((key) => key !== 'v' && key !== 'd' && key !== 'k');
  if (extra !== undefined) return `a timeline has no "${extra}"`;
  const { v, d, k } = data as { v?: unknown; d?: unknown; k?: unknown };
  if (v !== LIPSYNC_VERSION) return `this is version ${LIPSYNC_VERSION} of the format, not ${JSON.stringify(v)}`;
  if (typeof d !== 'number' || !Number.isInteger(d) || d < 1) return 'd is the length in whole milliseconds';
  if (d > maxDurationMs) return `d is ${d} ms, longer than the recording (${maxDurationMs} ms)`;
  if (!Array.isArray(k)) return 'k is a list of [ms, shape] cues';
  if (k.length > maxCues) return `k has ${k.length} cues; at most ${maxCues}`;
  const cues: LipsyncCue[] = [];
  let prevStart = -1;
  let prevIndex = -1;
  for (let i = 0; i < k.length; i++) {
    const entry: unknown = k[i];
    if (!Array.isArray(entry) || entry.length !== 2) return `k[${i}] is not a [ms, shape] pair`;
    const [t, index] = entry as unknown[];
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0) {
      return `k[${i}] starts at a time that is not a whole number of ms`;
    }
    if (t >= d) return `k[${i}] starts at ${t} ms, at or after the end (${d} ms)`;
    if (t <= prevStart) return `k[${i}] starts at ${t} ms, not after the cue before it`;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= VISEMES.length) {
      return `k[${i}] names shape ${JSON.stringify(index)}; shapes are 0 to ${VISEMES.length - 1}`;
    }
    if (index === prevIndex) return `k[${i}] repeats the shape before it`;
    cues.push({ startMs: t, viseme: VISEMES[index]! });
    prevStart = t;
    prevIndex = index;
  }
  return { durationMs: d, cues };
}

/**
 * A stored timeline, checked strictly: exactly { v, d, k }, version 1, a whole-ms duration and cue count within `limits`,
 * each cue a [ms, shape] pair inside the recording, times strictly rising, and no shape repeating the one before. Throws a
 * LipsyncFormatError otherwise. The API checks every timeline with this before storing it, so clients can trust what they
 * are sent.
 */
export function decodeLipsync(data: unknown, limits: LipsyncLimits = {}): LipsyncTimeline {
  const out = read(data, limits);
  if (typeof out === 'string') throw new LipsyncFormatError(out);
  return out;
}

/** `decodeLipsync` that answers instead of throwing, for a validator to report the reason. */
export function safeDecodeLipsync(
  data: unknown,
  limits: LipsyncLimits = {},
): { ok: true; timeline: LipsyncTimeline } | { ok: false; error: string } {
  const out = read(data, limits);
  return typeof out === 'string' ? { ok: false, error: out } : { ok: true, timeline: out };
}

/**
 * The mouth shape at `ms` of media time: rest before the first cue, from the end on, and for a time that is not a number.
 * A binary search, cheap enough for every animation frame.
 */
export function visemeAt(timeline: LipsyncTimeline, ms: number): Viseme {
  const { cues } = timeline;
  if (!(ms >= 0) || ms >= timeline.durationMs || cues.length === 0 || ms < cues[0]!.startMs) return 'rest';
  let lo = 0;
  let hi = cues.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cues[mid]!.startMs <= ms) lo = mid;
    else hi = mid - 1;
  }
  return cues[lo]!.viseme;
}
