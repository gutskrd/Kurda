import type pg from 'pg';
import { z } from 'zod';
import {
  APP_LOCALE_CODES,
  BLUFF_DEFAULT_ROUNDS,
  BLUFF_DEFAULT_WRITE_SECONDS,
  BLUFF_FAKE_MAX,
  BLUFF_MAX_PLAYERS,
  BLUFF_MIN_PLAYERS,
  BLUFF_ROUNDS,
  BLUFF_WRITE_SECONDS,
  bluffOffer,
  bluffRules,
  checkGameContent,
  seededUnit,
  type AppLocale,
  type BluffBoard,
  type BluffCardContent,
  type BluffDealtCard,
  type BluffMove,
  type BluffOutcome,
  type BluffRounds,
  type BluffSettings,
  type BluffState,
  type BluffWriteSeconds,
  type LetterDialect,
} from '@kurda/shared';
import type { GameModule, LobbyChoices } from '../module.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * Kurdish Bluff on the server: what the pure rules
 * (shared/src/games/bluff/rules.ts) cannot do alone.
 *
 * - The deck. At the start, the words are dealt from `bluff_card` rows that
 *   are published, and so approved, in the game's dialect and that have a real
 *   meaning in the language the host chose — each checked again against its
 *   kind's schema and script, so a row stored before a rule tightened is left
 *   out. Drawn with the game's own seed, so the deal is the same on every
 *   replica; the cards live in the game's state, never in the lobby's settings
 *   or any view before their reveal.
 * - The fakes. A fake meaning is free text: the engine sends it through the
 *   chat's free-text gate (mute, velocity, spam, the wordlist and the
 *   classifier) before this module or anyone else sees it, capped at
 *   BLUFF_FAKE_MAX characters, and keeps it with the move for a report. A vote
 *   carries no text and passes no gate.
 * - Where it is offered: a dialect with BLUFF_MIN_CARDS approved cards, and a
 *   language with BLUFF_MIN_LANGUAGE_CARDS of them (`bluffOffer`); the
 *   availability answer lists the languages, so a host is only ever offered a
 *   language the cards can be played in.
 */

const rounds = z.custom<BluffRounds>((v) => (BLUFF_ROUNDS as readonly unknown[]).includes(v), { message: `one of ${BLUFF_ROUNDS.join(', ')}` });
const writeSeconds = z.custom<BluffWriteSeconds>((v) => (BLUFF_WRITE_SECONDS as readonly unknown[]).includes(v), {
  message: `one of ${BLUFF_WRITE_SECONDS.join(', ')}`,
});

const lobbySchema = z
  .object({
    dialect: z.enum(['kmr', 'ckb']).default('kmr'),
    language: z.enum(APP_LOCALE_CODES).default('en'),
    rounds: rounds.default(BLUFF_DEFAULT_ROUNDS),
    writeSeconds: writeSeconds.default(BLUFF_DEFAULT_WRITE_SECONDS),
    maxPlayers: z.number().int().min(BLUFF_MIN_PLAYERS).max(BLUFF_MAX_PLAYERS).default(BLUFF_MAX_PLAYERS),
    access: z.enum(['friends', 'open']).default('friends'),
    rated: z.boolean().optional(),
  })
  .transform(
    (s): LobbyChoices<BluffSettings> => ({
      settings: { dialect: s.dialect, language: s.language, rounds: s.rounds, writeSeconds: s.writeSeconds },
      dialect: s.dialect,
      maxPlayers: s.maxPlayers,
      access: s.access,
      rated: s.rated,
    }),
  );

const moveSchema = z.discriminatedUnion('kind', [
  // the gate caps the text itself, with its own answer; this only keeps a body from being absurd
  z.object({ kind: z.literal('write'), text: z.string().min(1).max(BLUFF_FAKE_MAX * 4) }),
  z.object({ kind: z.literal('vote'), option: z.string().min(1).max(4) }),
]);
type RawMove = z.infer<typeof moveSchema>;

interface CardRow {
  id: string;
  payload: unknown;
}

const CARDS = `FROM game_content WHERE kind = 'bluff_card' AND dialect = $1 AND status = 'published' AND review_status = 'approved'`;

