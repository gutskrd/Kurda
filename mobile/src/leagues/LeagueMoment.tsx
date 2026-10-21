import { useEffect, useState } from 'react';
import type { LeagueWeekResult } from '@kurda/shared';
import { ClayButton } from '../theme/glass';
import { useI18n } from '../i18n/I18nContext';
import { LeagueEmblem } from '../ranks/art';
import { Celebration } from '../ranks/Celebration';
import { leagueTint } from '../ranks/tint';
import { BURST } from '../theme/celebration';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { knownTier, lastWeekLine, leagueLabel, leagueMeaning, leagueName } from './format';

const KEY = 'hevalo_league_celebrated';

/** Whether last week moved this learner up (or won the trophy): a moment worth its own stage. */
export function isPromotion(week: LeagueWeekResult | null | undefined): week is LeagueWeekResult {
  return !!week && week.mode === 'league' && (week.outcome === 'promoted' || week.trophy) && knownTier(week.tierAfter ?? week.tier) !== null;
}

/**
 * Moving up a league, celebrated once.
 *
 * The week closes while nobody is watching (Monday 00:00 UTC), so the moment
 * is the first time the league is opened afterwards: the new league's emblem
 * on the app's one celebration, then last week's line. Once on this phone per
 * week — the week's key is kept on the device when it is closed — and never
 * for staying or going down, which last week's line says plainly on its own.
 */
export function LeagueMoment({ week, store = deviceStore }: { week: LeagueWeekResult | null | undefined; store?: DeviceStore }): React.JSX.Element | null {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const promoted = isPromotion(week);
  const weekKey = promoted ? week.weekKey : null;
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

  if (!promoted || !show) return null;
  const tier = knownTier(week.tierAfter ?? week.tier)!;
  const [light, strong] = leagueTint(tier, 'dark');
  const close = (): void => {
    setShow(false);
    void store.set(KEY, week.weekKey);
  };
  const kicker = t('leagues.celebrate.up');
  return (
    <Celebration
      art={<LeagueEmblem tier={tier} size={168} label={leagueLabel(t, tier)} />}
      glow={strong}
      flecks={BURST.league}
      fleckColours={[light, strong, '#ffffff']}
      // seen on opening the league, not caused just now: shown, not felt
      felt={false}
      seed={week.weekKey.length * 53 + tier.length}
      kicker={kicker}
      title={t('leagues.leagueName', { tier: leagueName(t, tier) })}
      subtitle={leagueMeaning(t, tier)}
      detail={lastWeekLine(t, week)}
      announce={`${kicker}: ${leagueLabel(t, tier)}`}
      onClose={close}
      actions={<ClayButton label={t('common.continue')} tone="primary" size="large" onPress={close} />}
    />
  );
}
