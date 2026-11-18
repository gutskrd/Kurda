import { listedLearnGames, type LearnGameId, type ListedLearnGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { MessageKey } from '../i18n/en';
import { LAST_LETTER_CARD, offeredDialects, useLastLetterAvailability } from '../lastletter/learnCard';
import { useAvailability, useGameDialect } from './soloRounds';

/**
 * The learning games the website has pages for, from the shared registry, and what Learn's Games page (pages/Games.tsx)
 * says of each. Games with enough approved content in the learner's variety (GET /games/availability) are stamps; the
 * rest are listed as coming soon. Build a Sentence and Hear It, Find It are lesson practice exercises instead
 * (learn/practiceTools.tsx); what both lists share is in games/soloRounds.ts.
 */

interface WebGame {
  href: string;
  nameKey: MessageKey;
  /** one line about it: said with its stamp to a screen reader, which sees no cover */
  lineKey: MessageKey;
  /** The full description, shown under the featured stamp and where a game's ways in are offered. */
  bodyKey: MessageKey;
  /** how it is played: alone, with friends, or either on the one page */
  modes: ReadonlyArray<'solo' | 'online'>;
}

export const WEB_LEARN_GAMES: Partial<Record<LearnGameId, WebGame>> = {
  'memory-thief': { href: '/app/games/memory-thief', nameKey: 'games.memory.name', lineKey: 'games.card.memory', bodyKey: 'games.memory.body', modes: ['solo'] },
  detective: { href: '/app/games/detective', nameKey: 'games.detective.name', lineKey: 'games.card.detective', bodyKey: 'games.detective.body', modes: ['solo'] },
  'last-letter': { href: LAST_LETTER_CARD.href, nameKey: LAST_LETTER_CARD.nameKey, lineKey: LAST_LETTER_CARD.blurbKey, bodyKey: LAST_LETTER_CARD.blurbKey, modes: ['solo', 'online'] },
  // Games with friends are listed where /games/availability finds enough approved cards in the learner's variety.
  impostor: { href: '/app/games/impostor', nameKey: 'games.impostor.name', lineKey: 'games.invite.blurb.impostor', bodyKey: 'games.invite.blurb.impostor', modes: ['online'] },
  // never played alone: on one phone passed round a room, or with friends online, and its own page asks which
  'who-am-i': { href: '/app/games/who-am-i', nameKey: 'games.whoAmI.name', lineKey: 'games.card.whoAmI', bodyKey: 'games.whoAmI.blurb', modes: ['online'] },
};

const PLAYABLE = Object.keys(WEB_LEARN_GAMES) as LearnGameId[];

/** The learning games to list for this learner now, each with whether it can be played yet. */
export function useListedLearnGames(): ListedLearnGame[] {
  const dialect = useGameDialect();
  const { status } = useAuth();
  const availability = useAvailability(dialect);
  // The Last Letter is offered where its dictionary can check words, from its own multiplayer availability.
  const chain = useLastLetterAvailability();
  const offered = [...offeredDialects(chain, 'group'), ...offeredDialects(chain, 'solo')].includes(dialect);
  // Wait for both answers before listing, so its card does not start as coming soon and move; visitors skip that
  // request and see it as not open yet.
  const chainKnown = chain !== null || status === 'signedOut';
  const merged =
    availability && chainKnown
      ? { ...availability, games: [...(availability.games ?? []).filter((g) => g.id !== 'last-letter'), { id: 'last-letter', available: offered }] }
      : null;
  return listedLearnGames(merged, PLAYABLE);
}
