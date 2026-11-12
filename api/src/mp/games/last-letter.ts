import type pg from 'pg';
import { z } from 'zod';
import {
  LAST_LETTER_DEFAULT_TURN_SECONDS,
  LAST_LETTER_MAX_PLAYERS,
  LAST_LETTER_MIN_DICTIONARY_WORDS,
  LAST_LETTER_MIN_HEVALO_WORDS,
  LAST_LETTER_MIN_PLAYERS,
  LAST_LETTER_SOLO_DAILY_XP_CAP,
  LAST_LETTER_SOLO_REPEAT_DAYS,
  LAST_LETTER_SOLO_XP_CAP,
  LAST_LETTER_SOLO_XP_PER_WORD,
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
 * The Last Letter on the server: what the pure rules
 * (shared/src/games/last-letter/rules.ts) cannot decide alone.
 *
 * A player's word is checked against the dictionary of the game's dialect,
 * inside the game's transaction, so what was played and what was judged are
 * the same moment:
 * - the entry exists in that dialect, compared letter for letter in the
 *   dialect's own letters (`wordKey`: ê is not e, ھ written as ه is still ھ),
 *   found through the folded key the dictionary is indexed by;
 * - it is not a proper noun: a Kurmancî headword written with a capital is a
 *   name (the dictionary gives names the part of speech of a noun), so only an
 *   entry spelt in lower case counts;
 * - at least one of its senses is a part of speech a chain takes (a noun, a
 *   verb, an adjective, an adverb, a pronoun, a number). An admin's curated
 *   game word with no senses yet counts too: an admin chose it as a word;
 * - it is not on the profanity list, which also counts an offense, as a chat
 *   message does.
 *
 * The meaning shown beside a word is the short English gloss of an entry an
 * admin curated for the games (`in_games`) — never a gloss nobody reviewed,
 * and never one of the dictionary's Kurdish definitions, which nobody has.
 *
 * Hevalo plays only curated words of the game's dialect, chosen at random among
 * those that fit, and now and then cannot think of one (more often as the chain
 * grows), so a game against Hevalo can be won.
 *
 * The words the course teaches count as well (`courseWords`): every published
 * word card is a word a lesson pairs with its meaning, so a player may play
 * it whether or not the dictionary has it yet, with the lesson's meaning
 * beside it, and Hevalo may play it when it has no curated word that fits.
 * They are counted with the dictionary's for both of the game's minimums.
 */

/** The parts of speech a word in a chain may be. */
export const CHAIN_PARTS_OF_SPEECH: ReadonlySet<string> = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral']);
/** A gloss longer than this explains rather than translates, and does not fit on a card. */
const MEANING_MAX = 40;
/** Hevalo's words: between these many letters, so its turn reads as a word, not a puzzle. */
const HEVALO_LETTERS = [3, 9] as const;
/** The longest a typed word is kept with its move. */
const KEEP_TYPED = 64;

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
 * Whether `key` (a word in the dialect's letters) is a word a chain takes, and
 * the meaning to show with it. One indexed lookup (`headword_folded`) over the
 * spellings the dictionary may hold it under; every candidate is then compared
 * in the dialect's own letters.
 */
export async function checkWord(db: Executor, dialect: LetterDialect, key: string): Promise<{ found: boolean; meaning: string | null }> {
  const keys = [...new Set(lookupSpellings(dialect, key).map((s) => dictionaryKey(s)))];
  const res = await db.query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM dict_entries e WHERE e.headword_folded = ANY($1::text[]) AND e.dialect = $2 LIMIT 40`,
    [keys, dictionaryDialect(dialect)],
  );
  const fit = res.rows.filter((e) => usable(dialect, key, e));
  if (fit.length > 0) {
    const meaning = meaningOf(fit);
    // a word the dictionary has but nobody glossed for the games still shows the meaning its lesson gives it
    return { found: true, meaning: meaning ?? (await courseWords(db, dialect)).get(key) ?? null };
  }
  const taught = await courseWords(db, dialect);
  return taught.has(key) ? { found: true, meaning: taught.get(key) ?? null } : { found: false, meaning: null };
}

/**
 * The words the course teaches, as its published word cards hold them: each
 * by its letters in the dialect, with the short English meaning its lesson
 * gives it. A name, a word the filter refuses and anything that is not one
 * word of the dialect are left out. Kept for a minute per variety: a move
 * may ask twice, a variety holds a thousand cards and more, and each is read
 * through the word filter, which is too much to do again on every word
 * somebody types. A card published or taken down shows within that minute.
 */
const COURSE_WORDS_MS = 60_000;
const courseWordsKept = new Map<LetterDialect, { at: number; words: Promise<Map<string, string | null>> }>();

/** Read the cards again on the next ask (for the tests, which publish a card and play it at once). */
export function forgetCourseWords(): void {
  courseWordsKept.clear();
}

export function courseWords(db: Executor, dialect: LetterDialect, now: number = Date.now()): Promise<Map<string, string | null>> {
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

async function readCourseWords(db: Executor, dialect: LetterDialect): Promise<Map<string, string | null>> {
  const res = await db.query<{ word: string; en: string | null }>(
    `SELECT payload->>'word' AS word, payload->'meanings'->>'en' AS en FROM game_content
      WHERE kind = 'word_card' AND dialect = $1 AND status = 'published' AND review_status = 'approved'`,
    [dialect],
  );
  const out = new Map<string, string | null>();
  for (const row of res.rows) {
    const key = typeof row.word === 'string' ? wordKey(dialect, row.word) : null;
    if (!key || isProperNoun(dialect, row.word) || filterText(key).flagged || out.has(key)) continue;
    const en = row.en?.trim() ?? '';
    out.set(key, en.length > 0 && en.length <= MEANING_MAX ? en : null);
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
    return { key, verdict: 'ok', meaning: meaningOf([e]) };
  }
  // no curated word fits: one the course teaches, of the same size, chosen at random among those that fit
  const taught = [...(await courseWords(db, dialect))].filter(([key]) => {
    const letters = wordLetters(dialect, key)?.length ?? 0;
    return letters >= HEVALO_LETTERS[0] && letters <= HEVALO_LETTERS[1] && !used.has(key) && (!required || beginsWith(dialect, key, required));
  });
  const pick = taught[Math.floor(Math.random() * taught.length)];
  return pick ? { key: pick[0], verdict: 'ok', meaning: pick[1] } : null;
}

/**
 * The words a chain can be checked against and the words Hevalo can play:
 * the dictionary's entries of a dialect and its curated ones, each with the
 * words the course teaches (published word cards) beside them. Every count
 * stops at what the rule needs.
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

/** The refs of a word paid for on each of the last LAST_LETTER_SOLO_REPEAT_DAYS days (UTC), today first. */
export function soloWordRefs(userId: string, dialect: LetterDialect, key: string, now: Date): string[] {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: LAST_LETTER_SOLO_REPEAT_DAYS }, (_, i) => {
    const d = new Date(day - i * 86_400_000).toISOString().slice(0, 10);
    return `last-letter:${userId}:${dialect}:${key}:${d}`;
  });
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
    // the rules strike a wrong letter or a repeat whatever the dictionary says: no lookup for those
    const required = requiredLetter(state);
    if ((required !== null && !beginsWith(state.dialect, key, required)) || state.chain.some((w) => w.word === key)) {
      return { move: { key, verdict: 'ok', meaning: null }, text: typed };
    }
    const { found, meaning } = await checkWord(db, state.dialect, key);
    return { move: { key, verdict: found ? 'ok' : 'not-a-word', meaning }, text: typed };
  },

  bot(db, state) {
    return hevaloWord(db, state);
  },

  /**
   * Against Hevalo: LAST_LETTER_SOLO_XP_PER_WORD for each word the person got
   * into the chain, at most LAST_LETTER_SOLO_XP_CAP a game and
   * LAST_LETTER_SOLO_DAILY_XP_CAP a day (UTC) over every game against Hevalo,
   * and nothing for a word they were paid for in the last
   * LAST_LETTER_SOLO_REPEAT_DAYS days — the same word every evening is not
   * learning. Each word is its own ledger row, keyed by the person, the word
   * and the day, so paying twice is impossible. The day's cap is what makes the
   * game's cap mean anything: starting the next game ends this one and pays
   * it, so games can follow each other as fast as words can be typed. The
   * person's row is locked first (as every award locks it), so two games
   * finishing at once count the day one after the other.
   */
  async payAgainstHevalo(db, game, state) {
    const words = [...new Set(state.chain.filter((w) => w.seat === game.seat).map((w) => w.word))];
    if (words.length === 0) return 0;
    await db.query(`SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, [game.userId]);
    const today = await db.query<{ xp: number }>(
      `SELECT COALESCE(SUM(amount), 0)::int AS xp FROM xp_ledger
        WHERE user_id = $1 AND source = 'game_last_letter_solo' AND amount > 0
          AND created_at >= date_trunc('day', $2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [game.userId, game.now],
    );
    const cap = Math.min(LAST_LETTER_SOLO_XP_CAP, Math.max(0, LAST_LETTER_SOLO_DAILY_XP_CAP - (today.rows[0]?.xp ?? 0)));
    let paid = 0;
    for (const key of words) {
      if (paid + LAST_LETTER_SOLO_XP_PER_WORD > cap) break;
      const refs = soloWordRefs(game.userId, game.dialect, key, game.now);
      const before = await db.query(`SELECT 1 FROM xp_ledger WHERE source = 'game_last_letter_solo' AND ref_id = ANY($1::text[]) LIMIT 1`, [refs]);
      if (before.rowCount) continue;
      paid += await game.award({ userId: game.userId, source: 'game_last_letter_solo', amount: LAST_LETTER_SOLO_XP_PER_WORD, refId: refs[0]! });
    }
    return paid;
  },

  async availability(db, dialect) {
    const { words, hevalo } = await lastLetterCounts(db, dialect);
    const a = lastLetterAvailability(dialect, words, hevalo);
    return { group: a.group, solo: a.solo };
  },
};
