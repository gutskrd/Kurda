import { describe, expect, it } from 'vitest';
import {
  LIPSYNC_MAX_CUES,
  LipsyncFormatError,
  decodeLipsync,
  encodeLipsync,
  safeDecodeLipsync,
  visemeAt,
  type LipsyncTimeline,
} from './timeline.js';
import { VISEMES, type Viseme } from './visemes.js';

const timeline: LipsyncTimeline = {
  durationMs: 1000,
  cues: [
    { startMs: 0, viseme: 'rest' },
    { startMs: 80, viseme: 'mbp' },
    { startMs: 140, viseme: 'a' },
    { startMs: 300, viseme: 'l' },
    { startMs: 360, viseme: 'e' },
    { startMs: 800, viseme: 'rest' },
  ],
};

describe('encodeLipsync and decodeLipsync', () => {
  it('stores a timeline compactly and reads it back as it was', () => {
    const data = encodeLipsync(timeline);
    expect(data).toEqual({
      v: 1,
      d: 1000,
      k: [
        [0, 0],
        [80, 1],
        [140, 5],
        [300, 3],
        [360, 6],
        [800, 0],
      ],
    });
    expect(decodeLipsync(data)).toEqual(timeline);
    // and survives the trip through JSON and a jsonb column
    expect(decodeLipsync(JSON.parse(JSON.stringify(data)))).toEqual(timeline);
  });

  it('stores shapes by their index in VISEMES', () => {
    const cues = VISEMES.map((viseme, i) => ({ startMs: i * 10, viseme }));
    const data = encodeLipsync({ durationMs: 500, cues });
    expect(data.k.map(([, index]) => index)).toEqual(VISEMES.map((_, i) => i));
    expect(decodeLipsync(data).cues).toEqual(cues);
  });

  it('evens out what it is given: whole milliseconds, nothing after the end, no repeats', () => {
    const data = encodeLipsync({
      durationMs: 500.4,
      cues: [
        { startMs: 0.2, viseme: 'rest' },
        { startMs: 50.6, viseme: 'a' },
        { startMs: 120, viseme: 'a' },
        { startMs: 200, viseme: 'l' },
        // two in one millisecond: the later is what shows
        { startMs: 200.3, viseme: 'e' },
        { startMs: 500, viseme: 'rest' },
        { startMs: 650, viseme: 'o' },
      ],
    });
    expect(data).toEqual({
      v: 1,
      d: 500,
      k: [
        [0, 0],
        [51, 5],
        [200, 6],
      ],
    });
    expect(() => decodeLipsync(data)).not.toThrow();
  });

  it('refuses to store what is not a timeline', () => {
    expect(() => encodeLipsync({ durationMs: 0, cues: [] })).toThrow(LipsyncFormatError);
    expect(() => encodeLipsync({ durationMs: Number.NaN, cues: [] })).toThrow(LipsyncFormatError);
    expect(() => encodeLipsync({ durationMs: 100, cues: [{ startMs: -5, viseme: 'a' }] })).toThrow(LipsyncFormatError);
    expect(() =>
      encodeLipsync({
        durationMs: 100,
        cues: [
          { startMs: 50, viseme: 'a' },
          { startMs: 10, viseme: 'e' },
        ],
      }),
    ).toThrow(/order/);
    expect(() => encodeLipsync({ durationMs: 100, cues: [{ startMs: 0, viseme: 'grin' as Viseme }] })).toThrow(/mouth shape/);
  });

  it('decodes an empty timeline as rest throughout', () => {
    const empty = decodeLipsync({ v: 1, d: 300, k: [] });
    expect(empty).toEqual({ durationMs: 300, cues: [] });
    expect(visemeAt(empty, 100)).toBe('rest');
  });

  const bad: Array<[string, unknown, RegExp]> = [
    ['nothing', null, /object/],
    ['a string', '{"v":1}', /object/],
    ['a list', [[0, 0]], /object/],
    ['an unknown field', { v: 1, d: 100, k: [], x: 1 }, /no "x"/],
    ['another version', { v: 2, d: 100, k: [] }, /version/],
    ['no version', { d: 100, k: [] }, /version/],
    ['a fractional length', { v: 1, d: 100.5, k: [] }, /whole/],
    ['no length', { v: 1, d: 0, k: [] }, /whole/],
    ['a length as text', { v: 1, d: '100', k: [] }, /whole/],
    ['cues that are not a list', { v: 1, d: 100, k: {} }, /list/],
    ['a cue that is not a pair', { v: 1, d: 100, k: [[0, 0, 0]] }, /pair/],
    ['a cue that is a number', { v: 1, d: 100, k: [5] }, /pair/],
    ['a time that is not whole', { v: 1, d: 100, k: [[1.5, 0]] }, /whole/],
    ['a time before 0', { v: 1, d: 100, k: [[-1, 0]] }, /whole/],
    ['a time at the end', { v: 1, d: 100, k: [[100, 0]] }, /end/],
    ['a time after the end', { v: 1, d: 100, k: [[150, 0]] }, /end/],
    ['times that go back', { v: 1, d: 100, k: [[50, 0], [20, 5]] }, /not after/],
    ['two cues at once', { v: 1, d: 100, k: [[50, 0], [50, 5]] }, /not after/],
    ['a shape past the last', { v: 1, d: 100, k: [[0, VISEMES.length]] }, /shape/],
    ['a negative shape', { v: 1, d: 100, k: [[0, -1]] }, /shape/],
    ['a shape by name', { v: 1, d: 100, k: [[0, 'a']] }, /shape/],
    ['a shape repeated', { v: 1, d: 100, k: [[0, 5], [40, 5]] }, /repeats/],
  ];
  for (const [what, data, reason] of bad) {
    it(`rejects ${what}`, () => {
      expect(() => decodeLipsync(data)).toThrow(LipsyncFormatError);
      const answer = safeDecodeLipsync(data);
      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.error).toMatch(reason);
    });
  }

  it('holds a timeline to the limits it is given', () => {
    const k = Array.from({ length: 30 }, (_, i) => [i * 10, i % 2]);
    expect(decodeLipsync({ v: 1, d: 1000, k }).cues).toHaveLength(30);
    expect(() => decodeLipsync({ v: 1, d: 1000, k }, { maxCues: 29 })).toThrow(/at most 29/);
    expect(() => decodeLipsync({ v: 1, d: 1000, k: [] }, { maxDurationMs: 999 })).toThrow(/longer than the recording/);
    expect(decodeLipsync({ v: 1, d: 1000, k: [] }, { maxDurationMs: 1000 }).durationMs).toBe(1000);
    // and to the format's own ceiling when it is given none
    const many = Array.from({ length: LIPSYNC_MAX_CUES + 1 }, (_, i) => [i, i % 2]);
    expect(() => decodeLipsync({ v: 1, d: LIPSYNC_MAX_CUES + 10, k: many })).toThrow(/at most/);
  });

  it('answers with the timeline when it is one', () => {
    expect(safeDecodeLipsync(encodeLipsync(timeline))).toEqual({ ok: true, timeline });
  });
});

