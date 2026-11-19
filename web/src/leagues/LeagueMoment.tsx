import { useEffect, useState } from 'react';
import { ART_LEAGUE_METAL, BURST, isLeagueTier, leagueWin, reactionDelayMs, type LeagueWeekResult } from '@kurda/shared';
import { sayReactionLater } from '../characters/reactions';
import { prefersReducedMotion } from '../lib/motion';
import { useT } from '../i18n/I18nProvider';
import { LeagueEmblem } from '../ranks/art';
import { Celebration, useCelebrationHold } from '../ranks/Celebration';
import { leagueName, leagueNamed, withMeaning } from '../ranks/names';
import { ShareWin } from '../share/ShareWin';
import { leagueShare } from '../share/winText';

const KEY = 'hevalo_league_celebrated';

/** Whether last week moved this learner up or won the trophy. */
function isPromotion(week: LeagueWeekResult | null | undefined): week is LeagueWeekResult {
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
 * Moving up a league, celebrated once per week in this browser the first time the league is opened after the week
 * closes (Monday 00:00 UTC), with a word from Xezo. Staying or going down gets no celebration. The Share button (shared
 * `leagueWin`) names the league and place and nothing of the others in the group.
 */
export function LeagueMoment({ week }: { week: LeagueWeekResult | null | undefined }): React.JSX.Element | null {
  const t = useT();
  const promoted = isPromotion(week);
  const [open, setOpen] = useState(() => promoted && seenWeek() !== week.weekKey);
  useCelebrationHold(open);
  const cheered = promoted && open;
  useEffect(() => (cheered ? sayReactionLater(reactionDelayMs('celebration', prefersReducedMotion()), { moment: 'promoted' }) : undefined), [cheered]);
  if (!promoted || !open) return null;
  const tier = (week.tierAfter ?? week.tier)!;
  const metal = ART_LEAGUE_METAL[tier];
  const close = (): void => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, week.weekKey);
    } catch {
      // Without storage it may be celebrated again next time, which is harmless.
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
