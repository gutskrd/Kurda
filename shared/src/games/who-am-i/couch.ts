/**
 * Who Am I? on one phone, passed round a room.
 *
 * The game online (rules.ts) is played apart, each on their own screen: a
 * player's card is on everyone's screen but their own. This one is for people
 * sitting together, and nobody has to remember anything. Whoever holds the
 * phone picks a question, one of the few it suggests or any on their list,
 * and reads it out, then turns the phone to the room: there the friends see
 * the card and the question together and tap yes or no themselves. The phone
 * hides the card again and says what the card's own answer is. A player may
 * also ask the room a question of their own; the friends answer that one out
 * loud, looking at the card, and the phone only counts it.
 *
 * It is the same game by the same rules: this module only starts a table
 * from the cards the server dealt for the room (api/src/games/who-am-i.ts),
 * as an open one (a question may be asked out loud), and gives the room's one
 * answer for everybody who would have answered on a screen of their own.
 * Nothing here keeps a clock; the phone waits for the room.
 *
 * Nothing is paid for a game played this way. The phone holds every card, so
 * it cannot be the judge of who won: a game here earns no XP and moves no
 * rating. The players' names never leave the phone.
 */
import type { GameDialect } from '../dialect.js';
import type { GameDifficulty } from '../solo.js';
import type { WhoAmIDeal } from './game.js';
import { WHO_AM_I_TABLE_MAX_PLAYERS, WHO_AM_I_TABLE_MIN_PLAYERS, WHO_AM_I_TABLE_MINUTES, whoAmITableRules, type WhoAmITableState } from './rules.js';

export const WHO_AM_I_COUCH_MIN_PLAYERS = WHO_AM_I_TABLE_MIN_PLAYERS;
export const WHO_AM_I_COUCH_MAX_PLAYERS = WHO_AM_I_TABLE_MAX_PLAYERS;
/** A name is what fits on a card held at arm's length. */
export const WHO_AM_I_COUCH_NAME_MAX = 14;

/** Where the game can be played on one phone: the difficulties the dialect's approved identities fill. */
export interface WhoAmICouchOffer {
  dialect: GameDialect;
  difficulties: GameDifficulty[];
}

/** A room's cards, as the server deals them: one for each player, in the order they sit. */
export interface WhoAmICouchDeals {
  dialect: GameDialect;
  difficulty: GameDifficulty;
  deals: WhoAmIDeal[];
}

/** The table for a room: seat `i` is the i-th player, wearing the i-th card. */
export function startCouchTable(dealt: WhoAmICouchDeals, now: number, seed: string): WhoAmITableState {
  const seats = dealt.deals.map((_, seat) => ({ seat, team: null, bot: null }));
  return whoAmITableRules.init(
    // the longest a table runs; nothing on one phone reads this clock
    {
      dialect: dealt.dialect,
      difficulty: dealt.difficulty,
      minutes: WHO_AM_I_TABLE_MINUTES[WHO_AM_I_TABLE_MINUTES.length - 1]!,
      deals: dealt.deals.map((deal, seat) => ({ seat, deal })),
      // the room is together: a player may ask it a question of their own
      open: true,
    },
    seats,
    { now, seed },
  );
}

/**
 * What the room said to the question on the table, tapped by the friends
 * while they read the card, and given for everyone who was still to answer it. The state comes back with the card's own answer on
 * it (`told`); unchanged when no question is being answered.
 */
export function roomAnswers(state: WhoAmITableState, yes: boolean, now: number): WhoAmITableState {
  let next = state;
  for (const seat of whoAmITableRules.waitingFor(state)) {
    if (next.phase !== 'answer') break;
    const applied = whoAmITableRules.apply(next, seat, { kind: 'answer', yes }, now);
    if (applied.ok) next = applied.state;
  }
  return next;
}
