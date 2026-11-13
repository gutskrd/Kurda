import type pg from 'pg';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  GAME_DIFFICULTIES,
  GAME_SLUG_PATTERN,
  IMPOSTOR_CLUE_LIMITS,
  IMPOSTOR_CLUE_SECONDS,
  IMPOSTOR_DEFAULT_CLUE_SECONDS,
  IMPOSTOR_GUESS_OPTIONS,
  IMPOSTOR_MAX_PLAYERS,
  IMPOSTOR_MIN_PLAYERS,
  availableDifficulties,
  foldForDialect,
  impostorRules,
  learnGame,
  seededOrder,
  seededUnit,
  type GameContentKind,
  type GameDialect,
  type GameDifficulty,
  type GameLevel,
  type ImpostorBoard,
  type ImpostorClueSeconds,
  type ImpostorDeal,
  type ImpostorMove,
  type ImpostorOutcome,
  type ImpostorSettings,
  type ImpostorState,
  type WordCardContent,
} from '@kurda/shared';
import { AppError } from '../../plugins/errors.js';
import { TrustedSources, type PublishedContent } from '../../games/sources.js';
import type { GameModule, LobbyChoices } from '../module.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * Impostor on the server: what the pure rules
 * (shared/src/games/impostor/rules.ts) cannot decide alone.
 *
 * - The deal. When the host starts, one word card is drawn from the approved
 *   word cards of the lobby's variety and difficulty — published rows only,
 *   read through the trusted readers, so a draft or a card waiting for review
 *   never reaches a table — with three other approved words for the caught
 *   impostor's guess, of the same category where it has enough. The deal goes
 *   to the rules alone: it is in the game's state, never in the lobby's stored
 *   settings, never in a link, and leaves only through the rules' per-seat
 *   view.
 * - The clue. Every clue has passed the chat pipeline's gate (the engine runs
 *   it before the game's lock); the rules then refuse one that is not in the
 *   variety's script, too long, or says the word or one of its forms.
 * - Whether it is offered. A variety is offered at a difficulty once its
 *   approved word cards there reach the registry's minimum (`minimum`), the
 *   same count Learn's list makes (api/src/games/availability.ts).
 * - The category. A host may ask for the word to come from one category; the
 *   lobby is made only if that category has enough approved cards at the
 *   lobby's difficulty for a word and the guess's other options, and the deal
 *   then draws the word from it.
 */

const MINIMUM = learnGame('impostor').minimum;

const clueSeconds = z.custom<ImpostorClueSeconds>((v) => (IMPOSTOR_CLUE_SECONDS as readonly unknown[]).includes(v), {
  message: `one of ${IMPOSTOR_CLUE_SECONDS.join(', ')}`,
});

// an object read field by field: anything else sent (a deal, say) is dropped
const lobbySchema = z
  .object({
    dialect: z.enum(['kmr', 'ckb']).default('kmr'),
    difficulty: z.enum(GAME_DIFFICULTIES).default('beginner'),
    clueSeconds: clueSeconds.default(IMPOSTOR_DEFAULT_CLUE_SECONDS),
    category: z.string().regex(GAME_SLUG_PATTERN).nullish(),
    maxPlayers: z.number().int().min(IMPOSTOR_MIN_PLAYERS).max(IMPOSTOR_MAX_PLAYERS).default(IMPOSTOR_MAX_PLAYERS),
    access: z.enum(['friends', 'open']).default('friends'),
    rated: z.boolean().optional(),
  })
  .transform(
    (s): LobbyChoices<ImpostorSettings> => ({
      settings: { dialect: s.dialect, difficulty: s.difficulty, clueSeconds: s.clueSeconds, category: s.category ?? null },
      dialect: s.dialect,
      maxPlayers: s.maxPlayers,
      access: s.access,
      rated: s.rated,
    }),
  );

const moveSchema = z.union([
  z.strictObject({ clue: z.string().min(1).max(200) }),
  z.strictObject({ vote: z.number().int().min(1).max(100) }),
  z.strictObject({ guess: z.number().int().min(0).max(IMPOSTOR_GUESS_OPTIONS - 1) }),
]);
type RawMove = z.infer<typeof moveSchema>;

/** Approved rows of a kind in a variety, counted per level: what offering a game at a difficulty is judged by. */
export async function approvedLevels(db: Executor, kind: GameContentKind, dialect: GameDialect): Promise<Record<GameLevel, number>> {
  const res = await db.query<{ level: number; n: number }>(
    `SELECT level, count(*)::int AS n FROM game_content
      WHERE kind = $1 AND dialect = $2 AND status = 'published' AND review_status = 'approved'
      GROUP BY level`,
    [kind, dialect],
  );
  const levels: Record<GameLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of res.rows) if (r.level >= 1 && r.level <= 5) levels[r.level as GameLevel] = r.n;
  return levels;
}

