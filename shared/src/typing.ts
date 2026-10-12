/**
 * Typing Kurdish: what a keyboard sends, read as what the writer meant — for
 * the typing race, the Wordle keyboard and the "get the Kurmancî keyboard"
 * guide.
 *
 * The race used to compare what was typed with its text code point by code
 * point, as stored. Every way that goes wrong was found in practice
 * (map3-race-keyboards): a text saved decomposed (e + U+0302) could never be
 * typed by a keyboard that sends the precomposed ê; a curly apostrophe or a
 * no-break space in the text was a character nobody can type; a Turkish Q
 * keyboard sends ı for i; and one missed letter shifted everything after it,
 * so the rest of the race scored nothing. Here is one reading of a typed text
 * for the server that scores it, the two apps that colour it as it is typed,
 * and the admin screen that checks a text before it is saved — so none of them
 * can disagree about what counts.
 */
import { SORANI_KEYS } from './lesson-answers.js';

// ---------- the two varieties a text can be in ----------

export const TYPING_DIALECTS = ['kurmanci', 'sorani'] as const;
export type TypingDialect = (typeof TYPING_DIALECTS)[number];

export function isTypingDialect(v: unknown): v is TypingDialect {
  return v === 'kurmanci' || v === 'sorani';
}

/**
 * The language code a race text is stored under (`race_texts.language`), by
 * variety: ISO 639-3, as the admin screen has always offered them.
 */
export type TypingLanguage = 'kmr' | 'ckb';

export function typingLanguage(dialect: TypingDialect): TypingLanguage {
  return dialect === 'sorani' ? 'ckb' : 'kmr';
}

/**
 * The variety a stored language code or a course's dialect name is in. Anything
 * that is not recognisably Soranî is Kurmancî, which is what every text was
 * before the column was read at all.
 */
export function typingDialectOf(language: string | null | undefined): TypingDialect {
  const l = (language ?? '').trim().toLowerCase();
  return l === 'ckb' || l === 'sorani' || l === 'soranî' || l === 'central kurdish' ? 'sorani' : 'kurmanci';
}

// ---------- the letters a keyboard may lack ----------

/** The Kurmancî letters a Latin keyboard lacks, in alphabet order — the race's key bar. */
export const KURMANCI_SPECIAL = ['ç', 'ê', 'î', 'ş', 'û'] as const;

/**
 * The Soranî letters an Arabic or Persian keyboard lacks or types as a
 * lookalike — the lesson key bar's set, so a learner meets the same keys
 * everywhere.
 */
export const SORANI_SPECIAL = SORANI_KEYS;

/** The key bar for a text in this variety. */
export function specialKeys(dialect: TypingDialect): readonly string[] {
  return dialect === 'sorani' ? SORANI_SPECIAL : KURMANCI_SPECIAL;
}

/** The 31 letters of the Kurmancî (Hawar) alphabet, lower case, in order. */
export const KURMANCI_ALPHABET = [
  'a', 'b', 'c', 'ç', 'd', 'e', 'ê', 'f', 'g', 'h', 'i', 'î', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 'ş', 't', 'u', 'û', 'v', 'w', 'x', 'y', 'z',
] as const;

const KURMANCI_LETTERS = new Set<string>(KURMANCI_ALPHABET);

/**
 * The Kurmancî letter a key press means, or null when it is not one.
 *
 * For Wordle's physical keyboard, which used to drop every letter typed with a
 * modifier — and that is how most people type ç ê î ş û: Option+c on a Mac,
 * AltGr on Windows, a dead key, Shift+Ş. Rather than guess which modifiers are
 * innocent, read the character the key produced: if it is a letter of the
 * alphabet once normalised (ı is i, a decomposed ê is ê, Ş is ş), it is that
 * letter.
 */
export function kurmanciLetter(key: string): string | null {
  const ch = normalizeTyping(key, 'kurmanci').toLowerCase();
  return KURMANCI_LETTERS.has(ch) ? ch : null;
}

// ---------- reading a text as a keyboard would type it ----------

/**
 * Formatting nobody types and nobody sees: soft hyphen, the Arabic letter mark,
 * zero-width space and joiner, the direction marks, embeddings and isolates a
 * phone puts around right-to-left text, word joiners, the byte-order mark — and
 * tatweel, the stretch that lengthens a joined Arabic-script letter.
 * (The zero-width non-joiner is dealt with on its own, below.)
 */
