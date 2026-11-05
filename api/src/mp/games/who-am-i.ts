import type pg from 'pg';
import { z } from 'zod';
import {
  GAME_DIFFICULTIES,
  LEARN_GAMES,
  WHO_AM_I_CANDIDATES,
  WHO_AM_I_MIN_TEMPLATES,
  WHO_AM_I_RACE_DEFAULT_MINUTES,
  WHO_AM_I_RACE_MAX_PLAYERS,
  WHO_AM_I_RACE_MIN_PLAYERS,
  WHO_AM_I_RACE_MINUTES,
  availableDifficulties,
  dealWhoAmI,
  seededUnit,
  whoAmIRaceRules,
  type GameDifficulty,
  type GameLevel,
  type WhoAmIDeal,
  type WhoAmIRaceBoard,
  type WhoAmIRaceMinutes,
  type WhoAmIRaceMove,
  type WhoAmIRaceOutcome,
  type WhoAmIRaceSettings,
  type WhoAmIRaceState,
} from '@kurda/shared';
import { TrustedSources } from '../../games/sources.js';
import { identitiesAt, whoAmIPool } from '../../games/who-am-i.js';
import { AppError } from '../../plugins/errors.js';
import type { GameModule, LobbyChoices } from '../module.js';

/**
 * Who Am I? as a race, on the server (shared/src/games/who-am-i/rules.ts):
 * at the start, every seat is dealt a hidden identity of its own from the
 * approved identities of the game's dialect at the host's difficulty, with
 * the same deal a solo round makes (`dealWhoAmI`): tiles that share most of
 * its facts and only the questions every tile can answer. The deals live in
 * the game's state; each player's view carries their own tiles and questions,
 * and nobody's identity until it may be seen.
 *
 * Nothing in a race is typed: a move is a question picked from the list or a
 * tile tapped. Offered where the solo game is: a dialect with enough approved
 * question templates and, at some difficulty, enough identities.
 */

const minutes = z.custom<WhoAmIRaceMinutes>((v) => (WHO_AM_I_RACE_MINUTES as readonly unknown[]).includes(v), {
  message: `one of ${WHO_AM_I_RACE_MINUTES.join(', ')}`,
});

const lobbySchema = z
  .object({
    dialect: z.enum(['kmr', 'ckb']).default('kmr'),
    minutes: minutes.default(WHO_AM_I_RACE_DEFAULT_MINUTES),
    difficulty: z.enum(GAME_DIFFICULTIES).default('beginner'),
    maxPlayers: z.number().int().min(WHO_AM_I_RACE_MIN_PLAYERS).max(WHO_AM_I_RACE_MAX_PLAYERS).default(WHO_AM_I_RACE_MAX_PLAYERS),
    access: z.enum(['friends', 'open']).default('friends'),
    rated: z.boolean().optional(),
  })
  .transform(
    (s): LobbyChoices<WhoAmIRaceSettings> => ({
      settings: { dialect: s.dialect, minutes: s.minutes, difficulty: s.difficulty },
      dialect: s.dialect,
      maxPlayers: s.maxPlayers,
      access: s.access,
      rated: s.rated,
    }),
  );

const moveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ask'), question: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('guess'), tile: z.string().min(1).max(80) }),
]);
type RawMove = z.infer<typeof moveSchema>;

const MINIMUM = LEARN_GAMES.find((g) => g.id === 'who-am-i')!.minimum;

/** The difficulties a race can be played at in a dialect: those whose levels hold the game's minimum of identities. */
export async function raceDifficulties(db: Pick<pg.Pool, 'query'>, dialect: 'kmr' | 'ckb'): Promise<GameDifficulty[]> {
  const { identities, templates } = await whoAmIPool(new TrustedSources(db), dialect);
  if (templates.length < WHO_AM_I_MIN_TEMPLATES) return [];
  const levels: Record<GameLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const i of identities) if (i.level >= 1 && i.level <= 5) levels[i.level as GameLevel]++;
  return availableDifficulties(levels, MINIMUM);
}

export const whoAmIRaceModule: GameModule<WhoAmIRaceState, WhoAmIRaceMove, WhoAmIRaceSettings, WhoAmIRaceBoard, WhoAmIRaceOutcome, RawMove> = {
  game: 'who-am-i',
  rules: whoAmIRaceRules,
  lobbySchema,
  moveSchema,
  minPlayers: WHO_AM_I_RACE_MIN_PLAYERS,
  maxPlayers: WHO_AM_I_RACE_MAX_PLAYERS,
  teams: 0,
  xpSource: 'game_who_am_i_place',

  summary(dialect) {
    return { dialect: dialect === 'kmr' ? 'kurmanci' : 'sorani' };
  },

  publicSettings(settings) {
    return { dialect: settings.dialect, minutes: settings.minutes, difficulty: settings.difficulty };
  },

  /**
   * A hidden identity for every seat, each a different one while the pool
   * has enough, drawn with the game's seed. When even one seat cannot be
   * dealt an identity, the start is refused (409 NOT_ENOUGH_CONTENT) and the
   * lobby stays as it was.
   */
  async deal(db, lobby, seats) {
    const { identities, templates } = await whoAmIPool(new TrustedSources(db), lobby.dialect);
    const here = identitiesAt(identities, lobby.settings.difficulty);
    const order = here.map((i) => ({ i, k: seededUnit(lobby.seed, `target:${i.id}`) })).sort((a, b) => a.k - b.k).map((x) => x.i);
    const want = WHO_AM_I_CANDIDATES[lobby.settings.difficulty];
    const deals: Array<{ seat: number; deal: WhoAmIDeal }> = [];
    const used = new Set<string>();
    for (const s of seats) {
      const fresh = order.filter((i) => !used.has(i.id));
      for (const target of [...fresh, ...order]) {
        const deal = dealWhoAmI(target, identities, templates, { seed: lobby.seed, salt: `seat:${s.seat}`, want });
        if (!deal) continue;
        used.add(target.id);
        deals.push({ seat: s.seat, deal });
        break;
      }
    }
    // a race somebody could not be dealt into is refused at the start, not begun without them
    if (deals.length < seats.length) throw new AppError('NOT_ENOUGH_CONTENT', 409, 'there are not enough approved identities at this difficulty yet');
    return { ...lobby.settings, deals };
  },

  async prepare(_db, _state, _seat, { raw }) {
    return { move: raw.kind === 'ask' ? { kind: 'ask', question: raw.question } : { kind: 'guess', tile: raw.tile }, text: null };
  },

  async availability(db, dialect) {
    const difficulties = await raceDifficulties(db, dialect);
    return { group: difficulties.length > 0, solo: false, difficulties };
  },
};
