import { describe, expect, it } from 'vitest';
import type { StoryGameView } from '@kurda/shared';
import { closesSoon, isTimed, readingNote, secondsLeft } from './clock';

const T = Date.parse('2026-10-13T10:00:00Z');
const at = (s: number) => new Date(T + s * 1000).toISOString();

describe('story game clock', () => {
  it('counts whole seconds left by the server clock, never below zero', () => {
    expect(secondsLeft(at(9.2), T)).toBe(10);
    expect(secondsLeft(at(-3), T)).toBe(0);
    expect(secondsLeft(null, T)).toBeNull();
  });

  it('tells readers the host may start after the soft cap, and that questions start soon in the last minute', () => {
    const v = { mode: 'group', status: 'reading', readingSoftCapAt: at(100), readingHardCapAt: at(400) } as const;
    expect(readingNote(v, T)).toBeNull();
    expect(readingNote(v, T + 150_000)).toBe('host-may-start');
    expect(readingNote(v, T + 345_000)).toBe('starting-soon');
    expect(readingNote({ ...v, mode: 'solo' }, T + 345_000)).toBeNull();
  });

  it('says an untimed group question closes soon only in its last 30 seconds', () => {
    const v = { mode: 'duo', status: 'question', phaseEndsAt: at(31), settings: { timerSeconds: 0 } } as unknown as StoryGameView;
    expect(closesSoon(v, T)).toBe(false);
    expect(closesSoon(v, T + 2_000)).toBe(true);
    expect(closesSoon({ ...v, settings: { ...v.settings, timerSeconds: 60 } }, T + 2_000)).toBe(false);
    expect(closesSoon({ ...v, mode: 'solo' }, T + 2_000)).toBe(false);
  });

  it('shows a countdown only for a timed question with a deadline', () => {
    expect(isTimed({ status: 'question', phaseEndsAt: at(60), settings: { timerSeconds: 60 } } as StoryGameView)).toBe(true);
    expect(isTimed({ status: 'question', phaseEndsAt: at(60), settings: { timerSeconds: 0 } } as StoryGameView)).toBe(false);
    expect(isTimed({ status: 'reveal', phaseEndsAt: at(60), settings: { timerSeconds: 60 } } as StoryGameView)).toBe(false);
  });
});
