import { Link } from 'react-router-dom';
import { toLeagueTier, type ProfileLeague, type ProfileRank, type ShowcaseBadge } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { Medal } from '../badges/parts';
import { LeagueEmblem, PlacementEmblem, RankEmblem } from '../ranks/art';
import { badgeNamed, gameName, leagueName, leagueNamed, rankLabel, rankTierNamed, withMeaning } from '../ranks/names';

/**
 * What a profile shows of someone's play (contract 4 §U): the three badges
 * they chose, their rank in each game this season with the best they have
 * ever reached, and their league — every name translated, every emblem
 * labelled.
 *
 * A rank with no tier is handled, not printed as nothing: placing, resting
 * ("Resting" to others after four weeks without a rated game), or simply not
 * played. A league tier the server does not send is someone not taking part,
 * and shows nothing rather than a default.
 */
export function ProfileProgress({
  ranks,
  badges,
  league,
  own = false,
}: {
  ranks?: ProfileRank[];
  badges?: ShowcaseBadge[];
  league?: ProfileLeague | null;
  own?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const shown = (ranks ?? []).filter((r) => r.tier || r.placing || r.resting || r.bestTier);
  const leagueTier = toLeagueTier(league?.tier ?? null);
  const showcase = badges ?? [];
  if (shown.length === 0 && showcase.length === 0 && !leagueTier && !own) return null;

  return (
    <div className="mkp-showcase-block profile-progress">
      {(showcase.length > 0 || own) && (
        <>
          <div className="mkp-showcase-label profile-progress-head">
            {t('profile.badges')}
            {own && (
              <Link to="/app/badges" className="profile-progress-link">
                {t('profile.allBadges')}
              </Link>
            )}
          </div>
          <div className="mkp-showcase">
            {showcase.length > 0 ? (
              <ul className="profile-badges">
                {showcase.map((b) => {
                  const named = badgeNamed(t, b.key);
                  return (
                    <li key={b.key} className="profile-badge badge-medal">
                      <Medal view={b} size={72} />
                      <span className="profile-badge-name">{named.name}</span>
                      {named.meaning && <span className="profile-badge-meaning">{named.meaning}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mkp-bio muted">{t('profile.noBadges')}</p>
            )}
          </div>
        </>
      )}

      {(shown.length > 0 || leagueTier) && (
        <>
          <div className="mkp-showcase-label">{t('profile.ranks')}</div>
          <ul className="profile-ranks">
            {shown.map((r) => (
              <ProfileRankItem key={r.game} rank={r} />
            ))}
            {leagueTier && (
              <li className={`profile-rank league-${leagueTier}`}>
                <LeagueEmblem tier={leagueTier} size={56} title={withMeaning(t, leagueNamed(t, leagueTier))} />
                <span className="profile-rank-text">
                  <span className="profile-rank-game">{t('profile.stat.league')}</span>
                  <span className="profile-rank-tier">{leagueName(t, leagueTier)}</span>
                  {leagueNamed(t, leagueTier).meaning && <span className="profile-rank-best">{leagueNamed(t, leagueTier).meaning}</span>}
                </span>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function ProfileRankItem({ rank }: { rank: ProfileRank }): React.JSX.Element {
  const t = useT();
  // the emblem is the best this season, where there is one; the line says where they are now
  const emblemTier = rank.seasonPeakTier ?? rank.tier ?? rank.bestTier;
  let now: string;
  if (rank.resting) now = t('ranks.resting');
  else if (rank.placing || !rank.tier) now = t('ranks.placingShort');
  else now = rankLabel(t, rank.tier, rank.division);
  return (
    <li className={`profile-rank${emblemTier ? ` tier-${emblemTier}` : ''}${rank.resting ? ' is-resting' : ''}`}>
      {emblemTier && !rank.placing ? (
        <RankEmblem tier={emblemTier} size={56} title={t('profile.seasonBest', { tier: withMeaning(t, rankTierNamed(t, emblemTier)) })} />
      ) : (
        <PlacementEmblem done={0} size={56} title={t('ranks.placingShort')} />
      )}
      <span className="profile-rank-text">
        <span className="profile-rank-game">{gameName(t, rank.game)}</span>
        <span className="profile-rank-tier">{now}</span>
        {rank.bestTier && <span className="profile-rank-best">{t('profile.bestEver', { tier: rankTierNamed(t, rank.bestTier).name })}</span>}
      </span>
    </li>
  );
}
