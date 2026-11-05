import { useEffect, useState } from 'react';
import { listedLearnGames, type GameDialect, type GamesAvailability, type LearnGame, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { TranslationKey } from '../i18n/translations';
import { useCourseDialect } from '../learn/courseDialect';
import { LAST_LETTER_CARD, offeredDialects, useLastLetterAvailability } from '../lastletter/learnCard';

/**
 * The learning games on the phone: which of the shared registry's games this
 * app has a screen for, and the words on each one's card in Learn's Games
 * group.
 *
 * The list is the registry filtered by what the phone can open (here) and by
 * what has enough approved content in the learner's Kurdish right now (GET
 * /games/availability), so a game appears the day its content is published,
 * and never as "coming soon".
 */

/** The screens the learning games open on (root stack routes). */
export type LearnGameRoute = 'BuildSentence' | 'LastLetter' | 'Bluff' | 'WhoAmI';

export interface PhoneGame {
  route: LearnGameRoute;
  name: TranslationKey;
  /** one line, what you do in it */
  line: TranslationKey;
}

export const PHONE_LEARN_GAMES: Partial<Record<LearnGameId, PhoneGame>> = {
  'build-sentence': { route: 'BuildSentence', name: 'games.sentence.name', line: 'games.card.sentence' },
  'last-letter': { route: LAST_LETTER_CARD.route, name: LAST_LETTER_CARD.nameKey, line: LAST_LETTER_CARD.lineKey },
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

/** The learning games to list for this learner now, in the learner's own Kurdish. */
export function useListedLearnGames(): LearnGame[] {
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  // The Last Letter is offered where its dictionary can check words (its own answer, from the multiplayer games' API)
  const chain = useLastLetterAvailability();
  const offered = [...offeredDialects(chain, 'group'), ...offeredDialects(chain, 'solo')].includes(dialect);
  const merged = availability && { ...availability, games: [...(availability.games ?? []).filter((g) => g.id !== 'last-letter'), { id: 'last-letter', available: offered }] };
  return listedLearnGames(merged, PLAYABLE);
}
