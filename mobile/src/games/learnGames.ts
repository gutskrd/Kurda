import { useEffect, useState } from 'react';
import { listedLearnGames, type GameDialect, type GamesAvailability, type LearnGameId, type ListedLearnGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { TranslationKey } from '../i18n/translations';
import { useCourseDialect } from '../learn/courseDialect';
import { LAST_LETTER_CARD, offeredDialects, useLastLetterAvailability } from '../lastletter/learnCard';

/**
 * The learning games on the phone: which of the shared registry's games this
 * app has a screen for, and the words on each one's card in Learn's Games
 * group.
 *
 * The list is every game in the registry the phone can open (here). Those with
 * enough approved content in the learner's Kurdish right now (GET
 * /games/availability) come first and open; the rest follow as "coming soon",
 * seen but not opened, until their content is published.
 */

/** The screens the learning games open on (root stack routes). */
export type LearnGameRoute = 'BuildSentence' | 'MemoryThief' | 'HearIt' | 'WhatWouldYouSay' | 'Detective' | 'LastLetter' | 'Impostor' | 'DontSay' | 'Bluff' | 'WhoAmI';

export interface PhoneGame {
  route: LearnGameRoute;
  name: TranslationKey;
  /** one line, what you do in it */
  line: TranslationKey;
}

export const PHONE_LEARN_GAMES: Partial<Record<LearnGameId, PhoneGame>> = {
  'build-sentence': { route: 'BuildSentence', name: 'games.sentence.name', line: 'games.card.sentence' },
  'memory-thief': { route: 'MemoryThief', name: 'games.memory.name', line: 'games.card.memory' },
  'hear-it': { route: 'HearIt', name: 'games.hear.name', line: 'games.card.hear' },
  'what-would-you-say': { route: 'WhatWouldYouSay', name: 'games.say.name', line: 'games.card.say' },
  detective: { route: 'Detective', name: 'games.detective.name', line: 'games.card.detective' },
  'last-letter': { route: LAST_LETTER_CARD.route, name: LAST_LETTER_CARD.nameKey, line: LAST_LETTER_CARD.lineKey },
  // the party games are listed where /games/availability finds enough approved cards for the learner's Kurdish
  impostor: { route: 'Impostor', name: 'games.impostor.name', line: 'games.invite.blurb.impostor' },
  'dont-say': { route: 'DontSay', name: 'games.dontSay.name', line: 'games.invite.blurb.dontSay' },
  bluff: { route: 'Bluff', name: 'games.bluff.name', line: 'games.bluff.blurb' },
  'who-am-i': { route: 'WhoAmI', name: 'games.whoAmI.name', line: 'games.whoAmI.blurb' },
};

const PLAYABLE = Object.keys(PHONE_LEARN_GAMES) as LearnGameId[];

/** What can be played in a variety, asked when the screen opens; null until it answers, or when it cannot. */
export function useAvailability(dialect: GameDialect): GamesAvailability | null {
  const { client } = useAuth();
  const [availability, setAvailability] = useState<GamesAvailability | null>(null);
  useEffect(() => {
    let live = true;
    void client.get<GamesAvailability>(`/games/availability?dialect=${dialect}`).then((res) => {
      if (live && res.ok) setAvailability(res.data);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);
  return availability;
}

/** A round of a game this learner left unfinished in a variety, to offer first; null when there is none (or until it answers). */
export function useOpenRound(game: LearnGameId, dialect: GameDialect): string | null {
  const { client } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void client.get<{ id: string | null }>(`/games/solo/open?game=${game}&dialect=${dialect}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, game, dialect]);
  return open;
}

/** The learning games to list for this learner now, in the learner's own Kurdish, each with whether it can be played yet. */
export function useListedLearnGames(): ListedLearnGame[] {
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  // The Last Letter is offered where its dictionary can check words (its own answer, from the multiplayer games' API)
  const chain = useLastLetterAvailability();
  const offered = [...offeredDialects(chain, 'group'), ...offeredDialects(chain, 'solo')].includes(dialect);
  // both answers before anything is listed, so its card does not start as coming soon and then move
  const merged =
    availability && chain !== null
      ? { ...availability, games: [...(availability.games ?? []).filter((g) => g.id !== 'last-letter'), { id: 'last-letter', available: offered }] }
      : null;
  return listedLearnGames(merged, PLAYABLE);
}
