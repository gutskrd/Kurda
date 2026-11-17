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
 * Who Am I? with friends, on the server (shared/src/games/who-am-i/rules.ts):
 * at the start every seat is dealt a hidden identity of its own from the
 * approved identities of the game's dialect at the host's difficulty
 * (`dealTable`). The deals live in the game's state. A player's view carries
 * everybody's card but their own, and their own tiles and questions; the
 * rules' `viewFor` is the only way any of it leaves the server.
 *
 * Nothing in the game is typed: a move is a question picked from the list,
 * an answer to somebody else's question (yes, could be, no or not sure), a
 * tile tapped, or a pass. What a card says to a question is the facts
 * table's, never the table's: the friends' answers are scored against it, and
 * the asker is told the card's.
 *
 * A table offers the four answers only when the app that made it asks for
 * them (`answers: 4`); one made by an app from before the four offers yes and
 * no. Either is dealt the cards as they are: these rules score a "sometimes"
 * card fairly whatever the friends say (yes and no are both right), and no
 * card's facts ever leave the server. An app from before the four answers
 * with `{ yes }` at any table, and reads a "sometimes" from the card as no:
 * the one thing it cannot show.
 *
 * Offered in a dialect with enough approved question templates and, at some
 * difficulty, enough identities.
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

// An answer comes as `says` from today's apps and as `yes` from apps before the four answers; a body with neither says
// nothing, and is refused before it reaches the table.
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
   * A hidden identity for every seat, drawn with the game's seed. When even
   * one seat cannot be dealt, the start is refused (409 GAME_UNAVAILABLE, as
   * the party games refuse it) and the lobby stays as it was.
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
    // a move carries nothing but its own choice: the rules judge whose turn it is and what the turn is waiting for
    if (raw.kind !== 'answer') return { move: raw, text: null };
    // either form of an answer is the same answer to the rules, and the schema has already refused a body with neither
    return { move: { kind: 'answer', says: whoAmISaysOf(raw)! }, text: null };
  },

  async availability(db, dialect) {
    const difficulties = await whoAmIDifficulties(db, dialect);
    return { group: difficulties.length > 0, solo: false, difficulties };
  },
};
