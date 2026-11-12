import { listedLearnGames, type LearnGameId, type ListedLearnGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { MessageKey } from '../i18n/en';
import { LAST_LETTER_CARD, offeredDialects, useLastLetterAvailability } from '../lastletter/learnCard';
import { useAvailability, useGameDialect } from './soloRounds';

/**
 * The learning games on the website: which of the shared registry's games
 * this app has a page for, what Learn's Games page says of each, and the
 * variety they are played in.
 *
 * Learn's Games page (pages/Games.tsx) lists every game in the registry this
 * app can open (here). Those with enough approved content in the learner's
 * variety right now (GET /games/availability) are cards on its shelf; the
 * rest are named under it as coming soon, seen but not opened, until their
 * content is published. Each wears the emblem drawn for it
 * (shared/src/art/games.ts).
 *
 * Build a Kurdish Sentence and Hear It, Find It are rounds of the same kit
 * and are not here: they are exercises of the lessons' practice
 * (learn/practiceTools.tsx). What the two lists share, the learner's variety and
 * what can be done in it, is games/soloRounds.ts.
 */

interface WebGame {
  href: string;
  nameKey: MessageKey;
  /** one line for its card */
  lineKey: MessageKey;
  /** what it is, said in full where there is room: the featured card */
  bodyKey: MessageKey;
  /** how it is played: alone, with friends, or either on the one page */
  modes: ReadonlyArray<'solo' | 'online'>;
}

export const WEB_LEARN_GAMES: Partial<Record<LearnGameId, WebGame>> = {
  'memory-thief': { href: '/app/games/memory-thief', nameKey: 'games.memory.name', lineKey: 'games.card.memory', bodyKey: 'games.memory.body', modes: ['solo'] },
  'what-would-you-say': { href: '/app/games/what-would-you-say', nameKey: 'games.say.name', lineKey: 'games.card.say', bodyKey: 'games.say.body', modes: ['solo'] },
  detective: { href: '/app/games/detective', nameKey: 'games.detective.name', lineKey: 'games.card.detective', bodyKey: 'games.detective.body', modes: ['solo'] },
  'last-letter': { href: LAST_LETTER_CARD.href, nameKey: LAST_LETTER_CARD.nameKey, lineKey: 'games.card.lastLetter', bodyKey: LAST_LETTER_CARD.blurbKey, modes: ['solo', 'online'] },
  // the games with friends are listed where /games/availability finds enough approved cards for the learner's variety
  impostor: { href: '/app/games/impostor', nameKey: 'games.impostor.name', lineKey: 'games.invite.blurb.impostor', bodyKey: 'games.invite.blurb.impostor', modes: ['online'] },
  'who-am-i': { href: '/app/games/who-am-i', nameKey: 'games.whoAmI.name', lineKey: 'games.card.whoAmI', bodyKey: 'games.whoAmI.blurb', modes: ['solo', 'online'] },
};

const PLAYABLE = Object.keys(WEB_LEARN_GAMES) as LearnGameId[];

/** The learning games to list for this learner now, each with whether it can be played yet. */
export function useListedLearnGames(): ListedLearnGame[] {
  const dialect = useGameDialect();
  const { status } = useAuth();
  const availability = useAvailability(dialect);
  // The Last Letter is offered where its dictionary can check words (its own answer, from the multiplayer games' API)
  const chain = useLastLetterAvailability();
  const offered = [...offeredDialects(chain, 'group'), ...offeredDialects(chain, 'solo')].includes(dialect);
  // both answers before anything is listed, so its card does not start as coming soon and then move; a visitor
  // without an account is never asked that one, and for them it is not open yet
  const chainKnown = chain !== null || status === 'signedOut';
  const merged =
    availability && chainKnown
      ? { ...availability, games: [...(availability.games ?? []).filter((g) => g.id !== 'last-letter'), { id: 'last-letter', available: offered }] }
      : null;
  return listedLearnGames(merged, PLAYABLE);
}
