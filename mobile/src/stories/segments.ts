import { glossSpans, storySentences, type StoryGlossEntry } from '@kurda/shared';

/**
 * A paragraph cut into the pieces the reader draws: every piece belongs to
 * one sentence (so the sentence being read aloud can be lit up) and is either
 * plain text or a glossary word (marked, and tappable for its meaning).
 *
 * The glossary words are the shared `glossSpans` — the first time each one
 * appears in the paragraph, as a whole word — so the phone marks exactly what
 * the editor accepted and what the browser marks.
 */
export interface Segment {
  text: string;
  /** index into storySentences(paragraph); null for the space between two sentences */
  sentence: number | null;
  gloss: StoryGlossEntry | null;
}

export function paragraphSegments(paragraph: string, glossary: readonly StoryGlossEntry[]): Segment[] {
  const text = paragraph.normalize('NFC');
  // where each sentence starts and ends in the paragraph (the split trims, so search forward)
  const sentences: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of storySentences(text)) {
    const at = text.indexOf(s, cursor);
    if (at < 0) continue;
    sentences.push({ start: at, end: at + s.length });
    cursor = at + s.length;
  }
  const spans = glossSpans(text, glossary);
  const cuts = new Set<number>([0, text.length]);
  for (const s of sentences) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  for (const g of spans) {
    cuts.add(g.start);
    cuts.add(g.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start) continue;
    const sentence = sentences.findIndex((s) => start >= s.start && end <= s.end);
    const gloss = spans.find((g) => start >= g.start && end <= g.end)?.entry ?? null;
    const piece: Segment = { text: text.slice(start, end), sentence: sentence >= 0 ? sentence : null, gloss };
    const prev = out[out.length - 1];
    // neighbours that are the same kind of thing are one piece
    if (prev && prev.sentence === piece.sentence && prev.gloss === null && piece.gloss === null) prev.text += piece.text;
    else out.push(piece);
  }
  return out;
}

/** The sentence a reveal quotes as its evidence, or the whole paragraph when the editor named none. */
export function evidenceText(paragraphs: readonly string[], paragraph: number | null, sentence: number | null): string | null {
  if (paragraph === null) return null;
  const p = paragraphs[paragraph];
  if (p === undefined) return null;
  if (sentence !== null) {
    const s = storySentences(p)[sentence];
    if (s) return s;
  }
  return p;
}
