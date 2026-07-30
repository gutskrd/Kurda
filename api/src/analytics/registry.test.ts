import { describe, expect, it } from 'vitest';
import { isKnownEvent, validateEvent } from './registry.js';

describe('event registry', () => {
  it('accepts a known event with a valid payload', () => {
    const res = validateEvent('lesson_complete', { lessonId: 'l1', correct: 8, total: 10 });
    expect(res).toEqual({ ok: true, type: 'lesson_complete', payload: { lessonId: 'l1', correct: 8, total: 10 } });
  });

  it('drops unknown event types', () => {
    expect(isKnownEvent('mystery')).toBe(false);
    expect(validateEvent('mystery', {})).toEqual({ ok: false, reason: 'unknown_type' });
  });

  it('drops known events with malformed payloads', () => {
    expect(validateEvent('lesson_complete', { lessonId: 'l1' })).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(validateEvent('game_finish', { roomId: 'r', won: 'yes' })).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(validateEvent('screen_view', { screen: '' })).toEqual({ ok: false, reason: 'invalid_payload' });
  });
});
