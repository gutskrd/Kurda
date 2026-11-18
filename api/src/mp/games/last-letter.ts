import type pg from 'pg';
import { z } from 'zod';
import {
  LAST_LETTER_DEFAULT_TURN_SECONDS,
  LAST_LETTER_MAX_PLAYERS,
  LAST_LETTER_MIN_DICTIONARY_WORDS,
  LAST_LETTER_MIN_HEVALO_WORDS,
  LAST_LETTER_MIN_PLAYERS,
  LAST_LETTER_TURN_SECONDS,
  beginsWith,
  dictionaryDialect,
  dictionaryKey,
  hevaloMisses,
  lastLetterAvailability,
  lastLetterRules,
  lookupSpellings,
  requiredLetter,
  startSpellings,
  wordKey,
  wordLetters,
  type LastLetterBoard,
  type LastLetterMeanings,
  type LastLetterMove,
  type LastLetterOutcome,
  type LastLetterSettings,
  type LastLetterState,
  type LastLetterTurnSeconds,
  type LetterDialect,
} from '@kurda/shared';
import { filterText } from '../../moderation/filter.js';
import type { GameModule, LobbyChoices } from '../module.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * Last Letter's server side: what the pure rules (shared/src/games/last-letter/rules.ts) cannot decide alone.
 *
 * A player's word is checked against the game dialect's dictionary inside the game's transaction. It counts when:
 * - the entry exists in that dialect, compared in the dialect's own letters (`wordKey`: ê is not e, ھ written as ه is
 *   still ھ), found through the folded key the dictionary is indexed by;
 * - it is not a proper noun: a capitalised Kurmancî headword is a name (the dictionary tags names as nouns), so only
 *   lower-case entries count;
 * - at least one sense is a part of speech a chain takes (noun, verb, adjective, adverb, pronoun, numeral), or it is an
 *   admin-curated game word with no senses yet;
 * - it is not on the profanity list, which also records an offense as chat does.
 *
 * The meaning shown is the short English gloss of an entry curated for the games (`in_games`), never an unreviewed
 * gloss or a Kurdish definition, or the meanings a lesson gives a word it teaches, each short enough for a card.
 *
 * A missing word that differs from exactly one known word only by its marks (kecik for keçik) is not judged: the move
 * names the likely word (`verdict: 'spelling'`) and the rules ask the player, who keeps the turn. With two or more such
 * words it is struck like any unknown word.
 *
 * Hevalo plays only curated words of the game's dialect at random among those that fit, and sometimes fails to find one
 * (more often as the chain grows), so it can be beaten.
 *
 * Words the course teaches count too (`courseWords`): every published word card may be played with its lesson meaning,
 * whether or not the dictionary has it, and Hevalo may play one when no curated word fits. They count toward both of
 * the game's minimums.
 */

/** The parts of speech a word in a chain may be. */
export const CHAIN_PARTS_OF_SPEECH: ReadonlySet<string> = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral']);
/** A gloss longer than this explains rather than translates, and does not fit on a card. */
const MEANING_MAX = 40;
/** Hevalo's words: between these many letters, so its turn reads as a word, not a puzzle. */
const HEVALO_LETTERS = [3, 9] as const;
/** The longest a typed word is kept with its move. */
const KEEP_TYPED = 64;

/** A word the course teaches: its English meaning, and every language its lesson gives it in. */
export interface TaughtWord {
  meaning: string | null;
  meanings: LastLetterMeanings | null;
}

/** What the dictionary and the course say of a word a player typed. */
export interface CheckedWord {
  found: boolean;
  meaning: string | null;
  meanings: LastLetterMeanings | null;
  /** when not found: the one known word it differs from only by its marks */
  spelling: string | null;
}

const turnSeconds = z.custom<LastLetterTurnSeconds>((v) => (LAST_LETTER_TURN_SECONDS as readonly unknown[]).includes(v), {
  message: `one of ${LAST_LETTER_TURN_SECONDS.join(', ')}`,
});

