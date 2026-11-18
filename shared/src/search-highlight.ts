/**
 * Which part of a search result is what was typed, for the apps to draw in bold. Searches match anywhere and without
 * diacritics ("sev" finds "şev"), so the part is found the same way, both sides folded one character at a time and mapped
 * back onto the written text. Only the first match is marked. A loose match (a near spelling) comes back as one unmarked
 * part.
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

  // The folded text, and for each of its code units the index in `text` it came from.
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
  // The end is where the character holding the last matched unit ends.
  const lastFrom = from[start + wanted.length - 1]!;
  const end = lastFrom + [...written.slice(lastFrom)][0]!.length;

  const parts: TextPart[] = [];
  if (begin > 0) parts.push({ text: written.slice(0, begin), match: false });
  parts.push({ text: written.slice(begin, end), match: true });
  if (end < written.length) parts.push({ text: written.slice(end), match: false });
  return parts;
}
