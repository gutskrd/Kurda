import { foldDiacritics } from '@kurda/shared';

/**
 * Profanity and slur filter, pure and evasion-resistant: text is normalized (diacritics folded, leetspeak mapped back,
 * separators and repeated letters collapsed) before matching, so "f.u.c.k", "shıt" and "fuuuck" all match. Matches are
 * masked on delivery and flagged messages feed repeat-offender escalation. The wordlists are a small extensible seed
 * across Kurdish, English, Turkish and Arabic transliteration.
 */

// Seed lists — deliberately small; extend/replace with curated wordlists.
const WORDLISTS: Record<string, string[]> = {
  en: ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt'],
  ku: ['qûn', 'kerî', 'gû'],
  tr: ['orospu', 'piç', 'sik', 'amk'],
  ar: ['sharmuta', 'kalb', 'ayr'],
};

/**
 * Listed words that are more than swearing: sexual words, and slurs once the lists hold any. In a private message or
 * letter only these, or a flag on something sent to a minor, are put before a moderator; plain swearing is only
 * counted against its writer.
 */
const SERIOUS: Record<'sexual' | 'hate', string[]> = {
  sexual: ['cunt', 'dick', 'kerî', 'sik', 'orospu', 'sharmuta', 'ayr'],
  hate: [],
};

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

const BADWORDS = new Set(Object.values(WORDLISTS).flatMap((l) => l.map((w) => normalize(w))));
const SERIOUS_OF = new Map<string, 'sexual' | 'hate'>(
  (Object.entries(SERIOUS) as Array<['sexual' | 'hate', string[]]>).flatMap(([category, words]) => words.map((w) => [normalize(w), category] as const)),
);
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

/** The listed word a token is, as the list folds it, or null. */
function listedWord(token: string): string | null {
  const n = normalize(token);
  if (!n) return null;
  if (BADWORDS.has(n)) return n;
  const c = collapse(n);
  return BADWORDS.has(c) ? c : null;
}

export interface FilterResult {
  masked: string;
  flagged: boolean;
  /** the listed words that matched, as the list folds them: never the writer's own spelling or anything else they wrote */
  hits: string[];
}

/** Mask profanity in `text`; report whether anything was flagged and which words. */
export function filterText(text: string): FilterResult {
  const hits: string[] = [];
  const masked = text.replace(/\S+/g, (token) => {
    const word = listedWord(token);
    if (word) {
      if (!hits.includes(word)) hits.push(word);
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

/** The most serious category among matched listed words (`hits`): hate before sexual, and null for plain swearing. */
export function seriousCategory(hits: readonly string[]): 'sexual' | 'hate' | null {
  const found = hits.map((h) => SERIOUS_OF.get(h)).filter((c): c is 'sexual' | 'hate' => c !== undefined);
  if (found.includes('hate')) return 'hate';
  return found.includes('sexual') ? 'sexual' : null;
}
