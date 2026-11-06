import { z } from 'zod';
import {
  DONT_SAY_CLUE_LIMITS,
  DONT_SAY_MAX_PLAYERS,
  DONT_SAY_MIN_PLAYERS,
  DONT_SAY_TEAMS,
  GAME_DIFFICULTIES,
  availableDifficulties,
  dontSayRules,
  learnGame,
  seededOrder,
  type DontSayBoard,
  type DontSayCard,
  type DontSayMove,
  type DontSayOutcome,
  type DontSaySettings,
  type DontSayState,
} from '@kurda/shared';
import { AppError } from '../../plugins/errors.js';
import type { GameModule, LobbyChoices } from '../module.js';
import { approvedLevels, approvedPool } from './impostor.js';

/**
 * Don't Say the Word! on the server: what the pure rules
 * (shared/src/games/dont-say/rules.ts) cannot decide alone.
 *
 * - The deck. When the host starts, the approved forbidden-word cards of the
 *   lobby's variety and difficulty are shuffled by the game's seed — published
 *   rows only, through the trusted readers — and handed to the rules alone: in
 *   the game's state, never in the lobby's stored settings, never in a link,
 *   and out only through the rules' per-seat view, where the card in play is
 *   the describer's alone.
 * - The text. Every clue and guess has passed the chat pipeline's gate before
 *   the game's lock; the rules then refuse one in the wrong script or too
 *   long, and buzz a clue that says the word, a forbidden word or a form.
 * - Teams. Two, chosen in the lobby (the host may put anyone on a team, a
 *   player themselves); a game of three is played together.
 * - Whether it is offered: as Kurdish Impostor, once the approved cards at a
 *   difficulty reach the registry's minimum.
 */

const MINIMUM = learnGame('dont-say').minimum;

const lobbySchema = z
  .object({
    dialect: z.enum(['kmr', 'ckb']).default('kmr'),
    difficulty: z.enum(GAME_DIFFICULTIES).default('beginner'),
    maxPlayers: z.number().int().min(DONT_SAY_MIN_PLAYERS).max(DONT_SAY_MAX_PLAYERS).default(DONT_SAY_MAX_PLAYERS),
    access: z.enum(['friends', 'open']).default('friends'),
    rated: z.boolean().optional(),
  })
  .transform(
    (s): LobbyChoices<DontSaySettings> => ({
      settings: { dialect: s.dialect, difficulty: s.difficulty },
      dialect: s.dialect,
      maxPlayers: s.maxPlayers,
      access: s.access,
      rated: s.rated,
    }),
  );

const moveSchema = z.union([
  z.strictObject({ clue: z.string().min(1).max(300) }),
  z.strictObject({ guess: z.string().min(1).max(200) }),
  z.strictObject({ skip: z.literal(true) }),
]);
type RawMove = z.infer<typeof moveSchema>;

export const dontSayModule: GameModule<DontSayState, DontSayMove, DontSaySettings, DontSayBoard, DontSayOutcome, RawMove> = {
  game: 'dont-say',
  rules: dontSayRules,
  lobbySchema,
  moveSchema,
  minPlayers: DONT_SAY_MIN_PLAYERS,
  maxPlayers: DONT_SAY_MAX_PLAYERS,
  teams: DONT_SAY_TEAMS,
  // the longer of the two: a guess is held to its own, shorter limit by the rules
  freeText: { maxLength: DONT_SAY_CLUE_LIMITS.maxChars, textOf: (raw) => ('clue' in raw ? raw.clue : 'guess' in raw ? raw.guess : null) },
  xpSource: 'game_dont_say_place',

  summary(dialect) {
    return { dialect: dialect === 'kmr' ? 'kurmanci' : 'sorani' };
  },

  publicSettings(settings) {
    return { dialect: settings.dialect, difficulty: settings.difficulty };
  },

  async prepare(_db, _state, _seat, { raw, text }) {
    if ('clue' in raw) return { move: { kind: 'clue', text: text ?? raw.clue }, text: text ?? raw.clue };
    if ('guess' in raw) return { move: { kind: 'guess', text: text ?? raw.guess }, text: text ?? raw.guess };
    return { move: { kind: 'skip' }, text: null };
  },

  async offers(db, choices) {
    const levels = await approvedLevels(db, 'taboo_card', choices.dialect);
    return availableDifficulties(levels, MINIMUM).includes(choices.settings.difficulty);
  },

  async deal(db, settings, { dialect, seed }) {
    const pool = await approvedPool(db, 'taboo_card', dialect, settings.difficulty);
    if (pool.length < MINIMUM) throw new AppError('GAME_UNAVAILABLE', 409, 'there are not enough approved cards for this game now');
    const deck: DontSayCard[] = seededOrder(seed, 'deck', pool).map(({ payload: c }) => ({
      target: c.target,
      meanings: c.meanings,
      forbidden: [...c.forbidden],
      forms: [...(c.forms ?? [])],
    }));
    return { ...settings, deck };
  },

  async availability(db, dialect) {
    const levels = await approvedLevels(db, 'taboo_card', dialect);
    return { group: availableDifficulties(levels, MINIMUM).length > 0, solo: false };
  },
};
