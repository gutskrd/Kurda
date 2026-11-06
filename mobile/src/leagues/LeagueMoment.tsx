import { useEffect, useState } from 'react';
import type { LeagueView } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { LeagueCeremony } from './LeagueCeremony';
import { ceremonyFor } from './format';

const KEY = 'hevalo_league_celebrated';

/**
 * The week that closed, staged once.
 *
 * The week closes while nobody is watching (Monday 00:00 UTC), so the moment
 * is the first time the league is opened afterwards: the ladder moves so the
 * league the learner is in now lands in the middle, then what last week was
 * and what this week asks (LeagueCeremony). Every week that was raced gets
 * its ceremony — up, down, the same, the trophy — and each once on this
 * phone: the week's key is kept on the device when the ceremony is closed. A
 * week not taken part in, or a personal one, has no stage; last week's line
 * on the page says it plainly on its own.
 */
export function LeagueMoment({ league, store = deviceStore }: { league: LeagueView | null | undefined; store?: DeviceStore }): React.JSX.Element | null {
  const [show, setShow] = useState(false);
  const week = league?.lastWeek ?? null;
  const ceremony = ceremonyFor(week);
  const weekKey = ceremony && week ? week.weekKey : null;
  useCelebrationHold(show);

  useEffect(() => {
    if (!weekKey) return;
    let live = true;
    void store.get(KEY).then((seen) => {
      if (live && seen !== weekKey) setShow(true);
    });
    return () => {
      live = false;
    };
  }, [weekKey, store]);

  if (!league || !week || !ceremony || !show) return null;
  const close = (): void => {
    setShow(false);
    void store.set(KEY, week.weekKey);
  };
  return <LeagueCeremony week={week} ceremony={ceremony} promoteCount={league.promoteCount} goalXp={league.goalXp} onClose={close} />;
}