const lobbySchema = z
  .object({
    dialect: z.enum(['kmr', 'ckb']).default('kmr'),
    turnSeconds: turnSeconds.default(LAST_LETTER_DEFAULT_TURN_SECONDS),
    maxPlayers: z.number().int().min(LAST_LETTER_MIN_PLAYERS).max(LAST_LETTER_MAX_PLAYERS).default(LAST_LETTER_MAX_PLAYERS),
    access: z.enum(['friends', 'open']).default('friends'),
    rated: z.boolean().optional(),
  })
  .transform(
    (s): LobbyChoices<LastLetterSettings> => ({
      settings: { dialect: s.dialect, turnSeconds: s.turnSeconds },
      dialect: s.dialect,
      maxPlayers: s.maxPlayers,
      access: s.access,
      rated: s.rated,
    }),
  );

const moveSchema = z.object({ word: z.string().min(1).max(200) });
type RawWord = z.infer<typeof moveSchema>;

interface EntryRow {
  headword: string;
  in_games: boolean;
  senses: Array<{ pos: string; en: string | null }> | null;
}

/** A Kurmancî headword written with a capital is a name. Soranî has no capitals to tell by. */
function isProperNoun(dialect: LetterDialect, headword: string): boolean {
  return dialect === 'kmr' && /^\p{Lu}/u.test(headword.normalize('NFC').trim());
}

function usable(dialect: LetterDialect, key: string, e: EntryRow): boolean {
  if (wordKey(dialect, e.headword) !== key || isProperNoun(dialect, e.headword)) return false;
  const senses = e.senses ?? [];
  return senses.length === 0 ? e.in_games : senses.some((s) => CHAIN_PARTS_OF_SPEECH.has(s.pos));
}

function meaningOf(entries: readonly EntryRow[]): string | null {
  for (const e of entries) {
    if (!e.in_games) continue;
    const gloss = (e.senses ?? []).map((s) => s.en?.trim() ?? '').find((en) => en.length > 0 && en.length <= MEANING_MAX);
    if (gloss) return gloss;
  }
  return null;
}

const ENTRY_COLUMNS = `e.headword, e.in_games,
  (SELECT json_agg(json_build_object('pos', s.pos, 'en', s.definition_en) ORDER BY s.position)
     FROM dict_senses s WHERE s.entry_id = e.id) AS senses`;

/**
 * Whether `key` (in the dialect's letters) is a word a chain takes, and the meaning to show. One indexed lookup
 * (`headword_folded`) over the spellings the dictionary may hold it under, then each candidate is compared in the
 * dialect's letters. The same rows hold the words differing only by marks, so the `spelling` check costs nothing extra.
 */
