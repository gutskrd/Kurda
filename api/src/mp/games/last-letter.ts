import type pg from 'pg';
import { z } from 'zod';
import {
  LAST_LETTER_DEFAULT_TURN_SECONDS,
  LAST_LETTER_MAX_PLAYERS,
  LAST_LETTER_MIN_DICTIONARY_WORDS,
  LAST_LETTER_MIN_HEVALO_WORDS,
  LAST_LETTER_MIN_PLAYERS,
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
  return { found: fit.length > 0, meaning: fit.length > 0 ? meaningOf(fit) : null };
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
  return null;
}

/** Dictionary entries of a dialect, and curated ones, each counted only up to what the rule needs. */
export async function lastLetterCounts(db: Executor, dialect: LetterDialect): Promise<{ words: number; hevalo: number }> {
  const res = await db.query<{ words: number; hevalo: number }>(
    `SELECT (SELECT count(*) FROM (SELECT 1 FROM dict_entries WHERE dialect = $1 LIMIT $2) a)::int AS words,
            (SELECT count(*) FROM (SELECT 1 FROM dict_entries WHERE dialect = $1 AND in_games LIMIT $3) b)::int AS hevalo`,
    [dictionaryDialect(dialect), LAST_LETTER_MIN_DICTIONARY_WORDS, LAST_LETTER_MIN_HEVALO_WORDS],
  );
  return res.rows[0] ?? { words: 0, hevalo: 0 };
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
  xpSource: 'last_letter',

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
   * into the chain, at most LAST_LETTER_SOLO_XP_CAP a game, and nothing for a
   * word they were paid for in the last LAST_LETTER_SOLO_REPEAT_DAYS days — the
   * same word every evening is not learning. Each word is its own ledger row,
   * keyed by the person, the word and the day, so paying twice is impossible.
   */
  async payAgainstHevalo(db, game, state) {
    const words = [...new Set(state.chain.filter((w) => w.seat === game.seat).map((w) => w.word))];
    let paid = 0;
    for (const key of words) {
      if (paid + LAST_LETTER_SOLO_XP_PER_WORD > LAST_LETTER_SOLO_XP_CAP) break;
      const refs = soloWordRefs(game.userId, game.dialect, key, game.now);
      const before = await db.query(`SELECT 1 FROM xp_ledger WHERE source = 'last_letter_solo' AND ref_id = ANY($1::text[]) LIMIT 1`, [refs]);
      if (before.rowCount) continue;
      paid += await game.award({ userId: game.userId, source: 'last_letter_solo', amount: LAST_LETTER_SOLO_XP_PER_WORD, refId: refs[0]! });
    }
    return paid;
  },

  async availability(db, dialect) {
    const { words, hevalo } = await lastLetterCounts(db, dialect);
    const a = lastLetterAvailability(dialect, words, hevalo);
    return { group: a.group, solo: a.solo };
  },
};
