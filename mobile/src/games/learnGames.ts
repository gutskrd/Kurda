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
 * The list is the games in the registry the phone can open (here) that have
 * enough approved content in the learner's Kurdish right now (GET
 * /games/availability), so a game appears the day its content is published.
 * The rest can follow them as "coming soon", seen but not opened; that is
 * off on the phone (`listsUpcoming` below says why).
 *
 * Build a Kurdish Sentence and Hear It, Find It are rounds of the same kit
 * but are not games: they are exercises of the lessons' practice, listed
 * there (practice/exercises.ts) and never here.
 */

/** The screens the learning games open on (root stack routes). */
export type LearnGameRoute = 'MemoryThief' | 'Detective' | 'LastLetter' | 'Impostor' | 'WhoAmI';

/** One way to play a game whose one screen holds several: what its button says, and the way the screen opens on. */
export interface PhoneGameWay {
  /** names its button for the tests (`game-<key>`) */
  key: string;
  label: TranslationKey;
  way: 'phone' | 'friends';
}

export interface PhoneGame {
  route: LearnGameRoute;
  name: TranslationKey;
  /** one line, what you do in it */
  line: TranslationKey;
  /** its ways to play, where its card offers a button for each rather than one Play */
  ways?: readonly PhoneGameWay[];
}

export const PHONE_LEARN_GAMES: Partial<Record<LearnGameId, PhoneGame>> = {
  'memory-thief': { route: 'MemoryThief', name: 'games.memory.name', line: 'games.card.memory' },
  detective: { route: 'Detective', name: 'games.detective.name', line: 'games.card.detective' },
  'last-letter': { route: LAST_LETTER_CARD.route, name: LAST_LETTER_CARD.nameKey, line: LAST_LETTER_CARD.lineKey },
  // Kurdish Impostor is listed where /games/availability finds enough approved cards for the learner's Kurdish
  impostor: { route: 'Impostor', name: 'games.impostor.name', line: 'games.invite.blurb.impostor' },
  // never played alone: on one phone passed round a room, or with friends online, each a button on its card
  'who-am-i': {
    route: 'WhoAmI',
    name: 'games.whoAmI.name',
    line: 'games.card.whoAmI',
    ways: [
      { key: 'who-am-i-phone', label: 'games.whoAmI.onePhone', way: 'phone' },
      { key: 'who-am-i-friends', label: 'games.mode.friends', way: 'friends' },
    ],
  },
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

/**
 * Whether the phone lists a game that is still short of approved content.
 *
 * Off. An app in a store is reviewed as a finished thing, and a card that
 * says "coming soon" and opens nothing is what a reviewer sends an app back
 * for; a learner who installed it would find half the list closed. So on the
 * phone a game appears the day its content is published, as it did before.
 * The website, which nobody reviews as a build, lists them all. The cards
 * still know how to say "coming soon" (learn/GamesView), for the day this is
 * turned on.
 */
let listsUpcoming = false;

/** Test seam: list the games that cannot be played yet, or stop. */
export function setListsUpcomingGames(on: boolean): void {
  listsUpcoming = on;
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
  const listed = listedLearnGames(merged, PLAYABLE);
  return listsUpcoming ? listed : listed.filter((g) => g.ready);
}
