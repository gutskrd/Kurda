/**
 * Which part of a search result is what was typed, so the apps can draw it in
 * bold.
 *
 * The searches match wherever the query sits in a name and without its
 * diacritics ("serk" finds "Berserker", "sev" finds "şev"), so the part to mark
 * is found the same way: both sides folded and lowercased, one character at a
 * time, and the match mapped back onto the text as written. Only the first
 * place it appears is marked, which is the one the ranking cared about.
 *
 * A result that matched only loosely (a near spelling) holds no exact piece of
 * the query, and comes back as one unmarked part.
 */
import { foldDiacritics, normalizeKurdish } from './kurdish-text.js';

export interface TextPart {
  text: string;
  /** this piece is the query */
  match: boolean;
}

/** One character folded: lowercased, then ê î û ç ş to their base letters. */
function foldChar(ch: string): string {
  return foldDiacritics(ch.toLowerCase());
}

export function matchedParts(text: string, query: string): TextPart[] {
  const whole: TextPart[] = text ? [{ text, match: false }] : [];
  const wanted = foldDiacritics(normalizeKurdish(query)).toLowerCase();
  if (!text || !wanted) return whole;

  // the folded text, and for each of its code units the index in `text` it came from
  const written = text.normalize('NFC');
  let folded = '';
  const from: number[] = [];
  let at = 0;
  for (const ch of written) {
    const f = foldChar(ch);
    for (let i = 0; i < f.length; i++) from.push(at);
    folded += f;
    at += ch.length;
  }
  from.push(at);

  const start = folded.indexOf(wanted);
  if (start < 0) return whole;
  const begin = from[start]!;
  // the end is where the character holding the last matched unit ends
  const lastFrom = from[start + wanted.length - 1]!;
  const end = lastFrom + [...written.slice(lastFrom)][0]!.length;

  const parts: TextPart[] = [];
  if (begin > 0) parts.push({ text: written.slice(0, begin), match: false });
  parts.push({ text: written.slice(begin, end), match: true });
  if (end < written.length) parts.push({ text: written.slice(end), match: false });
  return parts;
}
