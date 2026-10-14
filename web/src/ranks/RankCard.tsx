import { Link } from 'react-router-dom';
import { SHIELD_GAMES, type RankCard as RankCardData } from '@kurda/shared';
import { ChevronIcon, ShieldIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { PlacementEmblem, RankEmblem } from './art';
import { gameName, rankLabel, rankTierNamed, withMeaning, type Translate } from './names';

/**
 * One game's rank, as the Games page shows it (contract 4 §U): the emblem,
 * the tier and division with its meaning, the points, how far to the next
 * division, and the small marks that explain the rest — "Placing 2/5" before
 * there is a tier, a "?" while the rank is still settling, the shield's games
 * after a new tier, and "Resting" after four weeks without a rated game.
 *
 * Nothing here counts down or warns. The bar shows how far you have come in
 * this division, not how far you could fall.
 *
 * `href` adds the way to the game's Ranks page (its boards and the climb).
 */
export function RankCard({ rank, compact = false, href }: { rank: RankCardData; compact?: boolean; href?: string }): React.JSX.Element {
  const t = useT();
  const placing = rank.placement !== null || rank.tier === null;
  const tierClass = placing ? 'is-placing' : `tier-${rank.tier}`;
  const size = compact ? 64 : 88;
  return (
    <article className={`rank-card ${tierClass}${compact ? ' is-compact' : ''}`} aria-label={gameName(t, rank.game)}>
      <div className="rank-card-art">
        {placing || !rank.tier ? (
          <PlacementEmblem done={rank.placement?.played ?? 0} size={size} title={placingLabel(t, rank)} />
        ) : (
          <RankEmblem tier={rank.tier} division={rank.division} size={size} title={withMeaning(t, { ...rankTierNamed(t, rank.tier), name: rankLabel(t, rank.tier, rank.division) })} />
        )}
      </div>
      <div className="rank-card-body">
        <span className="rank-card-game">{gameName(t, rank.game)}</span>
        {placing || !rank.tier ? <PlacingBody rank={rank} /> : <RankedBody rank={rank} />}
        {href && (
          <Link to={href} className="rank-card-more">
            {t('ranks.openBoards')}
            <ChevronIcon size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}

function placingLabel(t: Translate, rank: RankCardData): string {
  const p = rank.placement ?? { played: 0, of: 5 };
  return t('ranks.placing', { played: p.played, of: p.of });
}

function PlacingBody({ rank }: { rank: RankCardData }): React.JSX.Element {
  const t = useT();
  const p = rank.placement ?? { played: 0, of: 5 };
  return (
    <>
      <h3 className="rank-card-tier">{p.played === 0 ? t('ranks.unplaced') : placingLabel(t, rank)}</h3>
      <p className="rank-card-hint">{t('ranks.placingHint', { of: p.of })}</p>
    </>
  );
}

function RankedBody({ rank }: { rank: RankCardData }): React.JSX.Element {
  const t = useT();
  const tier = rank.tier!;
  const named = rankTierNamed(t, tier);
  const progress = rank.progress;
  const next = progress?.next ? rankLabel(t, progress.next.tier, progress.next.division) : null;
  return (
    <>
      <h3 className="rank-card-tier">
        {rankLabel(t, tier, rank.division)}
        {named.meaning && <span className="rank-card-meaning">{named.meaning}</span>}
      </h3>
      <p className="rank-card-points">
        <span className="rank-card-num">{rank.points.toLocaleString()}</span>
        <span className="rank-card-unit">{t('ranks.pointsUnit')}</span>
        {rank.provisional && (
          <span className="rank-card-q" title={t('ranks.provisionalHint')}>
            <span aria-hidden="true">?</span>
            <span className="sr-only">{t('ranks.provisionalHint')}</span>
          </span>
        )}
        {rank.resting && <span className="rank-card-tag">{t('ranks.resting')}</span>}
      </p>
      {progress && (
        <div className="rank-progress">
          <div
            className="rank-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.fraction * 100)}
            aria-label={next ? t('ranks.toNext', { points: progress.pointsToGo ?? 0, next }) : t('ranks.topOfClimb')}
          >
            <span className="rank-progress-fill" style={{ width: `${Math.max(3, progress.fraction * 100)}%` }} />
          </div>
          <span className="rank-progress-label">
            {next ? t('ranks.toNext', { points: progress.pointsToGo ?? 0, next }) : tier === 'sterk' ? t('ranks.sterkHint') : t('ranks.topOfClimb')}
          </span>
        </div>
      )}
      {rank.shieldGames > 0 && <ShieldPips games={rank.shieldGames} tierName={named.name} />}
      {rank.resting && <p className="rank-card-hint">{t('ranks.restingHint')}</p>}
    </>
  );
}

/** The shield's games left, as pips and in words: it is never only the icons. */
export function ShieldPips({ games, tierName }: { games: number; tierName: string }): React.JSX.Element {
  const t = useT();
  return (
    <p className="rank-shield" title={t('ranks.shieldHint', { count: games, tier: tierName })}>
      <span className="rank-shield-pips" aria-hidden="true">
        {Array.from({ length: SHIELD_GAMES }, (_, i) => (
          <span key={i} className={`rank-shield-pip${i < games ? ' is-on' : ''}`}>
            <ShieldIcon size={12} />
          </span>
        ))}
      </span>
      <span>{t('ranks.shield', { count: games })}</span>
      <span className="sr-only">{t('ranks.shieldHint', { count: games, tier: tierName })}</span>
    </p>
  );
}
