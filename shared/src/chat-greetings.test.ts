import { describe, expect, it } from 'vitest';
import { CHAT_GREETINGS, greetingDialect } from './chat-greetings.js';

describe('the greetings an empty chat offers', () => {
  it('greets in the interface’s Kurdish, whatever the course', () => {
    expect(greetingDialect('ckb', 'kmr')).toBe('ckb');
    expect(greetingDialect('ku', 'ckb')).toBe('kmr');
  });

  it('greets in the course’s Kurdish under any other language, Kurmancî before the first lesson', () => {
    expect(greetingDialect('en', 'ckb')).toBe('ckb');
    expect(greetingDialect('de', 'kmr')).toBe('kmr');
    expect(greetingDialect('ar', null)).toBe('kmr');
  });

  it('has three for each variety, each written in its own script', () => {
    expect(CHAT_GREETINGS.kmr).toHaveLength(3);
    expect(CHAT_GREETINGS.ckb).toHaveLength(3);
    for (const text of CHAT_GREETINGS.ckb) expect(text).toMatch(/[؀-ۿ]/);
    for (const text of CHAT_GREETINGS.kmr) expect(text).not.toMatch(/[؀-ۿ]/);
  });
});
