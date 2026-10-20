/**
 * How loud a recording is, every 10 ms: where the speech starts and stops,
 * where the speaker paused, and where each syllable's vowel is loudest.
 *
 * Speech has a rhythm a loudness curve shows plainly. Every syllable swells to
 * its vowel and falls away after it, so the loud moments are the syllables'
 * nuclei; a pause is a stretch near the room's own noise. Nothing here knows
 * what was said: the aligner (align.ts) matches the text to these landmarks.
 *
 * Every threshold is relative to the recording itself. The quietest frames
 * give the noise floor and the loudest the speech level, so a studio take
 * with digital silence around it and a phone memo in a noisy room come out
 * alike, and a clip levelled to any volume reads the same.
 *
 * It is one pass over the samples and a few over the frames: a ten-second clip
 * at 48 kHz takes a few milliseconds.
 */

export const ENVELOPE_FRAME_MS = 10;

/** Frames of speech without a pause long enough to count, [start, end). */
export interface VoicedSegment {
  start: number;
  end: number;
}

export interface Envelope {
  frameMs: number;
  frameCount: number;
  durationMs: number;
  /** each frame's loudness in dB below full scale, lightly smoothed; -100 is silence */
  db: Float32Array;
  /** the level of the quiet between words: the room, or digital silence */
  floorDb: number;
  /** the level of loud speech */
  peakDb: number;
  /** speech is louder than this */
  thresholdDb: number;
  /** the first frame of speech, or -1 when there is none */
  speechStart: number;
  /** the frame after the last of the speech, or -1 when there is none */
  speechEnd: number;
  /** the stretches of speech, in order; a gap between two is a pause */
  segments: VoicedSegment[];
  /** syllable nuclei: the frames where the loudness peaks, in order, at least one in every segment */
  peaks: number[];
}

/** Below the floor of any recording; what a frame of digital silence reads. */
const SILENCE_DB = -100;
/** The quietest twentieth of the frames is the floor; two in a hundred may be clicks above the speech level. */
const FLOOR_PERCENTILE = 0.05;
const PEAK_PERCENTILE = 0.98;
/** Speech is at least this far over the floor, and a fifth of the way from the floor to the speech level. */
const MIN_MARGIN_DB = 6;
const MARGIN_SHARE = 0.2;
/** Anything within 40 dB of the loudest speech counts, however quiet the room: a faint s is still speech. */
const MAX_BELOW_PEAK_DB = 40;
/**
 * A recording that varies less than this has no pauses to find: the same
 * level all through. If that level is loud it is all sound (a held vowel cut
 * tight); if quiet, it is a room with nobody speaking.
 */
const FLAT_RANGE_DB = 8;
const LOUD_FLAT_DB = -35;
/** Once speech has started it continues until the level falls this much under the threshold. */
const HYSTERESIS_DB = 4;
/** A shorter silence is part of a word (the closure of a p or a t); this long, it is a pause. */
export const MIN_PAUSE_MS = 120;
/** A shorter burst on its own is a click or a knock, not speech. */
const MIN_SEGMENT_MS = 50;
/**
 * How far before the first loud frame and after the last the speech may
 * reach, while it stays a little over the floor: a soft s or h at the start,
 * a fading vowel at the end.
 */
const LEAD_REACH_MS = 100;
const TAIL_REACH_MS = 150;
const REACH_OVER_FLOOR_DB = 3;
/** The curve peaks are found on: about a syllable's vowel wide. */
const PEAK_SMOOTH_RADIUS = 3;
/** A peak has to stand this far above the dips on either side to be a syllable of its own. */
const PEAK_PROMINENCE_DB = 3;
/** Two syllables are never closer than this, however fast the speech. */
const PEAK_MIN_DISTANCE_MS = 90;
/** A flat-topped peak (a held vowel) is placed at the middle of what is within this of its top. */
const PEAK_TOP_DB = 1;