const INVISIBLE = /[\u00ad\u061c\u0640\u200b\u200d-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/**
 * Characters a keyboard has no key for, as the character it does have. Typing
 * "Ez’ê bêm — sibê…" on any keyboard gives "Ez'ê bêm - sibê...", so that is
 * what both the text and the typing are read as.
 */
const TYPOGRAPHIC: Record<string, string> = {
  '\u2018': "'", // ‘
  '\u2019': "'", // ’
  '\u201a': "'", // ‚
  '\u201b': "'", // ‛
  '\u2032': "'", // ′
  '\u02bc': "'", // ʼ
  '\u2039': "'", // ‹
  '\u203a': "'", // ›
  '\u201c': '"', // “
  '\u201d': '"', // ”
  '\u201e': '"', // „
  '\u201f': '"', // ‟
  '\u2033': '"', // ″
  '\u00ab': '"', // «
  '\u00bb': '"', // »
  '\u2010': '-', // hyphen
  '\u2011': '-', // non-breaking hyphen
  '\u2012': '-', // figure dash
  '\u2013': '-', // –
  '\u2014': '-', // —
  '\u2015': '-', // horizontal bar
  '\u2212': '-', // minus sign
  '\u2026': '...', // …
  /*
   * The Turkish dotted and dotless i. Hawar has no ı, and a Turkish Q keyboard
   * — the one Windows offers for Kurmancî — types it on the i key.
   */
  '\u0131': 'i',
  '\u0130': 'I',
  /*
   * Arabic and Persian keyboards type these where a Kurdish one types the
   * Kurdish letter: the same letter, another code point (kurdish-text.ts).
   */
  '\u0643': '\u06a9', // ك arabic kaf → ک keheh
  '\u064a': '\u06cc', // ي arabic yeh → ی farsi yeh
  '\u0649': '\u06cc', // ى alef maksura → ی
  '\u06c0': '\u06d5', // ۀ heh with yeh above → ە
};

const TYPOGRAPHIC_RE = new RegExp(`[${Object.keys(TYPOGRAPHIC).join('')}]`, 'g');

/** Persian (extended Arabic-Indic) digits as the Arabic-Indic digits Soranî is written with. */
const PERSIAN_DIGIT = /[\u06f0-\u06f9]/g;
/** Either Arabic-script digit as the Latin digit Kurmancî is written with. */
const ARABIC_DIGIT = /[\u0660-\u0669\u06f0-\u06f9]/g;

/** Arabic punctuation as the Latin mark a Kurmancî keyboard types. */
const ARABIC_PUNCTUATION: Record<string, string> = { '\u060c': ',', '\u061b': ';', '\u061f': '?' };

export interface NormalizeTypingOptions {
  /**
   * The text is still being typed: one trailing space is kept, because it is
   * the space that ends a word, not one to tidy away.
   */
  partial?: boolean;
}

/**
 * A text as the race compares it, the same whichever keyboard typed it — and
 * the form a race text is saved in.
 *
 * - Unicode NFC, so e + U+0302 is ê, one letter.
 * - ı and İ (a Turkish keyboard's i) as i and I.
 * - Curly quotes and apostrophes, guillemets, dashes and the ellipsis as the
 *   straight characters every keyboard has.
 * - Any run of spaces, tabs, line breaks or no-break spaces as one space.
 * - Invisible formatting removed, and Arabic tatweel with it.
 * - Soranî lookalikes as the Kurdish letter: ك → ک, ي and ى → ی, ۀ → ە; and
 *   ه followed by a zero-width non-joiner — how a Persian keyboard writes ە —
 *   as ە.
 * - Digits as the variety writes them: Arabic-Indic in Soranî, Latin in
 *   Kurmancî (where Arabic punctuation also becomes the Latin mark).
 * - Trimmed (see `partial`).
 *
 * Case and accents are kept: whether e may stand for ê is the race's accent
 * mode, decided when comparing, never here.
 *
 * Idempotent, so text that has already been through it is unchanged.
 */
export function normalizeTyping(
  text: string,
  dialect: TypingDialect = 'kurmanci',
  options: NormalizeTypingOptions = {},
): string {
  let out = text
    .replace(/\u0647\u200c/g, '\u06d5')
    .replace(/\u200c/g, '')
    .replace(INVISIBLE, '')
    .normalize('NFC')
    // 'İ'.toLowerCase() is i + a combining dot, which no NFC form absorbs
    .replace(/i\u0307/g, 'i')
    .replace(TYPOGRAPHIC_RE, (ch) => TYPOGRAPHIC[ch] ?? ch);
  out =
    dialect === 'sorani'
      ? out.replace(PERSIAN_DIGIT, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x0660))
      : out
          .replace(ARABIC_DIGIT, (d) => {
            const code = d.charCodeAt(0);
            return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
          })
          .replace(/[\u060c\u061b\u061f]/g, (ch) => ARABIC_PUNCTUATION[ch] ?? ch);
  out = out.replace(/\s+/g, ' ');
  return options.partial ? out.trimStart() : out.trim();
}

// ---------- accents ----------

/**
 * How a race treats accented letters, chosen by the racer and stored with the
 * race. Personal bests and rankings only ever compare races in the same mode.
 *
 * - `strict` — exactly as written: e for ê is a mistake.
 * - `forgiving` (the default) — e counts for ê, i for î, u for û, c for ç, s
 *   for ş (and in Soranî ی for ێ, و for ۆ, ر for ڕ, ل for ڵ): the text is still
 *   shown with its accents, the letter still counts, and how many accents were
 *   left out is counted separately.
 * - `hidden` — the text is shown without accents and compared without them.
 */
export const ACCENT_MODES = ['strict', 'forgiving', 'hidden'] as const;
export type AccentMode = (typeof ACCENT_MODES)[number];
export const DEFAULT_ACCENT_MODE: AccentMode = 'forgiving';

