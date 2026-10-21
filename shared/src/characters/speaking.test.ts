import { describe, expect, it } from 'vitest';
import { encodeLipsync, type LipsyncTimeline } from '../lipsync/timeline.js';
import { BLINK_MS, NOD_DEGREES, eyesAt, speakingFrame, voiceTimeline } from './index.js';

const TIMELINE: LipsyncTimeline = {
  durationMs: 900,
  cues: [
    { startMs: 0, viseme: 'rest' },
    { startMs: 100, viseme: 'mbp' },
    { startMs: 200, viseme: 'a' },
    { startMs: 600, viseme: 'rest' },
  ],
};

describe('eyesAt', () => {
  it('keeps the eyes open most of the time and shuts them briefly', () => {
    expect(eyesAt(0)).toBe('open');
    expect(eyesAt(3200 - BLINK_MS - 1)).toBe('open');
    expect(eyesAt(3200 - BLINK_MS)).toBe('closed');
    expect(eyesAt(3199)).toBe('closed');
    expect(eyesAt(3200)).toBe('open');
  });

  it('blinks for about 3% of a minute, never more', () => {
    let shut = 0;
    for (let ms = 0; ms < 60_000; ms += 10) if (eyesAt(ms) === 'closed') shut++;
    expect(shut * 10).toBeGreaterThan(1000);
    expect(shut * 10).toBeLessThan(3000);
  });

  it('treats a time that is not a number as open eyes', () => {
    expect(eyesAt(Number.NaN)).toBe('open');
    expect(eyesAt(-5)).toBe('open');
  });
});

describe('speakingFrame', () => {
  it('follows the timeline while the recording plays', () => {
    expect(speakingFrame({ timeline: TIMELINE, ms: 150, playing: true, sinceMs: 0 }).mouth).toBe('mbp');
    expect(speakingFrame({ timeline: TIMELINE, ms: 300, playing: true, sinceMs: 0 }).mouth).toBe('a');
    expect(speakingFrame({ timeline: TIMELINE, ms: 700, playing: true, sinceMs: 0 }).mouth).toBe('rest');
  });

  it('rests the mouth when paused or with no timeline', () => {
    expect(speakingFrame({ timeline: TIMELINE, ms: 300, playing: false, sinceMs: 0 }).mouth).toBe('rest');
    expect(speakingFrame({ timeline: null, ms: 300, playing: true, sinceMs: 0 }).mouth).toBe('rest');
  });

  it('nods a little while speaking, and not at all with reduced motion or at rest', () => {
    const speaking = speakingFrame({ timeline: TIMELINE, ms: 400, playing: true, sinceMs: 0 });
    expect(Math.abs(speaking.nod)).toBeLessThanOrEqual(NOD_DEGREES);
    expect(speaking.nod).not.toBe(0);
    expect(speakingFrame({ timeline: TIMELINE, ms: 400, playing: true, sinceMs: 0, reducedMotion: true }).nod).toBe(0);
    expect(speakingFrame({ timeline: TIMELINE, ms: 700, playing: true, sinceMs: 0 }).nod).toBe(0);
  });
});

describe('voiceTimeline', () => {
  it('uses the timeline an editor saved', () => {
    const saved = voiceTimeline({ speaker: 'hamo', lipsync: encodeLipsync(TIMELINE) }, 'silav', 900);
    expect(saved?.cues.map((c) => c.viseme)).toEqual(['rest', 'mbp', 'a', 'rest']);
  });

  it('makes one from the words when none was saved and the length is known', () => {
    const made = voiceTimeline({ speaker: 'xezo' }, 'Rojbaş', 1200);
    expect(made?.durationMs).toBe(1200);
    expect(made?.cues.some((c) => c.viseme !== 'rest')).toBe(true);
  });

  it('falls back to the words when the saved timeline cannot be read', () => {
    const made = voiceTimeline({ speaker: 'hamo', lipsync: { v: 9, d: 1, k: [] } as never }, 'av', 800);
    expect(made?.durationMs).toBe(800);
  });

  it('is null with neither a timeline nor words and a length', () => {
    expect(voiceTimeline({ speaker: 'hevalo' }, '', 900)).toBeNull();
    expect(voiceTimeline({ speaker: 'hevalo' }, 'av', null)).toBeNull();
    expect(voiceTimeline(undefined, 'av', 0)).toBeNull();
  });
});