/** A card as the game plays it in one language, or null when it has no real meaning in that language. */
export function dealtCard(id: string, card: BluffCardContent, language: AppLocale): BluffDealtCard | null {
  const real = (card.definitions as Partial<Record<AppLocale, string>>)[language]?.trim();
  if (!real) return null;
  const example = card.example
    ? {
        ku: card.example.ku,
        meaning: (card.example.meanings as Partial<Record<AppLocale, string>> | undefined)?.[language]?.trim() || card.example.meanings?.en?.trim() || null,
      }
    : null;
  return { id, word: card.word, real, example };
}

/** The cards a game in this dialect and language can be dealt, each checked again; in a fixed order, for the seed to shuffle. */
export async function bluffCards(db: Executor, dialect: LetterDialect, language: AppLocale): Promise<BluffDealtCard[]> {
  const res = await db.query<CardRow>(`SELECT id, payload ${CARDS} AND payload->'definitions' ? $2 ORDER BY id`, [dialect, language]);
  const out: BluffDealtCard[] = [];
  for (const row of res.rows) {
    const checked = checkGameContent('bluff_card', dialect, row.payload);
    if (!checked.ok) continue;
    const card = dealtCard(row.id, checked.payload, language);
    if (card) out.push(card);
  }
  return out;
}

/** Approved cards of a dialect, and how many have a real meaning in each language. */
export async function bluffCounts(db: Executor, dialect: LetterDialect): Promise<{ total: number; byLanguage: Record<string, number> }> {
  const res = await db.query<{ total: number; langs: Record<string, number> | null }>(
    `SELECT (SELECT count(*) ${CARDS})::int AS total,
            (SELECT json_object_agg(lang, n) FROM (
               SELECT l.lang, count(*)::int AS n
                 FROM game_content g
                 CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(g.payload->'definitions') = 'object' THEN g.payload->'definitions' ELSE '{}'::jsonb END) AS l(lang)
                WHERE g.kind = 'bluff_card' AND g.dialect = $1 AND g.status = 'published' AND g.review_status = 'approved'
                GROUP BY l.lang
             ) x) AS langs`,
    [dialect],
  );
  const row = res.rows[0];
  return { total: row?.total ?? 0, byLanguage: row?.langs ?? {} };
}

export const bluffModule: GameModule<BluffState, BluffMove, BluffSettings, BluffBoard, BluffOutcome, RawMove> = {
  game: 'bluff',
  rules: bluffRules,
  lobbySchema,
  moveSchema,
  minPlayers: BLUFF_MIN_PLAYERS,
  maxPlayers: BLUFF_MAX_PLAYERS,
  teams: 0,
  freeText: { maxLength: BLUFF_FAKE_MAX, textOf: (raw) => (raw.kind === 'write' ? raw.text : null) },
  xpSource: 'game_bluff_place',

  summary(dialect) {
    return { dialect: dialect === 'kmr' ? 'kurmanci' : 'sorani' };
  },

  publicSettings(settings) {
    return { dialect: settings.dialect, language: settings.language, rounds: settings.rounds, writeSeconds: settings.writeSeconds };
  },

  async deal(db, lobby) {
    const cards = await bluffCards(db, lobby.dialect, lobby.settings.language);
    const deck = cards
      .map((c) => ({ c, k: seededUnit(lobby.seed, `deck:${c.id}`) }))
      .sort((a, b) => a.k - b.k)
      .slice(0, lobby.settings.rounds)
      .map((x) => x.c);
    return { ...lobby.settings, deck };
  },

  async prepare(_db, _state, _seat, { raw, text }) {
    if (raw.kind === 'vote') return { move: { kind: 'vote', option: raw.option }, text: null };
    // the gated text: tidied, capped and checked by the chat pipeline
    const fake = text ?? raw.text.trim().slice(0, BLUFF_FAKE_MAX);
    return { move: { kind: 'write', text: fake }, text: fake };
  },

  async availability(db, dialect) {
    const { total, byLanguage } = await bluffCounts(db, dialect);
    const offer = bluffOffer(total, byLanguage);
    return { group: offer.group, solo: false, languages: offer.languages };
  },
};