/** Mean power over a window of 2 × radius + 1 frames, as dB. */
function smoothedDb(power: Float64Array, radius: number): Float32Array {
  const n = power.length;
  const sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sums[i + 1] = sums[i]! + power[i]!;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    const mean = (sums[b]! - sums[a]!) / (b - a);
    out[i] = Math.max(SILENCE_DB, 10 * Math.log10(mean + 1e-10));
  }
  return out;
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return SILENCE_DB;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]!;
}

/** Runs of frames where `on(i)` holds, with a run allowed to continue while `stay(i)` does. */
function runs(n: number, on: (i: number) => boolean, stay: (i: number) => boolean): VoicedSegment[] {
  const out: VoicedSegment[] = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (start < 0) {
      if (on(i)) start = i;
    } else if (!stay(i)) {
      out.push({ start, end: i });
      start = -1;
    }
  }
  if (start >= 0) out.push({ start, end: n });
  return out;
}

/** The syllable nuclei of one segment, by prominence, then thinned to one per `minGap` frames. */
function segmentPeaks(curve: Float32Array, seg: VoicedSegment, floorDb: number, minGap: number): number[] {
  const at = (i: number): number => (i >= seg.start && i < seg.end ? curve[i]! : -Infinity);
  const candidates: Array<{ frame: number; height: number }> = [];
  for (let i = seg.start; i < seg.end; i++) {
    const h = curve[i]!;
    if (!(h > at(i - 1) && h >= at(i + 1)) || h <= floorDb) continue;
    // the deepest dip on each side before the curve climbs higher than this
    // peak; reaching the segment's edge first, the dip is the silence beyond it
    let left = h;
    let j = i - 1;
    for (; j >= seg.start && curve[j]! <= h; j--) left = Math.min(left, curve[j]!);
    if (j < seg.start) left = Math.min(left, floorDb);
    let right = h;
    j = i + 1;
    for (; j < seg.end && curve[j]! <= h; j++) right = Math.min(right, curve[j]!);
    if (j >= seg.end) right = Math.min(right, floorDb);
    if (h - Math.max(left, right) < PEAK_PROMINENCE_DB) continue;
    candidates.push({ frame: i, height: h });
  }
  candidates.sort((a, b) => b.height - a.height);
  const kept: number[] = [];
  for (const c of candidates) {
    if (kept.every((k) => Math.abs(k - c.frame) >= minGap)) kept.push(c.frame);
  }
  if (kept.length === 0) {
    let best = seg.start;
    for (let i = seg.start; i < seg.end; i++) if (curve[i]! > curve[best]!) best = i;
    kept.push(best);
  }
  // a flat top's nucleus is its middle, not the first frame to reach it
  return kept
    .map((frame) => {
      const top = curve[frame]! - PEAK_TOP_DB;
      let a = frame;
      let b = frame;
      while (a - 1 >= seg.start && curve[a - 1]! >= top) a -= 1;
      while (b + 1 < seg.end && curve[b + 1]! >= top) b += 1;
      return Math.round((a + b) / 2);
    })
    .sort((x, y) => x - y)
    .filter((frame, i, all) => i === 0 || frame - all[i - 1]! >= minGap);
}

/**
 * The loudness envelope of mono PCM samples (-1 to 1) at `sampleRate`.
 *
 * Loudness is the RMS of each 10 ms frame with its mean taken out, so a DC
 * offset from a cheap microphone does not read as sound; in dB, over 30 ms.
 */
