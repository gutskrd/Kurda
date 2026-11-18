import { useEffect, useState } from 'react';
import { toDialect, type GameDialect, type GamesAvailability, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { defaultVariety } from '../stories/prefs';

/**
 * What every solo round checks before starting: the learner's variety, what is available in it (GET
 * /games/availability), and any unfinished round. Separate from games/learnGames.tsx so lesson practice
 * (learn/practiceTools.tsx) can use it without the games' cards and stylesheets.
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

/** The learner's unfinished round of a game in a variety, offered first; null when none or not yet known. */
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
