import type pg from 'pg';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  GAME_DIFFICULTIES,
  GAME_SLUG_PATTERN,
  IMPOSTOR_CATEGORY_MIN,
  IMPOSTOR_CLUE_LIMITS,
  IMPOSTOR_CLUE_SECONDS,
  IMPOSTOR_DEFAULT_CLUE_SECONDS,
  IMPOSTOR_GUESS_OPTIONS,
  IMPOSTOR_MAX_PLAYERS,
  IMPOSTOR_MIN_PLAYERS,
  IMPOSTOR_UNSURE_VOTE,
  availableDifficulties,
  impostorRules,
  impostorTooClose,
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
 *   lobby's difficulty (`IMPOSTOR_CATEGORY_MIN`), and the deal then draws the
 *   word from it. A game for any category draws only from the categories that
 *   have that many, so the caught impostor always picks among real rivals of
 *   the word rather than strays from elsewhere.
 * - The vote. A seat, or `IMPOSTOR_UNSURE_VOTE` from someone who cannot tell.
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
  z.strictObject({ vote: z.number().int().min(IMPOSTOR_UNSURE_VOTE).max(100) }),
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

/** The categories of a pool with enough cards to be dealt from (`IMPOSTOR_CATEGORY_MIN`). */
export function dealableCategories(pool: ReadonlyArray<Pick<PublishedContent<'word_card'>, 'payload'>>): Set<string> {
  const counts = new Map<string, number>();
  for (const { payload } of pool) counts.set(payload.category, (counts.get(payload.category) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= IMPOSTOR_CATEGORY_MIN).map(([slug]) => slug));
}

/**
 * The other words a caught impostor picks the word from, pure: of the word's
 * own category first, then any other, each drawn in the seed's order, and
 * none too close to the word or to one another (`impostorTooClose`: the word
 * give or take an ending, or the same meaning under another name).
 */
export function decoysFor(
  chosen: Pick<WordCardContent, 'word' | 'meanings' | 'category'>,
  pool: ReadonlyArray<Pick<WordCardContent, 'word' | 'meanings' | 'category'>>,
  dialect: GameDialect,
  seed: string,
  salt = '',
): string[] {
  const others = pool.filter((p) => !impostorTooClose(p, chosen, dialect));
  const same = seededOrder(seed, `same${salt}`, others.filter((p) => p.category === chosen.category));
  const rest = seededOrder(seed, `rest${salt}`, others.filter((p) => p.category !== chosen.category));
  const decoys: Array<Pick<WordCardContent, 'word' | 'meanings'>> = [];
  for (const p of [...same, ...rest]) {
    if (decoys.length >= IMPOSTOR_GUESS_OPTIONS - 1) break;
    if (!decoys.some((d) => impostorTooClose(d, p, dialect))) decoys.push(p);
  }
  return decoys.map((d) => d.word);
}

/**
 * The deal from a pool, pure: one card drawn by the seed from a category with
 * enough cards (the one the lobby asked for, or any that qualifies), and the
 * other words for the guess (`decoysFor`).
 */
export function dealFrom(
  pool: ReadonlyArray<Pick<PublishedContent<'word_card'>, 'payload'>>,
  dialect: GameDialect,
  seed: string,
  category: string | null = null,
): ImpostorDeal | null {
  const dealable = dealableCategories(pool);
  const from = pool.filter((r) => (category === null ? dealable.has(r.payload.category) : r.payload.category === category && dealable.has(category)));
  if (from.length === 0) return null;
  const chosen = from[Math.floor(seededUnit(seed, 'card') * from.length)]!.payload;
  const decoys = decoysFor(
    chosen,
    pool.map((r) => r.payload),
    dialect,
    seed,
  );
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

  // a vote for seat 0 is "not sure" (IMPOSTOR_UNSURE_VOTE), which the rules take as a vote for nobody
  async prepare(_db, _state, _seat, { raw, text }) {
    if ('clue' in raw) return { move: { kind: 'clue', text: text ?? raw.clue }, text: text ?? raw.clue };
    if ('vote' in raw) return { move: { kind: 'vote', seat: raw.vote }, text: null };
    return { move: { kind: 'guess', option: raw.guess }, text: null };
  },

  async offers(db, choices) {
    const levels = await approvedLevels(db, 'word_card', choices.dialect);
    if (!availableDifficulties(levels, MINIMUM).includes(choices.settings.difficulty)) return false;
    const category = choices.settings.category ?? null;
    const dealable = dealableCategories(await approvedPool(db, 'word_card', choices.dialect, choices.settings.difficulty));
    return category === null ? dealable.size > 0 : dealable.has(category);
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
