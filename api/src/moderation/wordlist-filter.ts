/**
 * Wordlist profanity filter (KUR-086) — the fast, deterministic first pass that
 * runs before the AI-assisted policy engine (#293). Pure: normalize text to
 * defeat common evasion (diacritics, leetspeak, inserted separators, repeated
 * letters, and letters spaced apart), match against a supplied wordlist, and
 * mask hits on delivery. The wordlists themselves (Kurdish + English + Turkish/
 * Arabic) are injected; this module has no I/O.
 *
 * Matching is intentionally conservative (canonical token equality, not loose
 * substring) to limit false positives — a Scunthorpe-style false hit gets the
 * appeal path noted in #086 rather than a silent block.
 */

/** Common leet substitutions folded to letters before matching. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
};

/**
 * Canonicalize a token: lowercase, strip diacritics (so Kurdish ê/î/û and any
 * combining marks fold), apply leet substitutions, drop non-alphanumerics
 * (defeats `f.u.c.k`-style separators), and collapse runs of the same letter
 * (defeats `saaad`). The empty string means "nothing matchable here".
 */
export function canonical(token: string): string {
  const stripped = token.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let out = '';
  for (const ch of stripped) {
    const mapped = LEET[ch] ?? ch;
    if (/[a-z0-9]/.test(mapped)) out += mapped;
  }
  return out.replace(/(.)\1+/g, '$1');
}

/** A normalized set of blocked terms, ready for matching. */
export type Blocklist = ReadonlySet<string>;

export function buildBlocklist(words: Iterable<string>): Blocklist {
  const set = new Set<string>();
  for (const w of words) {
    const c = canonical(w);
    if (c) set.add(c);
  }
  return set;
}

/** Whether a single token canonicalizes to a blocked term. */
export function isBlocked(token: string, blocklist: Blocklist): boolean {
  const c = canonical(token);
  return c.length > 0 && blocklist.has(c);
}

function maskToken(token: string): string {
  return '*'.repeat(Array.from(token).length);
}

export interface FilterResult {
  /** the text with blocked terms masked */
  masked: string;
  /** how many terms were masked */
  hits: number;
}

/**
 * Mask every blocked term in the text. Catches both single tokens (incl.
 * separator/leet/diacritic/repeat evasion) and terms spelled out across
 * consecutive single-letter tokens (`b a d`). Whitespace is preserved so the
 * message stays readable.
 */
export function maskProfanity(text: string, blocklist: Blocklist): FilterResult {
  // Split keeping whitespace runs: even indices are tokens, odd are separators.
  const parts = text.split(/(\s+)/);
  const tokenIndexes: number[] = [];
  for (let i = 0; i < parts.length; i += 2) tokenIndexes.push(i);

  const masked = new Set<number>();
  let hits = 0;

  // Pass 1 — whole-token matches.
  for (const i of tokenIndexes) {
    const tok = parts[i];
    if (tok !== undefined && tok !== '' && isBlocked(tok, blocklist)) {
      masked.add(i);
      hits++;
    }
  }

  // Pass 2 — terms spaced out as consecutive single-letter tokens.
  for (let a = 0; a < tokenIndexes.length; a++) {
    let joined = '';
    for (let b = a; b < tokenIndexes.length; b++) {
      const idx = tokenIndexes[b];
      if (idx === undefined) break;
      const c = parts[idx] === undefined ? '' : canonical(parts[idx] as string);
      if (c.length !== 1) break; // only single-letter tokens chain
      joined += c;
      if (joined.length >= 2 && blocklist.has(joined)) {
        for (let k = a; k <= b; k++) {
          const ki = tokenIndexes[k];
          if (ki !== undefined) masked.add(ki);
        }
        hits++; // one spaced-out term = one hit
        a = b; // continue after this run
        break;
      }
    }
  }

  for (const i of masked) {
    const tok = parts[i];
    if (tok !== undefined) parts[i] = maskToken(tok);
  }

  return { masked: parts.join(''), hits };
}

/** Convenience: does the text contain any blocked term? */
export function containsProfanity(text: string, blocklist: Blocklist): boolean {
  return maskProfanity(text, blocklist).hits > 0;
}
