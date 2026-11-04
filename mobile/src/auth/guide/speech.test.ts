import { describe, expect, it } from 'vitest';
import { voiceTimeline, visemeAt } from '@kurda/shared';
import { SpokenLine, speechMs } from './speech';

/*
 * Words with no recording: a clock that runs for as long as the line would
 * take to say, which a speaking character reads as it reads a player, and
 * the lip-sync made from the words moves the mouth by it.
 */
describe('a spoken line', () => {
  it('takes longer to say the more letters it has, within reason', () => {
    expect(speechMs('Silav!')).toBe(1000);
    expect(speechMs('Silav! Ez Hevalo me. Û tu…?')).toBeGreaterThan(speechMs('Silav!'));
    expect(speechMs('a'.repeat(400))).toBe(8000);
  });

  it('runs from when it was made, and stops at the end of the line', () => {
    let now = 10_000;
    const line = new SpokenLine('Silav! Ez Hevalo me.', () => now);
    expect(line.playing).toBe(true);
    expect(line.currentTime).toBe(0);
    expect(line.duration).toBeCloseTo(line.durationMs / 1000);
    now += 500;
    expect(line.currentTime).toBeCloseTo(0.5);
    now += line.durationMs;
    expect(line.playing).toBe(false);
    expect(line.currentTime).toBeCloseTo(line.durationMs / 1000);
  });

  it('gives the lip-sync a length the words can be fitted to, so the mouth opens somewhere in the line', () => {
    const line = new SpokenLine('Ez baş im');
    const timeline = voiceTimeline(null, line.text, line.durationMs);
    expect(timeline).not.toBeNull();
    const open = timeline!.cues.find((cue) => cue.viseme !== 'rest');
    expect(open).toBeTruthy();
    expect(visemeAt(timeline!, open!.startMs + 1)).not.toBe('rest');
  });
});