export async function checkWord(db: Executor, dialect: LetterDialect, key: string): Promise<CheckedWord> {
  const keys = [...new Set(lookupSpellings(dialect, key).map((s) => dictionaryKey(s)))];
  const res = await db.query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM dict_entries e WHERE e.headword_folded = ANY($1::text[]) AND e.dialect = $2 LIMIT 40`,
    [keys, dictionaryDialect(dialect)],
  );
  const taught = await courseWords(db, dialect);
  const fit = res.rows.filter((e) => usable(dialect, key, e));
  if (fit.length > 0) {
    const meaning = meaningOf(fit);
    // a word the dictionary has but nobody glossed for the games still shows the meanings its lesson gives it
    const lesson = taught.get(key);
    if (meaning) return { found: true, meaning, meanings: { ...(lesson?.meanings ?? {}), en: meaning }, spelling: null };
    return { found: true, meaning: lesson?.meaning ?? null, meanings: lesson?.meanings ?? null, spelling: null };
  }
  const lesson = taught.get(key);
  if (lesson) return { found: true, meaning: lesson.meaning, meanings: lesson.meanings, spelling: null };
  // not a word: is it one word with a mark left off?
  const folded = new Set(keys);
  const near = new Set<string>();
  for (const e of res.rows) {
    const other = wordKey(dialect, e.headword);
    if (other && other !== key && usable(dialect, other, e)) near.add(other);
  }
  for (const other of taught.keys()) if (other !== key && folded.has(dictionaryKey(other))) near.add(other);
  const only = near.size === 1 ? [...near][0]! : null;
  return { found: false, meaning: null, meanings: null, spelling: only && !filterText(only).flagged ? only : null };
}

/**
 * The words the course teaches, from its published word cards: each by its letters in the dialect, with its lesson's
 * short English meaning. Names, filtered words and anything that is not one word are left out. Cached per variety for a
 * minute, since a variety has a thousand or more cards and each goes through the word filter; a card published or
 * withdrawn shows within that minute.
 */
const COURSE_WORDS_MS = 60_000;
const courseWordsKept = new Map<LetterDialect, { at: number; words: Promise<Map<string, TaughtWord>> }>();

/** Drop the cache so the next ask reads the cards again (tests publish a card and play it at once). */
export function forgetCourseWords(): void {
  courseWordsKept.clear();
}

export function courseWords(db: Executor, dialect: LetterDialect, now: number = Date.now()): Promise<Map<string, TaughtWord>> {
  const kept = courseWordsKept.get(dialect);
  if (kept && now - kept.at < COURSE_WORDS_MS) return kept.words;
  const words = readCourseWords(db, dialect);
  courseWordsKept.set(dialect, { at: now, words });
  // a read that failed is not kept: the next move tries again
  words.catch(() => {
    if (courseWordsKept.get(dialect)?.words === words) courseWordsKept.delete(dialect);
  });
  return words;
}

async function readCourseWords(db: Executor, dialect: LetterDialect): Promise<Map<string, TaughtWord>> {
  const res = await db.query<{ word: string; meanings: Record<string, unknown> | null }>(
    `SELECT payload->>'word' AS word, payload->'meanings' AS meanings FROM game_content
      WHERE kind = 'word_card' AND dialect = $1 AND status = 'published' AND review_status = 'approved'`,
    [dialect],
  );
  const out = new Map<string, TaughtWord>();
  for (const row of res.rows) {
    const key = typeof row.word === 'string' ? wordKey(dialect, row.word) : null;
    if (!key || isProperNoun(dialect, row.word) || filterText(key).flagged || out.has(key)) continue;
    // each language's meaning that fits on a card; one that explains rather than translates is left out
    const meanings: LastLetterMeanings = {};
    for (const [lang, text] of Object.entries(row.meanings ?? {})) {
      const t = typeof text === 'string' ? text.trim() : '';
      if (t.length > 0 && t.length <= MEANING_MAX) meanings[lang] = t;
    }
    out.set(key, { meaning: meanings.en ?? null, meanings: Object.keys(meanings).length > 0 ? meanings : null });
  }
  return out;
}

/** Hevalo's word for the turn, or null when it cannot think of one. */
export async function hevaloWord(db: Executor, state: LastLetterState): Promise<LastLetterMove | null> {
  const n = state.turn?.n ?? 0;
  if (hevaloMisses(state.seed, n, state.chain.length)) return null;
  const dialect = state.dialect;
  const required = requiredLetter(state);
  const prefixes = required ? startSpellings(dialect, required).map((s) => `${dictionaryKey(s)}%`) : ['%'];
  const res = await db.query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM dict_entries e
      WHERE e.in_games AND e.dialect = $1 AND e.headword_folded LIKE ANY($2::text[])
        AND e.letter_count BETWEEN $3 AND $4
      ORDER BY random() LIMIT 80`,
    [dictionaryDialect(dialect), prefixes, HEVALO_LETTERS[0], HEVALO_LETTERS[1]],
  );
  const used = new Set(state.chain.map((w) => w.word));
  for (const e of res.rows) {
    const key = wordKey(dialect, e.headword);
    if (!key || used.has(key) || isProperNoun(dialect, e.headword)) continue;
    if (required && !beginsWith(dialect, key, required)) continue;
    if (!usable(dialect, key, e) || filterText(key).flagged) continue;
    const meaning = meaningOf([e]);
    return { key, verdict: 'ok', meaning, meanings: meaning ? { en: meaning } : null };
  }
  // no curated word fits: one the course teaches, of the same size, chosen at random among those that fit
  const taught = [...(await courseWords(db, dialect))].filter(([key]) => {
    const letters = wordLetters(dialect, key)?.length ?? 0;
    return letters >= HEVALO_LETTERS[0] && letters <= HEVALO_LETTERS[1] && !used.has(key) && (!required || beginsWith(dialect, key, required));
  });
  const pick = taught[Math.floor(Math.random() * taught.length)];
  return pick ? { key: pick[0], verdict: 'ok', meaning: pick[1].meaning, meanings: pick[1].meanings } : null;
}

