import { describe, it, expect } from 'vitest';
import { messagePreview, truncate } from './messagePreview';

const wordle = 'https://mykurda.com/app/games/wordle-battle?id=8f3c1a9d-4b2e-4c77-9a01-2de5f6b7c8d9';
const rhyme = 'https://mykurda.com/app/games/rhyme-match?id=2ab41c9d-4b2e-4c77-9a01-2de5f6b7c8d9';

describe('messagePreview', () => {
  it('describes a game invite instead of showing its URL', () => {
    // the whole point: a conversation row used to read
    // "https://mykurda.com/app/games/wordle-battle?id=8f3c…"
    const out = messagePreview(wordle);
    expect(out).toBe('🟩 Wordle Battle invite');
    expect(out).not.toContain('http');
    expect(out).not.toContain('id=');
  });

  it('names the right game', () => {
    expect(messagePreview(rhyme)).toBe('🎤 Rhyme Match invite');
  });

  it('keeps what the sender wrote around the link', () => {
    expect(messagePreview(`join me! ${wordle} now`)).toBe('join me! now · 🟩 Wordle Battle invite');
  });

  it('leaves an ordinary message alone', () => {
    expect(messagePreview('Silav, tu çawa yî?')).toBe('Silav, tu çawa yî?');
  });

  it('collapses newlines, which a row cannot show anyway', () => {
    expect(messagePreview('first line\n\nsecond   line')).toBe('first line second line');
  });

  it('is not fooled by a link to somewhere else', () => {
    const other = 'look at https://example.com/app/games/chess?id=abcdef';
    expect(messagePreview(other)).toBe(other);
  });

  it('handles a relative invite link, as an in-app share produces', () => {
    expect(messagePreview('/app/games/rhyme-match?id=2ab41c9d-4b2e-4c77')).toBe('🎤 Rhyme Match invite');
  });

  it('strips every link when several are pasted', () => {
    // a global pattern is rebuilt per call; a shared one would skip matches
    // because lastIndex carries over between uses
    expect(messagePreview(`${wordle} and ${rhyme}`)).toBe('and · 🟩 Wordle Battle invite');
  });
});

describe('truncate', () => {
  it('leaves a short string alone', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('adds an ellipsis when it has to cut', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });

  it('counts characters, not code units, so an emoji is never split in half', () => {
    // '🟩' is a surrogate pair: slicing by index could leave half of it behind
    expect(truncate('🟩🟩🟩', 2)).toBe('🟩…');
  });
});