/** The approved rows of a kind a lobby's difficulty draws on, each checked again by its schema and script. */
export async function approvedPool<K extends GameContentKind>(
  db: Executor,
  kind: K,
  dialect: GameDialect,
  difficulty: GameDifficulty,
): Promise<Array<PublishedContent<K>>> {
  const levels: readonly number[] = DIFFICULTY_LEVELS[difficulty];
  return (await new TrustedSources(db).content(kind, dialect)).filter((row) => levels.includes(row.level));
}

/**
 * The deal from a pool, pure: one card drawn by the seed (from one category,
 * when the lobby asked for one), and the other words for the guess — the same
 * category first, then any other approved word, never one that folds to the
 * same letters as the word itself.
 */
export function dealFrom(
  pool: ReadonlyArray<Pick<PublishedContent<'word_card'>, 'payload'>>,
  dialect: GameDialect,
  seed: string,
  category: string | null = null,
): ImpostorDeal | null {
  if (pool.length < IMPOSTOR_GUESS_OPTIONS) return null;
  const from = category === null ? pool : pool.filter((r) => r.payload.category === category);
  if (from.length < IMPOSTOR_GUESS_OPTIONS) return null;
  const chosen = from[Math.floor(seededUnit(seed, 'card') * from.length)]!.payload;
  const key = (w: string) => foldForDialect(w, dialect, true);
  const others = pool.map((r) => r.payload).filter((p) => key(p.word) !== key(chosen.word));
  const same = seededOrder(seed, 'same', others.filter((p) => p.category === chosen.category));
  const rest = seededOrder(seed, 'rest', others.filter((p) => p.category !== chosen.category));
  const decoys: string[] = [];
  for (const p of [...same, ...rest]) {
    if (decoys.length >= IMPOSTOR_GUESS_OPTIONS - 1) break;
    if (!decoys.some((d) => key(d) === key(p.word))) decoys.push(p.word);
  }
  if (decoys.length < IMPOSTOR_GUESS_OPTIONS - 1) return null;
  const card: WordCardContent = chosen;
  return {
    card: { word: card.word, meanings: card.meanings, forms: card.forms ?? [], hint: { ku: card.hint.ku, meanings: card.hint.meanings } },
    decoys,
  };
}

export const impostorModule: GameModule<ImpostorState, ImpostorMove, ImpostorSettings, ImpostorBoard, ImpostorOutcome, RawMove> = {
  game: 'impostor',
  rules: impostorRules,
  lobbySchema,
  moveSchema,
  minPlayers: IMPOSTOR_MIN_PLAYERS,
  maxPlayers: IMPOSTOR_MAX_PLAYERS,
  teams: 0,
  freeText: { maxLength: IMPOSTOR_CLUE_LIMITS.maxChars, textOf: (raw) => ('clue' in raw ? raw.clue : null) },
  xpSource: 'game_impostor_place',

  summary(dialect) {
    return { dialect: dialect === 'kmr' ? 'kurmanci' : 'sorani' };
  },

  publicSettings(settings) {
    return { dialect: settings.dialect, difficulty: settings.difficulty, clueSeconds: settings.clueSeconds, category: settings.category ?? null };
  },

  async prepare(_db, _state, _seat, { raw, text }) {
    if ('clue' in raw) return { move: { kind: 'clue', text: text ?? raw.clue }, text: text ?? raw.clue };
    if ('vote' in raw) return { move: { kind: 'vote', seat: raw.vote }, text: null };
    return { move: { kind: 'guess', option: raw.guess }, text: null };
  },

  async offers(db, choices) {
    const levels = await approvedLevels(db, 'word_card', choices.dialect);
    if (!availableDifficulties(levels, MINIMUM).includes(choices.settings.difficulty)) return false;
    const category = choices.settings.category ?? null;
    if (category === null) return true;
    const pool = await approvedPool(db, 'word_card', choices.dialect, choices.settings.difficulty);
    return pool.filter((row) => row.payload.category === category).length >= IMPOSTOR_GUESS_OPTIONS;
  },

  async deal(db, settings, { dialect, seed }) {
    const pool = await approvedPool(db, 'word_card', dialect, settings.difficulty);
    const deal = pool.length >= MINIMUM ? dealFrom(pool, dialect, seed, settings.category ?? null) : null;
    if (!deal) throw new AppError('GAME_UNAVAILABLE', 409, 'there are not enough approved word cards for this game now');
    return { ...settings, deal };
  },

  async availability(db, dialect) {
    const levels = await approvedLevels(db, 'word_card', dialect);
    return { group: availableDifficulties(levels, MINIMUM).length > 0, solo: false };
  },
};
