/**
 * Who Am I? on one phone passed round a room. Whoever holds the phone picks a question (a suggested one or any on their
 * list) and reads it out, then turns the phone to the room, where the friends see the card and the question and tap the
 * answer; the phone hides the card again and says the card's own answer. A player may also ask the room a question of
 * their own, answered aloud and only counted. Without tiles, a player who thinks they know says who they are and the room
 * says right or close. The same rules (rules.ts) on an open table started from the server's deal
 * (api/src/games/who-am-i.ts), with the room's one answer standing for everyone's. No clock is kept, and nothing pays: the
 * phone holds every card, so it cannot judge who won. Players' names never leave the phone.
 */
import type { GameDialect } from '../dialect.js';
import type { GameDifficulty } from '../solo.js';
import type { WhoAmIAnswerCount, WhoAmIDeal, WhoAmISays } from './game.js';
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

/** A room's cards as the server deals them: one per player, in seat order. */
export interface WhoAmICouchDeals {
  dialect: GameDialect;
  difficulty: GameDifficulty;
  deals: WhoAmIDeal[];
  /**
   * The answers offered, as the server dealt the cards for: 4 when the app asked, else 2 (cards without "sometimes" rows);
   * older servers send none, meaning 2.
   */
  answers?: WhoAmIAnswerCount;
}

/** The table for a room: seat `i` is the i-th player, wearing the i-th card. */
export function startCouchTable(dealt: WhoAmICouchDeals, now: number, seed: string): WhoAmITableState {
  const seats = dealt.deals.map((_, seat) => ({ seat, team: null, bot: null }));
  return whoAmITableRules.init(
    // The longest a table runs; nothing on one phone reads this clock.
    {
      dialect: dealt.dialect,
      difficulty: dealt.difficulty,
      minutes: WHO_AM_I_TABLE_MINUTES[WHO_AM_I_TABLE_MINUTES.length - 1]!,
      deals: dealt.deals.map((deal, seat) => ({ seat, deal })),
      // The room is together, so a player may ask it a question of their own.
      open: true,
      answers: dealt.answers,
    },
    seats,
    { now, seed },
  );
}

/**
 * The room's answer to the question on the table, tapped while reading the card and given for everyone still to answer:
 * yes, could be, no or not sure (or true and false from a two-key screen). Returns the state with the card's answer
 * (`told`), unchanged when no question is open or the table does not offer that answer.
 */
export function roomAnswers(state: WhoAmITableState, says: WhoAmISays | boolean, now: number): WhoAmITableState {
  const answer = typeof says === 'boolean' ? ({ kind: 'answer', yes: says } as const) : ({ kind: 'answer', says } as const);
  let next = state;
  for (const seat of whoAmITableRules.waitingFor(state)) {
    if (next.phase !== 'answer') break;
    const applied = whoAmITableRules.apply(next, seat, answer, now);
    if (applied.ok) next = applied.state;
  }
  return next;
}
