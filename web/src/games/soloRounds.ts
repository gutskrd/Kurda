import { useEffect, useState } from 'react';
import { toDialect, type GameDialect, type GamesAvailability, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { defaultVariety } from '../stories/prefs';

/**
 * What every round of the solo kit asks before it starts, whichever list it
 * is found in: the learner's variety, what can be done in that variety now
 * (GET /games/availability), and a round left open.
 *
 * On its own, apart from Learn's games (games/learnGames.tsx), because the
 * lessons' practice asks the same questions for its two exercises
 * (learn/practiceTools.tsx) and should not carry the games' cards and their
 * stylesheets to do it.
 */

/** The learner's variety for the games: their course's, else the interface's, else the one chosen last, else Kurmancî. */
export function useGameDialect(): GameDialect {
  const { locale } = useI18n();
  return toDialect(defaultVariety(locale)) ?? 'kmr';
}

/** What can be played in a variety, asked once per visit; null until it answers (or when it cannot). */
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