describe('visemeAt', () => {
  it('is the shape whose cue came last', () => {
    expect(visemeAt(timeline, 0)).toBe('rest');
    expect(visemeAt(timeline, 79.9)).toBe('rest');
    expect(visemeAt(timeline, 80)).toBe('mbp');
    expect(visemeAt(timeline, 139)).toBe('mbp');
    expect(visemeAt(timeline, 140)).toBe('a');
    expect(visemeAt(timeline, 330)).toBe('l');
    expect(visemeAt(timeline, 799)).toBe('e');
    expect(visemeAt(timeline, 800)).toBe('rest');
  });

  it('is rest before the first cue, from the end on, and for a time that is not one', () => {
    const late: LipsyncTimeline = { durationMs: 500, cues: [{ startMs: 100, viseme: 'a' }] };
    expect(visemeAt(late, 50)).toBe('rest');
    expect(visemeAt(late, 100)).toBe('a');
    expect(visemeAt(late, 499)).toBe('a');
    expect(visemeAt(late, 500)).toBe('rest');
    expect(visemeAt(late, 10_000)).toBe('rest');
    expect(visemeAt(late, -1)).toBe('rest');
    expect(visemeAt(late, Number.NaN)).toBe('rest');
    expect(visemeAt({ durationMs: 500, cues: [] }, 200)).toBe('rest');
  });

  it('agrees with reading the cues one by one, on a long timeline', () => {
    const cues = Array.from({ length: 997 }, (_, i) => ({ startMs: i * 7 + (i % 3), viseme: VISEMES[i % VISEMES.length]! }));
    const long: LipsyncTimeline = { durationMs: 7000, cues };
    const linear = (ms: number): Viseme => {
      let shape: Viseme = 'rest';
      for (const cue of cues) if (cue.startMs <= ms) shape = cue.viseme;
      return ms >= long.durationMs ? 'rest' : shape;
    };
    for (let ms = 0; ms < 7100; ms += 3.5) expect(visemeAt(long, ms)).toBe(linear(ms));
  });
});