/**
 * The counts behind the game's minimums: dictionary entries of a dialect for checking, curated ones for Hevalo, each
 * plus the course's published word cards. Every count stops at what the rule needs.
 */
export async function lastLetterCounts(db: Executor, dialect: LetterDialect): Promise<{ words: number; hevalo: number }> {
  const res = await db.query<{ words: number; hevalo: number; taught: number }>(
    `SELECT (SELECT count(*) FROM (SELECT 1 FROM dict_entries WHERE dialect = $1 LIMIT $2) a)::int AS words,
            (SELECT count(*) FROM (SELECT 1 FROM dict_entries WHERE dialect = $1 AND in_games LIMIT $3) b)::int AS hevalo,
            (SELECT count(*) FROM (SELECT 1 FROM game_content
                                    WHERE kind = 'word_card' AND dialect = $4 AND status = 'published' AND review_status = 'approved'
                                    LIMIT $2) c)::int AS taught`,
    [dictionaryDialect(dialect), LAST_LETTER_MIN_DICTIONARY_WORDS, LAST_LETTER_MIN_HEVALO_WORDS, dialect],
  );
  const row = res.rows[0] ?? { words: 0, hevalo: 0, taught: 0 };
  return { words: row.words + row.taught, hevalo: row.hevalo + row.taught };
}

export const lastLetterModule: GameModule<LastLetterState, LastLetterMove, LastLetterSettings, LastLetterBoard, LastLetterOutcome, RawWord> = {
  game: 'last-letter',
  rules: lastLetterRules,
  lobbySchema,
  moveSchema,
  minPlayers: LAST_LETTER_MIN_PLAYERS,
  maxPlayers: LAST_LETTER_MAX_PLAYERS,
  teams: 0,
  solo: { bot: 'hevalo' },
  xpSource: 'game_last_letter',

  summary(dialect) {
    return { dialect: dialect === 'kmr' ? 'kurmanci' : 'sorani' };
  },

  publicSettings(settings) {
    return { dialect: settings.dialect, turnSeconds: settings.turnSeconds };
  },

  async prepare(db, state, _seat, { raw }) {
    const typed = raw.word.trim().slice(0, KEEP_TYPED);
    const key = wordKey(state.dialect, raw.word);
    if (key === null) return { move: { key: null, verdict: 'not-a-word', meaning: null }, text: typed };
    if (filterText(key).flagged) return { move: { key, verdict: 'not-allowed', meaning: null }, text: typed, offense: true };
    // The rules strike a wrong letter or a repeat without a lookup, except a wrong letter that is the right one missing
    // its mark (cay when ç is asked for), which may be a spelling slip.
    const required = requiredLetter(state);
    const wrongLetter = required !== null && !beginsWith(state.dialect, key, required);
    const slipOfMark = wrongLetter && dictionaryKey(Array.from(key)[0] ?? '') === dictionaryKey(required!);
    if ((wrongLetter && !slipOfMark) || state.chain.some((w) => w.word === key)) {
      return { move: { key, verdict: 'ok', meaning: null }, text: typed };
    }
    const checked = await checkWord(db, state.dialect, key);
    if (!checked.found && checked.spelling) {
      return { move: { key, verdict: 'spelling', meaning: null, suggestion: checked.spelling }, text: typed };
    }
    if (wrongLetter) return { move: { key, verdict: 'ok', meaning: null }, text: typed };
    return { move: { key, verdict: checked.found ? 'ok' : 'not-a-word', meaning: checked.meaning, meanings: checked.meanings }, text: typed };
  },

  bot(db, state) {
    return hevaloWord(db, state);
  },

  async availability(db, dialect) {
    const { words, hevalo } = await lastLetterCounts(db, dialect);
    const a = lastLetterAvailability(dialect, words, hevalo);
    return { group: a.group, solo: a.solo };
  },
};
