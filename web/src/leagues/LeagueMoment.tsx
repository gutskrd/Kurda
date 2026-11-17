import { useState } from 'react';
import { ART_LEAGUE_METAL, BURST, isLeagueTier, leagueWin, type LeagueWeekResult } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { Celebration, useCelebrationHold } from '../ranks/Celebration';
import { leagueName, leagueNamed, withMeaning } from '../ranks/names';
import { ShareWin } from '../share/ShareWin';
import { leagueShare } from '../share/winText';

const KEY = 'hevalo_league_celebrated';

/** Whether last week moved this learner up (or won the trophy): a moment worth its own stage. */
export function isPromotion(week: LeagueWeekResult | null | undefined): week is LeagueWeekResult {
  return !!week && week.mode === 'league' && (week.outcome === 'promoted' || week.trophy) && isLeagueTier(week.tierAfter ?? week.tier);
}

function seenWeek(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Moving up a league, celebrated once.
 *
 * The week closes while nobody is watching (Monday 00:00 UTC), so the moment
 * is the first time the league is opened afterwards: the new league's emblem
 * on the app's one celebration, and last week's line under it. Once per week
 * in this browser — the week is remembered when the celebration is closed —
 * and never for staying or going down, which the card says plainly by itself.
 *
 * Under the way on there is a quiet Share for a week that is good news to
 * tell (shared `leagueWin`): the league moved up to, or a place in the first
 * three. It says the league and the place and nothing of who else was in it.
 */
export function LeagueMoment({ week }: { week: LeagueWeekResult | null | undefined }): React.JSX.Element | null {
  const t = useT();
  const promoted = isPromotion(week);
  const [open, setOpen] = useState(() => promoted && seenWeek() !== week.weekKey);
  useCelebrationHold(open);
  if (!promoted || !open) return null;
  const tier = (week.tierAfter ?? week.tier)!;
  const metal = ART_LEAGUE_METAL[tier];
  const close = (): void => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, week.weekKey);
    } catch {
      // without storage it may be celebrated again next time, which is no harm
    }
  };
  const named = leagueNamed(t, tier);
  const win = leagueWin(week);
  return (
    <Celebration
      open
      label={t('leagues.celebrate.up')}
      art={<LeagueEmblem tier={tier} size={168} title={withMeaning(t, named)} />}
      kicker={t('leagues.celebrate.up')}
      title={leagueName(t, tier)}
      body={t('leagues.result.promoted', { tier: leagueName(t, tier) })}
      tone="league"
      colours={[metal.light, metal.mid]}
      flecks={BURST.league}
      seed={week.weekKey.length * 53 + tier.length}
      action={t('lesson.continue')}
      below={win ? <ShareWin text={leagueShare(t, win, leagueNamed(t, win.tier).name)} /> : null}
      onClose={close}
    />
  );
}
