import type pg from 'pg';
import { z } from 'zod';
import {
  GAME_DIFFICULTIES,
  WHO_AM_I_SAYS,
  WHO_AM_I_TABLE_DEFAULT_MINUTES,
  WHO_AM_I_TABLE_MAX_PLAYERS,
  WHO_AM_I_TABLE_MIN_PLAYERS,
  WHO_AM_I_TABLE_MINUTES,
  whoAmISaysOf,
  whoAmITableRules,
  type GameDifficulty,
  type WhoAmITableBoard,
  type WhoAmITableMinutes,
  type WhoAmITableMove,
  type WhoAmITableOutcome,
  type WhoAmITableSettings,
  type WhoAmITableState,
} from '@kurda/shared';
import { TrustedSources } from '../../games/sources.js';
import { dealTable, tableDifficulties, whoAmIPool } from '../../games/who-am-i.js';
import { AppError } from '../../plugins/errors.js';
import type { GameModule, LobbyChoices } from '../module.js';

/**
 * Who Am I? with friends on the server (shared/src/games/who-am-i/rules.ts). At the start each seat is dealt its own
 * hidden identity from the dialect's approved identities at the host's difficulty (`dealTable`). Deals live in the
 * game's state; a player's view shows everyone's card but their own, and the rules' `viewFor` is the only way any of it
 * leaves the server.
 *
 * Nothing is typed: a move is a listed question, an answer to someone else's question (yes, could be, no, not sure), a
 * tile tap or a pass. A card's answer to a question comes from the facts table; friends' answers are scored against it.
 *
 * A table offers four answers only when the creating app asks (`answers: 4`); otherwise yes and no. Cards are dealt the
 * same either way: a "sometimes" card scores both yes and no as right, and card facts never leave the server. Older
 * apps answer with `{ yes }` and read a "sometimes" card as no.
 *
 * Offered in a dialect with enough approved question templates and, at some difficulty, enough identities.
 */

const minutes = z.custom<WhoAmITableMinutes>((v) => (WHO_AM_I_TABLE_MINUTES as readonly unknown[]).includes(v), {
  message: `one of ${WHO_AM_I_TABLE_MINUTES.join(', ')}`,
});

const lobbySchema = z
  .object({
    dialect: z.enum(['kmr', 'ckb']).default('kmr'),
    minutes: minutes.default(WHO_AM_I_TABLE_DEFAULT_MINUTES),
    difficulty: z.enum(GAME_DIFFICULTIES).default('beginner'),
    maxPlayers: z.number().int().min(WHO_AM_I_TABLE_MIN_PLAYERS).max(WHO_AM_I_TABLE_MAX_PLAYERS).default(WHO_AM_I_TABLE_MAX_PLAYERS),
    access: z.enum(['friends', 'open']).default('friends'),
    rated: z.boolean().optional(),
    answers: z.union([z.literal(2), z.literal(4)]).default(2),
  })
  .transform(
    (s): LobbyChoices<WhoAmITableSettings> => ({
      settings: { dialect: s.dialect, minutes: s.minutes, difficulty: s.difficulty, answers: s.answers },
      dialect: s.dialect,
      maxPlayers: s.maxPlayers,
      access: s.access,
      rated: s.rated,
    }),
  );

// `says` comes from current apps and `yes` from apps before the four answers; a body with neither is refused before it
// reaches the table.
const moveSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('ask'), question: z.string().min(1).max(80) }),
    z.object({ kind: z.literal('answer'), says: z.enum(WHO_AM_I_SAYS).optional(), yes: z.boolean().optional() }),
    z.object({ kind: z.literal('guess'), tile: z.string().min(1).max(80) }),
    z.object({ kind: z.literal('pass') }),
  ])
  .superRefine((m, ctx) => {
    if (m.kind === 'answer' && m.says === undefined && m.yes === undefined) ctx.addIssue({ code: 'custom', path: ['says'], message: 'say an answer' });
  });
type RawMove = z.infer<typeof moveSchema>;

/** The difficulties a table can be played at in a dialect. */
export async function whoAmIDifficulties(db: Pick<pg.Pool, 'query'>, dialect: 'kmr' | 'ckb'): Promise<GameDifficulty[]> {
  return tableDifficulties(await whoAmIPool(new TrustedSources(db), dialect));
}

export const whoAmITableModule: GameModule<WhoAmITableState, WhoAmITableMove, WhoAmITableSettings, WhoAmITableBoard, WhoAmITableOutcome, RawMove> = {
  game: 'who-am-i',
  rules: whoAmITableRules,
  lobbySchema,
  moveSchema,
  minPlayers: WHO_AM_I_TABLE_MIN_PLAYERS,
  maxPlayers: WHO_AM_I_TABLE_MAX_PLAYERS,
  teams: 0,
  xpSource: 'game_who_am_i_place',

  summary(dialect) {
    return { dialect: dialect === 'kmr' ? 'kurmanci' : 'sorani' };
  },

  publicSettings(settings) {
    return { dialect: settings.dialect, minutes: settings.minutes, difficulty: settings.difficulty, answers: settings.answers === 4 ? 4 : 2 };
  },

  /** A table is made only at a difficulty the dialect's identities fill. */
  async offers(db, choices) {
    return (await whoAmIDifficulties(db, choices.dialect)).includes(choices.settings.difficulty);
  },

  /**
   * A hidden identity for every seat, drawn with the game's seed. If any seat cannot be dealt, the start is refused
   * (409 GAME_UNAVAILABLE, as in the party games) and the lobby stays as it was.
   */
  async deal(db, settings, { dialect, seed, seats }) {
    const deals = dealTable(
      await whoAmIPool(new TrustedSources(db), dialect),
      settings.difficulty,
      seats.map((s) => s.seat),
      seed,
    );
    if (!deals) throw new AppError('GAME_UNAVAILABLE', 409, 'there are not enough approved identities at this difficulty yet');
    return { ...settings, deals };
  },

  async prepare(_db, _state, _seat, { raw }) {
    // A move carries only its own choice: the rules judge whose turn it is and what it waits for.
    if (raw.kind !== 'answer') return { move: raw, text: null };
    // Both answer forms mean the same to the rules; the schema has already refused a body with neither.
    return { move: { kind: 'answer', says: whoAmISaysOf(raw)! }, text: null };
  },

  async availability(db, dialect) {
    const difficulties = await whoAmIDifficulties(db, dialect);
    return { group: difficulties.length > 0, solo: false, difficulties };
  },
};
