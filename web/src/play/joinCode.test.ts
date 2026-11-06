import { describe, it, expect } from 'vitest';
import { en, type MessageKey } from '../i18n/en';
import type { ApiError } from '../lib/types';
import { codeFromTyping, joinCodeError } from './joinCode';

const t = (key: MessageKey): string => en[key];
const refused = (over: Partial<ApiError>): ApiError => ({ kind: 'client', message: 'refused', ...over });

describe('codeFromTyping', () => {
  it('upper-cases, and keeps a code however it was spaced or dashed', () => {
    expect(codeFromTyping('abc234')).toBe('ABC234');
    expect(codeFromTyping('abc-234')).toBe('ABC234');
    expect(codeFromTyping(' ABC 234 ')).toBe('ABC234');
    expect(codeFromTyping('ab c2 34')).toBe('ABC234');
  });

  it('reads the digits an Arabic or a Soranî keyboard types', () => {
    expect(codeFromTyping('abc٢٣٤')).toBe('ABC234');
    expect(codeFromTyping('abc۲۳۴')).toBe('ABC234');
  });

  it('drops what cannot be in a code, and never holds more than six', () => {
    // no 0, O, 1, I or L: they are too easily read as each other
    expect(codeFromTyping('ABO')).toBe('AB');
    expect(codeFromTyping('A1B0C')).toBe('ABC');
    expect(codeFromTyping('ABC2345')).toBe('ABC234');
    expect(codeFromTyping('')).toBe('');
  });

  it('finds the code in the whole message a friend sent, and not in the words around it', () => {
    expect(codeFromTyping('Play Peyvok Battle with me on Hevalo! Open Games → Join with a code and type ABC 234.')).toBe('ABC234');
    // "PEYVAN" could be a code on its own; the code the message ends with is the one meant
    expect(codeFromTyping('Li ser Hevalo bi min re Pêşbaziya Peyvan bilîze! Lîstik → Bi kodekê beşdar bibe veke û XYZ 789 binivîse.')).toBe('XYZ789');
    expect(codeFromTyping('لەسەر Hevalo لەگەڵم یاری بکە! یاری ← بە کۆدێک بەشداربە بکەرەوە و KMN-456 بنووسە.')).toBe('KMN456');
  });
});

describe('joinCodeError', () => {
  it('says what to do about each refusal', () => {
    expect(joinCodeError(refused({ status: 404, code: 'GAME_NOT_FOUND' }), t)).toBe(en['play.join.notFound']);
    expect(joinCodeError(refused({ status: 409, code: 'GAME_FULL' }), t)).toBe(en['stories.error.full']);
    expect(joinCodeError(refused({ status: 409, code: 'GAME_STARTED' }), t)).toBe(en['stories.error.started']);
    expect(joinCodeError(refused({ status: 429, kind: 'rate_limited', code: 'RATE_LIMITED' }), t)).toBe(en['play.join.tooMany']);
  });

  it('says an unreachable server the way the app always does, and a server without the route plainly', () => {
    expect(joinCodeError({ kind: 'network', message: 'Failed to fetch' }, t)).toBe(en['error.offline']);
    expect(joinCodeError(refused({ status: 404, code: 'NOT_FOUND', message: 'route not found' }), t)).toBe(en['play.error.notOnServer']);
  });
});
