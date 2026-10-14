import { describe, it, expect } from 'vitest';
import { paragraphSentences } from './StoryText';

const gloss = (term: string) => ({ term, meanings: { en: term } });

describe('paragraphSentences', () => {
  it('cuts a paragraph into the studio’s sentences, keeping the space between them', () => {
    const cut = paragraphSentences('Ez im. Tu yî!  Ew e?', []);
    expect(cut.map((s) => s.pieces.map((p) => p.text).join(''))).toEqual(['Ez im.', 'Tu yî!', 'Ew e?']);
    expect(cut.map((s) => s.lead)).toEqual(['', ' ', '  ']);
  });

  it('marks a glossary word once per paragraph, inside its sentence', () => {
    const [first, second] = paragraphSentences('Heval tê. Heval diçe.', [gloss('heval')]);
    expect(first!.pieces.filter((p) => p.gloss).map((p) => p.text)).toEqual(['Heval']);
    expect(second!.pieces.some((p) => p.gloss)).toBe(false);
  });

  it('keeps the quote and the comma touching a glossary word with it', () => {
    const [s] = paragraphSentences('Ew dibêje: “Fermo, du hene.”', [gloss('Fermo')]);
    const word = s!.pieces.find((p) => p.gloss)!;
    expect(word.lead).toBe('“');
    expect(word.trail).toBe(',');
    // nothing is lost or doubled: the sentence reads as written
    expect(s!.pieces.map((p) => `${p.lead ?? ''}${p.text}${p.trail ?? ''}`).join('')).toBe('Ew dibêje: “Fermo, du hene.”');
  });

  it('marks words in a Soranî paragraph too', () => {
    const [s] = paragraphSentences('ئەمڕۆ ڕۆژین دەچێتە قوتابخانە.', [gloss('قوتابخانە')]);
    const word = s!.pieces.find((p) => p.gloss)!;
    expect(word.text).toBe('قوتابخانە');
    expect(word.trail).toBe('.');
  });
});
