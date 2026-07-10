import { foldDiacritics } from '@kurda/shared';

/**
 * Profanity / slur filter (KUR-086). Pure and evasion-resistant: text is
 * normalized (diacritics folded, leetspeak un-mapped, separators and repeated
 * letters collapsed) *before* matching, so "f.u.c.k", "shıt", and "fuuuck" all
 * catch. Masks matched words on delivery; flagged messages feed repeat-offender
 * escalation. Wordlists are a small extensible seed across the languages Kurda
 * serves (Kurdish, English, Turkish, Arabic transliteration) — real deployments
 * load fuller curated lists, and a false-positive appeal path is left for the
 * admin panel.
 */

// Seed lists — deliberately small; extend/replace with curated wordlists.
const WORDLISTS: Record<string, string[]> = {
  en: ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt'],
  ku: ['qûn', 'kerî', 'gû'],
  tr: ['orospu', 'piç', 'sik', 'amk'],
  ar: ['sharmuta', 'kalb', 'ayr'],
};

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

const BADWORDS = new Set(Object.values(WORDLISTS).flatMap((l) => l.map((w) => normalize(w))));
/** Longer words are also matched as substrings (spaced-out evasion detection). */
const SUBSTRING_MIN = 4;

/** Fold to a comparable form: diacritics, case, leetspeak, separators removed. */
export function normalize(input: string): string {
  const folded = foldDiacritics(input).toLowerCase();
  let out = '';
  for (const ch of folded) out += LEET[ch] ?? ch;
  return out.replace(/[^a-z0-9]/g, '');
}

/** Collapse any run of a repeated char to one ("fuuuck" → "fuck"). */
function collapse(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

function isBadToken(token: string): boolean {
  const n = normalize(token);
  if (!n) return false;
  return BADWORDS.has(n) || BADWORDS.has(collapse(n));
}

export interface FilterResult {
  masked: string;
  flagged: boolean;
  hits: string[];
}

/** Mask profanity in `text`; report whether anything was flagged and which words. */
export function filterText(text: string): FilterResult {
  const hits: string[] = [];
  const masked = text.replace(/\S+/g, (token) => {
    if (isBadToken(token)) {
      hits.push(normalize(token));
      return '*'.repeat(Math.max(3, token.length));
    }
    return token;
  });

  // catch spaced-out evasion ("s h i t") for flagging even if not per-token masked
  let flagged = hits.length > 0;
  if (!flagged) {
    const whole = collapse(normalize(text));
    for (const w of BADWORDS) {
      if (w.length >= SUBSTRING_MIN && whole.includes(w)) {
        flagged = true;
        hits.push(w);
        break;
      }
    }
  }
  return { masked, flagged, hits };
}
