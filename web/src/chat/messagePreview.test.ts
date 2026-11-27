import { describe, it, expect } from 'vitest';
import { messagePreview, truncate } from './messagePreview';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { de } from '../i18n/de';
import { ku } from '../i18n/ku';

const wordle = 'https://hevalo.app/app/games/peyvok-battle?id=8f3c1a9d-4b2e-4c77-9a01-2de5f6b7c8d9';
const rhyme = 'https://hevalo.app/app/games/rhyme-match?id=2ab41c9d-4b2e-4c77-9a01-2de5f6b7c8d9';

describe('messagePreview', () => {
  it('says a one-tap thanks was said, never its stored stand-in text', () => {
    expect(messagePreview({ body: 'Spas! 💛', kind: 'thanks', thanks: { batchId: 'b1', name: 'Gul' } }, t)).toBe('Said thanks for Gul');
    // the conversation list knows only the kind
    expect(messagePreview({ body: 'Spas! 💛', kind: 'thanks' }, t)).toBe('Said thanks for a gift');
  });

  it('describes a game invite instead of showing its URL', () => {
    // the whole point: a conversation row used to read
    // "https://hevalo.app/app/games/peyvok-battle?id=8f3c…"
    const out = messagePreview(wordle, t);
    expect(out).toBe('Pêşbaziya Peyvan invite');
    expect(out).not.toContain('http');
    expect(out).not.toContain('id=');
  });

  it('names the right game', () => {
    expect(messagePreview(rhyme, t)).toBe('Pêşbaziya Serwayan invite');
  });

  it('keeps what the sender wrote around the link', () => {
    expect(messagePreview(`join me! ${wordle} now`, t)).toBe('join me! now · Pêşbaziya Peyvan invite');
  });

  it('leaves an ordinary message alone', () => {
    expect(messagePreview('Silav, tu çawa yî?', t)).toBe('Silav, tu çawa yî?');
  });

  it('collapses newlines, which a row cannot show anyway', () => {
    expect(messagePreview('first line\n\nsecond   line', t)).toBe('first line second line');
  });

  it('is not fooled by a link to somewhere else', () => {
    const other = 'look at https://example.com/app/games/chess?id=abcdef';
    expect(messagePreview(other, t)).toBe(other);
  });

  it('handles a relative invite link, as an in-app share produces', () => {
    expect(messagePreview('/app/games/rhyme-match?id=2ab41c9d-4b2e-4c77', t)).toBe('Pêşbaziya Serwayan invite');
  });

  /** The preview has no React, so the game name comes from the catalogue through the caller’s `t`. */
  it('names the game in the reader’s language', () => {
    expect(messagePreview(wordle, translator(de))).toBe('Einladung zu Pêşbaziya Peyvan');
    expect(messagePreview(rhyme, translator(ku))).toBe('Vexwendina Pêşbaziya Serwayan');
  });

  it('strips every link when several are pasted', () => {
    // a global pattern is rebuilt per call; a shared one would skip matches
    // because lastIndex carries over between uses
    expect(messagePreview(`${wordle} and ${rhyme}`, t)).toBe('and · Pêşbaziya Peyvan invite');
  });
});

describe('messagePreview — a message that is a card', () => {
  it('names a game card by its game, with no text to show', () => {
    expect(messagePreview({ body: null, kind: 'game', game: { game: 'stories', lobbyId: 's1' } }, t)).toBe('Stories invite');
  });

  it('says a game invite when a conversation row knows only the kind', () => {
    expect(messagePreview({ body: '', kind: 'game' }, t)).toBe('Game invite');
  });

  it('reads a text message the same whether given the message or its text', () => {
    expect(messagePreview({ body: `join! ${rhyme}`, kind: 'text' }, t)).toBe(messagePreview(`join! ${rhyme}`, t));
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

/** A gift or game card has no body, so the preview names it rather than printing an empty line. */
describe('messagePreview for every kind of message', () => {
  it('names a gift — by its item only once the reader has unwrapped it, so a banner never spoils it', () => {
    const gift = { batchId: 'b', sku: 's', name: 'Newroz fire', category: 'background', assetUrl: null, tier: 'legendary' as const, recipients: [], from: null, myGiftId: 'g1', myOpened: false, equippable: null };
    // in words alone: the row draws the gift's icon beside them (chat/PreviewIcon.tsx)
    expect(messagePreview({ body: null, kind: 'gift' }, t)).toBe('Gift');
    expect(messagePreview({ body: null, kind: 'gift', gift }, t)).toBe('Gift');
    expect(messagePreview({ body: null, kind: 'gift', gift: { ...gift, myOpened: true } }, t)).toBe('Newroz fire');
    expect(messagePreview({ body: '🎁 Gift', kind: 'gift' }, translator(ku))).toBe('Diyarî');
  });

  it('names a game card by its game, or as an invite when it does not say', () => {
    expect(messagePreview({ body: null, kind: 'game', game: { game: 'rhyme-match', lobbyId: 'l1' } }, t)).toBe('Pêşbaziya Serwayan invite');
    expect(messagePreview({ body: null, kind: 'game' }, t)).toBe('Game invite');
  });

  it('treats a message with no kind as text, as before', () => {
    expect(messagePreview({ body: 'Silav' }, t)).toBe('Silav');
  });
});