export function isAccentMode(v: unknown): v is AccentMode {
  return v === 'strict' || v === 'forgiving' || v === 'hidden';
}

/** An accented letter and the letter it is, without the accent. */
const ACCENT_FOLD: Record<string, string> = {
  ç: 'c',
  ê: 'e',
  î: 'i',
  ş: 's',
  û: 'u',
  Ç: 'C',
  Ê: 'E',
  Î: 'I',
  Ş: 'S',
  Û: 'U',
  '\u06ce': '\u06cc', // ێ → ی
  '\u06c6': '\u0648', // ۆ → و
  '\u0695': '\u0631', // ڕ → ر
  '\u06b5': '\u0644', // ڵ → ل
};

/** One character without its accent (itself when it has none). */
export function foldAccent(ch: string): string {
  return ACCENT_FOLD[ch] ?? ch;
}

/**
 * The text a racer sees: normalised, and without accents in `hidden` mode. One
 * character for one character, so it lines up with `compareTyping`'s `chars`.
 */
export function displayTarget(target: string, mode: AccentMode, dialect: TypingDialect = 'kurmanci'): string {
  const text = normalizeTyping(target, dialect);
  return mode === 'hidden' ? [...text].map(foldAccent).join('') : text;
}

// ---------- the backtick shortcut ----------

const BACKTICK: Record<string, string> = {
  e: 'ê',
  i: 'î',
  u: 'û',
  c: 'ç',
  s: 'ş',
  E: 'Ê',
  I: 'Î',
  U: 'Û',
  C: 'Ç',
  S: 'Ş',
};

/**
 * Type a character, where a base letter followed by a backtick is the accented
 * letter: e` is ê, i` î, u` û, c` ç, s` ş.
 *
 * A shortcut for a physical keyboard that needs no setup at all — the backtick
 * is on every Latin layout, in reach, and never part of a Kurdish text (the
 * Esperanto x-system works the same way). It does not touch Option or AltGr,
 * which would break the dead keys of people who did set up a layout.
 *
 * Returns the text after `nextChar` is typed. A backtick after anything else is
 * typed as itself.
 */
export function applyBacktickShortcut(prev: string, nextChar: string): string {
  if (nextChar === '`') {
    const chars = [...prev];
    const accented = BACKTICK[chars[chars.length - 1] ?? ''];
    if (accented) return chars.slice(0, -1).join('') + accented;
  }
  return prev + nextChar;
}

/**
 * What a dead key leaves in a text field while it waits for its letter (the
 * spacing accents, and a lone combining mark): not a character yet. A race
 * whose last letter is î ended the moment ˆ arrived, before the i did.
 */
