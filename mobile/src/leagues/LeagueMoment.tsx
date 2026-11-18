import { useEffect, useState } from 'react';
import type { LeagueView } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { LeagueCeremony } from './LeagueCeremony';
import { ceremonyFor } from './format';

const KEY = 'hevalo_league_celebrated';

/**
 * The closed week, staged once. Weeks close at Monday 00:00 UTC while nobody is watching, so the moment comes the
 * first time the league opens afterwards (LeagueCeremony). Every raced week gets its ceremony (up, down, same,
 * trophy), once per device: the week's key is stored when the ceremony closes. A week not taken part in, or a
 * personal one, has no stage; last week's line on the page says it plainly.
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