export function analyzeEnvelope(pcm: Float32Array, sampleRate: number): Envelope {
  const durationMs = sampleRate > 0 ? (pcm.length / sampleRate) * 1000 : 0;
  const hop = (sampleRate * ENVELOPE_FRAME_MS) / 1000;
  const frameCount = hop > 0 ? Math.ceil(pcm.length / hop) : 0;
  const power = new Float64Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const a = Math.floor(f * hop);
    const b = Math.min(pcm.length, Math.floor((f + 1) * hop));
    let sum = 0;
    let sumSq = 0;
    for (let i = a; i < b; i++) {
      const x = pcm[i]!;
      sum += x;
      sumSq += x * x;
    }
    const n = b - a;
    const variance = n > 0 ? sumSq / n - (sum / n) * (sum / n) : 0;
    power[f] = Number.isFinite(variance) && variance > 0 ? variance : 0;
  }
  const db = smoothedDb(power, 1);
  const none: Envelope = {
    frameMs: ENVELOPE_FRAME_MS,
    frameCount,
    durationMs,
    db,
    floorDb: SILENCE_DB,
    peakDb: SILENCE_DB,
    thresholdDb: 0,
    speechStart: -1,
    speechEnd: -1,
    segments: [],
    peaks: [],
  };
  if (frameCount === 0) return none;

  const sorted = Float32Array.from(db).sort();
  const floorDb = percentile(sorted, FLOOR_PERCENTILE);
  const peakDb = percentile(sorted, PEAK_PERCENTILE);
  const range = peakDb - floorDb;

  let thresholdDb: number;
  let segments: VoicedSegment[];
  if (range < FLAT_RANGE_DB) {
    // one level all through: a held sound with nothing cut around it, or nobody speaking
    if (peakDb < LOUD_FLAT_DB) return { ...none, floorDb, peakDb, thresholdDb: peakDb + MIN_MARGIN_DB };
    thresholdDb = floorDb - MIN_MARGIN_DB;
    segments = [{ start: 0, end: frameCount }];
  } else {
    thresholdDb = Math.max(floorDb + Math.max(MIN_MARGIN_DB, MARGIN_SHARE * range), peakDb - MAX_BELOW_PEAK_DB);
    const stayDb = thresholdDb - HYSTERESIS_DB;
    const voiced = runs(
      frameCount,
      (i) => db[i]! >= thresholdDb,
      (i) => db[i]! >= stayDb,
    );
    // a silence too short to be a pause is part of the word around it
    const minPause = Math.round(MIN_PAUSE_MS / ENVELOPE_FRAME_MS);
    const joined: VoicedSegment[] = [];
    for (const seg of voiced) {
      const last = joined[joined.length - 1];
      if (last && seg.start - last.end < minPause) last.end = seg.end;
      else joined.push({ ...seg });
    }
    const minSegment = Math.round(MIN_SEGMENT_MS / ENVELOPE_FRAME_MS);
    segments = joined.filter((seg) => seg.end - seg.start >= minSegment);
    if (segments.length === 0) return { ...none, floorDb, peakDb, thresholdDb };

    // reach out from the loud part to the soft sounds at either end of the speech
    const reach = floorDb + REACH_OVER_FLOOR_DB;
    const first = segments[0]!;
    const lastSeg = segments[segments.length - 1]!;
    const leadLimit = Math.max(0, first.start - Math.round(LEAD_REACH_MS / ENVELOPE_FRAME_MS));
    while (first.start - 1 >= leadLimit && db[first.start - 1]! >= reach) first.start -= 1;
    const tailLimit = Math.min(frameCount, lastSeg.end + Math.round(TAIL_REACH_MS / ENVELOPE_FRAME_MS));
    while (lastSeg.end < tailLimit && db[lastSeg.end]! >= reach) lastSeg.end += 1;
  }

  const curve = smoothedDb(power, PEAK_SMOOTH_RADIUS);
  const minGap = Math.round(PEAK_MIN_DISTANCE_MS / ENVELOPE_FRAME_MS);
  const peaks = segments.flatMap((seg) => segmentPeaks(curve, seg, floorDb, minGap));

  return {
    frameMs: ENVELOPE_FRAME_MS,
    frameCount,
    durationMs,
    db,
    floorDb,
    peakDb,
    thresholdDb,
    speechStart: segments[0]!.start,
    speechEnd: segments[segments.length - 1]!.end,
    segments,
    peaks,
  };
}