const DEAD_KEY = /[\^`~\u00a8\u00af\u00b4\u00b8\u02c6\u02c7\u02d8-\u02dd\u0300-\u036f]$/;

// ---------- comparing what was typed with the text ----------

/**
 * How one character of the text has been typed:
 * - `ok` — right (in `hidden` mode, right without its accent too);
 * - `accent` — `forgiving` mode: typed without its accent, and counted;
 * - `wrong` — a different character, or left out;
 * - `pending` — not reached yet (or, in `strict` mode, the base letter just
 *   typed where an accented one belongs, which a backtick may still finish).
 */
export type CharState = 'ok' | 'accent' | 'wrong' | 'pending';

export interface TypingComparison {
  /** one per character (code point) of `normalizeTyping(target)`, in order */
  chars: CharState[];
  /** characters of the text that count as typed */
  correct: number;
  /** accented letters typed without their accent (always 0 in `hidden` mode) */
  accentMisses: number;
  /** accented letters of the text that typing has reached — the base of an accent accuracy */
  accented: number;
  /** characters wrong or left out, and characters typed that the text does not have */
  errors: number;
  /** the typing has reached the end of the text (and no accent is still being composed) */
  done: boolean;
  /** the index in `chars` the next character typed goes to */
  caret: number;
  /** characters typed that the text does not have, each run shown before the text's character at `before` */
  extra: Array<{ before: number; text: string }>;
}

export interface CompareTypingOptions {
  /** the variety the text is in, for `normalizeTyping` (default Kurmancî) */
  dialect?: TypingDialect;
  /**
   * The typing is over and is being scored (the server's finish). Without it,
   * the typing is in progress: a trailing space is a word ended, and an accent
   * still being composed is not a character yet.
   */
  final?: boolean;
}

/**
 * How far typing may drift from the text — characters left out or added in
 * total, before the comparison stops looking for where the racer really is.
 * Skipping more than this at once (a whole line) is not a slip, it is a
 * different text.
 */
export const TYPING_WINDOW = 64;

// edit costs, in quarters, so a forgiven accent can sit between a match and a slip
const EDIT = 4; // a character wrong, left out or added
const ACCENT_EDIT = 3; // strict: ê typed as e — a slip, but the likeliest pairing
const ACCENT_MATCH = 1; // forgiving or hidden: counted, a whisker behind exact
const INF = 0x3fffffff;

const OP_NONE = 0;
const OP_MATCH = 1;
const OP_ACCENT = 2;
const OP_SUB = 3;
const OP_DEL = 4; // a character of the text left out
const OP_INS = 5; // a character typed that the text does not have

/**
 * Two code points for one Soranî letter that are kept apart in the text but
 * compared as one: ھ and ه are both h (the Central Kurdish keyboard's h key
 * types ه). Not rewritten in the text, because some texts use ه for the vowel
 * ە at the end of a word, and showing it as ھ there would misspell them.
 */
function charKey(ch: string): string {
  return ch === '\u0647' ? '\u06be' : ch;
}

/**
 * The alignment of a typed text with its target, column by typed character.
 *
 * Kept between calls (see `aligner`): a racer only ever adds or removes
 * characters at the end, so each keystroke computes one new column instead of
 * the whole table — the difference between instant and a visible lag on a
 * long text on a slow phone.
 */
interface Alignment {
  key: string;
  target: string[];
  targetKeys: string[];
  targetFolds: string[];
  typed: string[];
  typedKeys: string[];
  typedFolds: string[];
  mode: AccentMode;
  width: number;
  capacity: number;
  cost: Int32Array;
  matches: Int32Array;
  op: Uint8Array;
}

let cached: Alignment | null = null;

function newAlignment(key: string, target: string[], mode: AccentMode): Alignment {
  const width = 2 * TYPING_WINDOW + 1;
  const capacity = Math.max(64, target.length + 1);
  const targetKeys = target.map(charKey);
  return {
    key,
    target,
    targetKeys,
    targetFolds: targetKeys.map(foldAccent),
    typed: [],
    typedKeys: [],
    typedFolds: [],
    mode,
    width,
    capacity,
    cost: new Int32Array(capacity * width),
    matches: new Int32Array(capacity * width),
    op: new Uint8Array(capacity * width),
  };
}

function ensureCapacity(a: Alignment, columns: number): void {
  if (columns <= a.capacity) return;
  let capacity = a.capacity;
  while (capacity < columns) capacity *= 2;
  const grow = <T extends Int32Array | Uint8Array>(old: T, make: (n: number) => T): T => {
    const next = make(capacity * a.width);
    next.set(old);
    return next;
  };
  a.cost = grow(a.cost, (n) => new Int32Array(n));
  a.matches = grow(a.matches, (n) => new Int32Array(n));
  a.op = grow(a.op, (n) => new Uint8Array(n));
  a.capacity = capacity;
}

/** Fill column `j` of the band: the typing's first `j` characters against every row in reach. */
function fillColumn(a: Alignment, j: number): void {
  const B = TYPING_WINDOW;
  const n = a.target.length;
  const strict = a.mode === 'strict';
  const base = j * a.width;
  const prev = base - a.width; // column j - 1
  for (let k = 0; k < a.width; k++) {
    const i = j + k - B;
    const cell = base + k;
    if (i < 0 || i > n) {
      a.cost[cell] = INF;
      a.matches[cell] = 0;
      a.op[cell] = OP_NONE;
      continue;
    }
    if (j === 0) {
      // nothing typed yet: reaching row i means leaving out i characters
      a.cost[cell] = EDIT * i;
      a.matches[cell] = 0;
      a.op[cell] = i === 0 ? OP_NONE : OP_DEL;
      continue;
    }
    // the cheapest way here; on a tie the one with more letters right, and on
    // a full tie the first considered (the diagonal, then a letter left out)
    let bestCost = INF;
    let bestMatches = 0;
    let bestOp = OP_NONE;
    if (i >= 1) {
      // the diagonal, from (i - 1, j - 1): the same offset k one column back
      const from = prev + k;
      if (a.cost[from]! < INF) {
        bestCost = a.cost[from]!;
        bestMatches = a.matches[from]!;
        if (a.targetKeys[i - 1] === a.typedKeys[j - 1]) {
          bestMatches++;
          bestOp = OP_MATCH;
        } else if (a.targetFolds[i - 1] === a.typedFolds[j - 1]) {
          if (strict) {
            bestCost += ACCENT_EDIT;
            bestOp = OP_SUB;
          } else {
            bestCost += ACCENT_MATCH;
            bestMatches++;
            bestOp = OP_ACCENT;
          }
        } else {
          bestCost += EDIT;
          bestOp = OP_SUB;
        }
      }
      // a character of the text left out, from (i - 1, j): this column, offset k - 1
      const left = base + k - 1;
      if (k >= 1 && a.cost[left]! < INF) {
        const cost = a.cost[left]! + EDIT;
        if (cost < bestCost || (cost === bestCost && a.matches[left]! > bestMatches)) {
          bestCost = cost;
          bestMatches = a.matches[left]!;
          bestOp = OP_DEL;
        }
      }
    }
    // a character typed that the text does not have, from (i, j - 1): offset k + 1
    const up = prev + k + 1;
    if (k + 1 < a.width && a.cost[up]! < INF) {
      const cost = a.cost[up]! + EDIT;
      if (cost < bestCost || (cost === bestCost && a.matches[up]! > bestMatches)) {
        bestCost = cost;
        bestMatches = a.matches[up]!;
        bestOp = OP_INS;
      }
    }
    a.cost[cell] = bestCost;
    a.matches[cell] = bestMatches;
    a.op[cell] = bestOp;
  }
}

/** The alignment for this target and mode, brought up to date with `typed`. */
function aligner(target: string[], typed: string[], mode: AccentMode): Alignment {
  const key = `${mode}\u0000${target.join('')}`;
  const reuse = cached !== null && cached.key === key;
  const a = reuse && cached ? cached : newAlignment(key, target, mode);
  // the columns of a typed prefix that has not changed are still right
  let same = 0;
  if (reuse) while (same < a.typed.length && same < typed.length && a.typed[same] === typed[same]) same++;
  a.typed = typed;
  a.typedKeys = typed.map(charKey);
  a.typedFolds = a.typedKeys.map(foldAccent);
  ensureCapacity(a, typed.length + 1);
  for (let j = reuse ? same + 1 : 0; j <= typed.length; j++) fillColumn(a, j);
  cached = a;
  return a;
}

/**
 * Compare what was typed with the text, character by character.
 *
 * Aligned, not positional: a character left out or typed twice — a space
 * included — is one mistake, and everything after it is still compared with
 * what it was meant to be. The old scoring compared the i-th character with the
 * i-th, so one missed letter made the whole rest of the race wrong (a run that
 * missed only its first letter scored 0 of 26). This is an edit alignment in a
 * window of `TYPING_WINDOW` characters, the typing against the start of the
 * text — the part of the text not reached yet costs nothing and is `pending`.
 * When two readings are equally good, the one with more letters right wins.
 *
 * Both texts are normalised here (`normalizeTyping`), so `chars` lines up with
 * the normalised target; show the racer `displayTarget`.
 */
export function compareTyping(
  target: string,
  typed: string,
  mode: AccentMode = DEFAULT_ACCENT_MODE,
  options: CompareTypingOptions = {},
): TypingComparison {
  const dialect = options.dialect ?? 'kurmanci';
  const final = options.final ?? false;
  const t = [...normalizeTyping(target, dialect)];
  let u = [...normalizeTyping(typed, dialect, { partial: !final })];
  const n = t.length;

  // a dead key still waiting for its letter is not a character yet
  let composing = false;
  if (u.length > 0 && DEAD_KEY.test(u[u.length - 1]!)) {
    u = u.slice(0, -1);
    composing = !final;
  }

  // past the end of the text by more than the window, the rest is all extra
  let overflow: string[] = [];
  if (u.length > n + TYPING_WINDOW) {
    overflow = u.slice(n + TYPING_WINDOW);
    u = u.slice(0, n + TYPING_WINDOW);
  }
  const m = u.length;

  const a = aligner(t, u, mode);
  const B = TYPING_WINDOW;
  const col = m * a.width;

  // where the typing has got to: the cheapest end, then the most letters
  // right, then the furthest — when a key is either a wrong letter or one too
  // many, it is read as the wrong letter, so each key moves the caret on as on
  // any typing test (and a race whose last letter was mistyped is over)
  let end = -1;
  for (let k = 0; k < a.width; k++) {
    const i = m + k - B;
    if (i < 0 || i > n) continue;
    const cell = col + k;
    if (a.cost[cell]! >= INF) continue;
    const best = col + end;
    if (
      end < 0 ||
      a.cost[cell]! < a.cost[best]! ||
      (a.cost[cell] === a.cost[best] && a.matches[cell]! >= a.matches[best]!)
    ) {
      end = k;
    }
  }
  const iEnd = m + end - B;

  const chars: CharState[] = new Array<CharState>(n).fill('pending');
  let correct = 0;
  let accentMisses = 0;
  let accented = 0;
  let errors = overflow.length;
  const extraAt = new Map<number, string[]>();
  const addExtra = (before: number, ch: string): void => {
    const run = extraAt.get(before);
    if (run) run.unshift(ch);
    else extraAt.set(before, [ch]);
  };

  // accents are only counted where they are shown
  const isAccented = (at: number): boolean => mode !== 'hidden' && a.targetFolds[at] !== a.targetKeys[at];

  // walk back from the end; the first step back is the last thing typed
  let i = iEnd;
  let j = m;
  let backtickPending = false;
  while (i > 0 || j > 0) {
    const op = a.op[j * a.width + (i - j + B)]!;
    if (op === OP_MATCH || op === OP_ACCENT) {
      const at = i - 1;
      if (isAccented(at)) accented++;
      if (op === OP_ACCENT && mode === 'forgiving') {
        chars[at] = 'accent';
        accentMisses++;
      } else chars[at] = 'ok';
      correct++;
      i--;
      j--;
    } else if (op === OP_SUB) {
      const at = i - 1;
      const typedKey = a.typedKeys[j - 1]!;
      if (!final && mode === 'strict' && j === m && i === iEnd && BACKTICK[typedKey] === a.targetKeys[at]) {
        // e where ê belongs, as the very last thing typed: a backtick may be
        // next, so it is neither right nor wrong yet
        chars[at] = 'pending';
        backtickPending = true;
      } else {
        chars[at] = 'wrong';
        errors++;
        if (isAccented(at)) {
          accented++;
          if (a.targetFolds[at] === a.typedFolds[j - 1]) accentMisses++;
        }
      }
      i--;
      j--;
    } else if (op === OP_DEL) {
      if (isAccented(i - 1)) accented++;
      chars[i - 1] = 'wrong';
      errors++;
      i--;
    } else if (op === OP_INS) {
      addExtra(i, u[j - 1]!);
      errors++;
      j--;
    } else {
      break; // OP_NONE: only ever at (0, 0)
    }
  }
  for (const ch of overflow) {
    const run = extraAt.get(n) ?? [];
    run.push(ch);
    extraAt.set(n, run);
  }

  const extra = [...extraAt.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([before, run]) => ({ before, text: run.join('') }));

  return {
    chars,
    correct,
    accentMisses,
    accented,
    errors,
    done: n > 0 && iEnd === n && !composing && !backtickPending,
    caret: iEnd,
    extra,
  };
}

// ---------- what a keyboard can type ----------

/** Every printable ASCII character: on every Latin keyboard, and on the Soranî ones too. */
const ASCII_PRINTABLE = /^[\x20-\x7e]$/;

/**
 * The Central Kurdish alphabet (and ه, which the Central Kurdish keyboard's h
 * key types), with the Arabic comma, semicolon and question mark and the
 * Arabic-Indic digits — what a Soranî keyboard has keys for.
 */
const SORANI_TYPEABLE = new Set<string>([
  ...'\u0626\u0627\u0628\u067e\u062a\u062c\u0686\u062d\u062e\u062f\u0631\u0695\u0632\u0698\u0633\u0634\u0639\u063a\u0641\u06a4\u0642\u06a9\u06af\u0644\u06b5\u0645\u0646\u06be\u0647\u06d5\u0648\u06c6\u06cc\u06ce',
  '\u060c',
  '\u061b',
  '\u061f',
  ...'\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669',
]);

const KURMANCI_TYPEABLE = new Set<string>([...KURMANCI_SPECIAL, ...KURMANCI_SPECIAL.map((c) => c.toUpperCase())]);

/** Whether a racer with a keyboard for this variety (and the key bar) can type the character. */
export function isTypeable(ch: string, dialect: TypingDialect): boolean {
  if (ASCII_PRINTABLE.test(ch)) return true;
  return dialect === 'sorani' ? SORANI_TYPEABLE.has(ch) : KURMANCI_TYPEABLE.has(ch);
}

export interface UntypeableChar {
  char: string;
  /** e.g. "U+00E9", so a character that looks like another can be told apart */
  codePoint: string;
  count: number;
}

/**
 * The characters of a text that nobody could type, after normalising — for the
 * admin screen's warning when a race text is saved (é in a Kurmancî text, a
 * Persian letter in a Soranî one). In order of first appearance.
 */
export function findUntypeable(text: string, dialect: TypingDialect): UntypeableChar[] {
  const found = new Map<string, UntypeableChar>();
  for (const ch of normalizeTyping(text, dialect)) {
    if (isTypeable(ch, dialect)) continue;
    const seen = found.get(ch);
    if (seen) seen.count++;
    else {
      const hex = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
      found.set(ch, { char: ch, codePoint: `U+${hex}`, count: 1 });
    }
  }
  return [...found.values()];
}

// ---------- the race's API ----------

/** 1 short, 2 medium, 3 long — the lengths an admin curates race texts at. */
export type RaceLength = 1 | 2 | 3;

/** `POST /race`: a race in a variety, at a length (any when left out), in an accent mode. */
export interface RaceStartRequest {
  length?: RaceLength;
  /** default Kurmancî */
  dialect?: TypingDialect;
  /** default `DEFAULT_ACCENT_MODE` */
  accentMode?: AccentMode;
}

/** What `POST /race` answers: the text to type, and the race it is for. */
export interface RaceGameView {
  id: string;
  text: {
    id: string;
    title: string;
    /** normalised (`normalizeTyping`); show `displayTarget(body, accentMode, dialect)` */
    body: string;
    difficulty: RaceLength;
    language: TypingLanguage;
  };
  dialect: TypingDialect;
  accentMode: AccentMode;
  startedAt: string;
}

/** What `POST /race/:id/finish` answers. */
export interface RaceResultView {
  /** characters of the text that count as typed (see `compareTyping`) */
  correctChars: number;
  /** correct characters over the text's length plus anything typed that the text does not have, 0..1 */
  accuracy: number;
  /** words per minute, on correct characters only */
  wpm: number;
  /** what the race is ranked on: speed weighted by accuracy (0 when implausible) */
  score: number;
  /** the whole text, exactly — no mistakes and no accent left out */
  perfect: boolean;
  /** faster than a person can type: reported, but worth nothing */
  implausible: boolean;
  accentMode: AccentMode;
  accentMisses: number;
  /** accented letters of the text that were reached, for "accents: 8 of 10" */
  accented: number;
  errors: number;
  elapsedMs: number;
  xpAwarded: number;
  /** a better score than any earlier race in the same accent mode (never the very first) */
  personalBest: boolean;
}

/** One finished race in `GET /race/best`. */
export interface RaceRun {
  title: string;
  wpm: number;
  accuracy: number;
  score: number;
  accentMode: AccentMode;
  dialect: TypingDialect;
  at: string;
}

/** `GET /race/best[?accentMode=&dialect=]`: best runs, and the best in each accent mode. */
export interface RaceBestView {
  races: RaceRun[];
  personalBests: Record<AccentMode, RaceRun | null>;
}

// ---------- setting up a Kurdish keyboard ----------

export const KEYBOARD_PLATFORMS = ['ios', 'android', 'windows', 'mac', 'linux'] as const;
export type KeyboardPlatform = (typeof KEYBOARD_PLATFORMS)[number];

/**
 * One step of a keyboard guide.
 *
 * `key` is the i18n key of the sentence; `en` is its English, the source for
 * every catalogue. Names on the device's own screens stay as the device shows
 * them, in English — a translated "Kurdish (Latin)" is a menu item nobody can
 * find — so they are not in the sentence but in `ui`, and the sentence says
 * where they go with {0}, {1}, …
 */
export interface KeyboardStep {
  key: string;
  en: string;
  ui?: readonly string[];
}

export interface KeyboardGuide {
  kurmanci: readonly KeyboardStep[];
  sorani: readonly KeyboardStep[];
}

/**
 * How to add a Kurdish keyboard, per platform — three or four steps, from
 * research3-keyboards-review §1b. What there is to add differs: Android has
 * Kurdish (Latin) in Gboard; iPhone has a Soranî keyboard and no Kurmancî one;
 * Windows has Central Kurdish and no Latin Kurdish, and Turkish Q has every
 * Kurmancî letter; a Mac's ABC – Extended types all five; Linux has a Kurdish
 * Latin Q layout.
 */
export const KEYBOARD_GUIDES: Record<KeyboardPlatform, KeyboardGuide> = {
  android: {
    kurmanci: [
      {
        key: 'keyboardGuide.android.open',
        en: 'Open any text box, then tap the ⚙ in {0}.',
        ui: ['Gboard'],
      },
      {
        key: 'keyboardGuide.android.add',
        en: 'Go to {0} → {1}.',
        ui: ['Languages', 'Add keyboard'],
      },
      {
        key: 'keyboardGuide.android.kurmanci',
        en: 'Search for "Kurdish", choose {0}, pick a layout and tap {1}.',
        ui: ['Kurdish (Latin)', 'Done'],
      },
      {
        key: 'keyboardGuide.android.switch',
        en: 'To switch keyboards, touch and hold the space bar. No Kurdish (Latin)? Add {0} instead: it has ç and ş, and holding e, i or u gives ê, î, û.',
        ui: ['Turkish'],
      },
    ],
    sorani: [
      {
        key: 'keyboardGuide.android.open',
        en: 'Open any text box, then tap the ⚙ in {0}.',
        ui: ['Gboard'],
      },
      {
        key: 'keyboardGuide.android.add',
        en: 'Go to {0} → {1}.',
        ui: ['Languages', 'Add keyboard'],
      },
      {
        key: 'keyboardGuide.android.sorani',
        en: 'Search for "Kurdish", choose {0}, pick a layout and tap {1}.',
        ui: ['Kurdish (Iraq) Arabic', 'Done'],
      },
      {
        key: 'keyboardGuide.android.switchSorani',
        en: 'To switch keyboards, touch and hold the space bar.',
      },
    ],
  },
  ios: {
    kurmanci: [
      {
        key: 'keyboardGuide.ios.noKurmanci',
        en: 'iPhone has no Kurmancî keyboard yet, but the English one gets you most of the way: touch and hold e, i, u or c to choose ê, î, û or ç.',
      },
      {
        key: 'keyboardGuide.ios.addTurkish',
        en: 'For ş, add the Turkish keyboard: {0} → {1} → {2} → {3} → {4} → {5}.',
        ui: ['Settings', 'General', 'Keyboard', 'Keyboards', 'Add New Keyboard', 'Turkish'],
      },
      {
        key: 'keyboardGuide.ios.switch',
        en: 'Tap the 🌐 key to switch between keyboards.',
      },
      {
        key: 'keyboardGuide.ios.keyBar',
        en: 'Or tap ç ê î ş û on the key bar above the text box — it works on every keyboard.',
      },
    ],
    sorani: [
      {
        key: 'keyboardGuide.ios.openKeyboards',
        en: 'Open {0} → {1} → {2} → {3}.',
        ui: ['Settings', 'General', 'Keyboard', 'Keyboards'],
      },
      {
        key: 'keyboardGuide.ios.addSorani',
        en: 'Tap {0} and choose {1}.',
        ui: ['Add New Keyboard', 'Kurdish, Sorani'],
      },
      {
        key: 'keyboardGuide.ios.switch',
        en: 'Tap the 🌐 key to switch between keyboards.',
      },
    ],
  },
  windows: {
    kurmanci: [
      {
        key: 'keyboardGuide.windows.open',
        en: 'Open {0} → {1} → {2}.',
        ui: ['Settings', 'Time & language', 'Language & region'],
      },
      {
        key: 'keyboardGuide.windows.languageOptions',
        en: 'Next to your language, choose {0} → {1}, then under {2} choose {3}.',
        ui: ['⋯', 'Language options', 'Keyboards', 'Add a keyboard'],
      },
      {
        key: 'keyboardGuide.windows.turkishQ',
        en: 'Windows has no Kurmancî keyboard, but {0} has every letter: ç and ş have their own keys, and ^ (Shift+3) then e, i or u types ê, î, û.',
        ui: ['Turkish Q'],
      },
      {
        key: 'keyboardGuide.windows.switch',
        en: 'Switch keyboards with Windows key + Space. On Turkish Q the i key types ı — Hevalo reads it as i.',
      },
    ],
    sorani: [
      {
        key: 'keyboardGuide.windows.open',
        en: 'Open {0} → {1} → {2}.',
        ui: ['Settings', 'Time & language', 'Language & region'],
      },
      {
        key: 'keyboardGuide.windows.addLanguage',
        en: 'Choose {0} and add {1}.',
        ui: ['Add a language', 'Central Kurdish'],
      },
      {
        key: 'keyboardGuide.windows.switchSorani',
        en: 'Switch keyboards with Windows key + Space.',
      },
    ],
  },
  mac: {
    kurmanci: [
      {
        key: 'keyboardGuide.mac.open',
        en: 'Open {0} → {1}, and under {2} choose {3} → {4}.',
        ui: ['System Settings', 'Keyboard', 'Text Input', 'Input Sources', 'Edit'],
      },
      {
        key: 'keyboardGuide.mac.kurmanci',
        en: 'Click {0} and add {1}.',
        ui: ['+', 'ABC – Extended'],
      },
      {
        key: 'keyboardGuide.mac.typeKurmanci',
        en: 'Then Option+6 followed by e, i or u types ê, î, û, and Option+c followed by c or s types ç or ş.',
      },
      {
        key: 'keyboardGuide.mac.switch',
        en: 'Switch keyboards with the 🌐 (fn) key or Control+Space.',
      },
    ],
    sorani: [
      {
        key: 'keyboardGuide.mac.open',
        en: 'Open {0} → {1}, and under {2} choose {3} → {4}.',
        ui: ['System Settings', 'Keyboard', 'Text Input', 'Input Sources', 'Edit'],
      },
      {
        key: 'keyboardGuide.mac.sorani',
        en: 'Click {0} and add {1}.',
        ui: ['+', 'Kurdish-Sorani'],
      },
      {
        key: 'keyboardGuide.mac.switch',
        en: 'Switch keyboards with the 🌐 (fn) key or Control+Space.',
      },
    ],
  },
  linux: {
    kurmanci: [
      {
        key: 'keyboardGuide.linux.open',
        en: 'Open {0} → {1} → {2} and click {3}.',
        ui: ['Settings', 'Keyboard', 'Input Sources', '+'],
      },
      {
        key: 'keyboardGuide.linux.kurmanci',
        en: 'Choose {0}, then {1}. (Or in a terminal: setxkbmap tr ku)',
        ui: ['Kurdish', 'Kurdish (Turkey, Latin Q)'],
      },
      {
        key: 'keyboardGuide.linux.switch',
        en: 'Switch keyboards with Super+Space.',
      },
    ],
    sorani: [
      {
        key: 'keyboardGuide.linux.open',
        en: 'Open {0} → {1} → {2} and click {3}.',
        ui: ['Settings', 'Keyboard', 'Input Sources', '+'],
      },
      {
        key: 'keyboardGuide.linux.sorani',
        en: 'Choose {0}, then {1}.',
        ui: ['Kurdish', 'Kurdish (Iraq, Arabic-Latin)'],
      },
      {
        key: 'keyboardGuide.linux.switch',
        en: 'Switch keyboards with Super+Space.',
      },
    ],
  },
};

/** A guide step's English with its screen names put in. */
export function keyboardStepText(step: KeyboardStep, sentence: string = step.en): string {
  return sentence.replace(/\{(\d+)\}/g, (whole, n: string) => step.ui?.[Number(n)] ?? whole);
}

/**
 * Which guide to show: from React Native's `Platform.OS` on a phone, else from
 * the browser's user agent. An iPad's Safari says it is a Mac, so a Mac with a
 * coarse (touch) pointer is an iPad. Null when it cannot tell (a Chromebook,
 * say) — the card then offers the list to choose from.
 */
export function detectKeyboardPlatform(
  userAgent: string,
  platformOS?: string,
  hints: { coarsePointer?: boolean } = {},
): KeyboardPlatform | null {
  switch (platformOS) {
    case 'ios':
      return 'ios';
    case 'android':
      return 'android';
    case 'windows':
      return 'windows';
    case 'macos':
      return 'mac';
  }
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/CrOS/.test(ua)) return null;
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return hints.coarsePointer ? 'ios' : 'mac';
  if (/Linux|X11/.test(ua)) return 'linux';
  return null;
}
