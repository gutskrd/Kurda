import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { seasonById, type MyRanks, type RankTier, type SeasonEmblem, type SeasonOverview } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { ArrowIcon, GemIcon } from '../components/icons';
import { Button } from '../components/Button';
import { ErrorState, Loading } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';
import { RankEmblem, SeasonFrame, frameTier } from './art';
import { gameName, rankTierNamed, seasonDaysLeft, seasonNamed, withMeaning } from './names';
import { useAvatarSrc } from '../art/overrides';

/**
 * The season (contract 4 §R5, §U): its name, the days left said calmly, what
 * each tier earns at the end, how this season is going in each game, and the
 * emblems of seasons past — kept for good.
 *
 * The rewards are cosmetic and a few Gems, and the page says what earns them
 * (enough rated games in a game this season) rather than counting down to
 * them. A frame earned before can be worn from here.
 */
export function SeasonPage(): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [overview, setOverview] = useState<SeasonOverview | null>(null);
  const [mine, setMine] = useState<MyRanks | null>(null);
  const [emblems, setEmblems] = useState<SeasonEmblem[]>([]);
  // the frame worn now, from your own public profile (where everyone else sees it)
  const [frameSku, setFrameSku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [o, m, e, p] = await Promise.all([
      client.get<SeasonOverview>('/ranks/seasons/current'),
      client.get<MyRanks>('/ranks/me'),
      client.get<{ emblems: SeasonEmblem[] }>('/ranks/seasons/me'),
      user ? client.get<{ frameSku?: string | null }>(`/users/${user.id}`) : Promise.resolve(null),
    ]);
    if (p?.ok) setFrameSku(p.data.frameSku ?? null);
    if (o.ok) setOverview(o.data);
    else setError(describeError(o.error, t));
    if (m.ok) setMine(m.data);
    if (e.ok) setEmblems(e.data.emblems ?? []);
  }, [client, t, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !overview) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!overview) return <Loading />;

  const season = overview.season;
  const named = seasonNamed(t, season);
  // the season's last day: it ends as the next one begins, at midnight UTC
  const ends = new Date(new Date(season.endsAt).getTime() - 1).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  const past = groupBySeason(emblems.filter((e) => e.seasonId !== season.id));

  return (
    <div className="container season-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('seasons.eyebrow')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>
            {named.name}
          </h1>
        </div>
      </div>

      <section className={`season-hero season-${season.name}`}>
        <div className="season-hero-text">
          {named.meaning && <p className="season-hero-meaning">{named.meaning}</p>}
          <p className="season-hero-days">
            {seasonDaysLeft(t, season.daysLeft)}
            <span className="season-hero-ends">{t('seasons.ends', { date: ends })}</span>
          </p>
          <p className="season-hero-sub">{t('seasons.sub')}</p>
        </div>
      </section>

      {mine && (
        <section className="season-block" aria-labelledby="season-progress">
          <h2 id="season-progress" className="badges-section-title">
            {t('seasons.thisSeason')}
          </h2>
          <ul className="season-progress">
            {mine.ranks.map((r) => {
              const enough = r.season.ratedGames >= overview.minGames;
              const peak = r.season.peakTier;
              return (
                <li key={r.game} className={`season-game${peak ? ` tier-${peak}` : ''}`}>
                  {peak ? (
                    <RankEmblem tier={peak} size={52} title={withMeaning(t, rankTierNamed(t, peak))} />
                  ) : (
                    <span className="season-game-blank" aria-hidden="true" />
                  )}
                  <span className="season-game-text">
                    <span className="season-game-name">{gameName(t, r.game)}</span>
                    <span className="season-game-meta">
                      {peak ? t('seasons.peak', { tier: rankTierNamed(t, peak).name }) : r.season.ratedGames > 0 ? t('ranks.placingShort') : t('seasons.noPeak')}
                    </span>
                  </span>
                  <span className={`season-game-count${enough ? ' is-enough' : ''}`}>
                    {t('seasons.games', { count: Math.min(r.season.ratedGames, overview.minGames), min: overview.minGames })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="season-block" aria-labelledby="season-rewards">
        <h2 id="season-rewards" className="badges-section-title">
          {t('seasons.rewards')}
        </h2>
        <p className="season-block-help">{t('seasons.rewardsHelp', { count: overview.minGames })}</p>
        <ul className="season-rewards">
          {overview.rewards.map((r) => (
            <RewardRow key={r.tier} tier={r.tier} gems={r.gems} avatarUrl={user?.avatarUrl ?? null} />
          ))}
        </ul>
      </section>

      <section className="season-block" aria-labelledby="season-past">
        <h2 id="season-past" className="badges-section-title">
          {t('seasons.past')}
        </h2>
        {overview.lastSeason?.reward && <LastReward reward={overview.lastSeason.reward} worn={frameSku} onWorn={setFrameSku} />}
        {past.length === 0 ? (
          <p className="season-block-help">{t('seasons.pastNone')}</p>
        ) : (
          past.map(([id, list]) => {
            const s = seasonById(id);
            return (
              <div key={id} className="season-past">
                <h3 className="season-past-title">{seasonNamed(t, s).name}</h3>
                <ul className="season-past-list">
                  {list.map((e) => (
                    <li key={`${e.seasonId}:${e.game}`} className={`season-past-item tier-${e.peakTier}`}>
                      <RankEmblem
                        tier={e.peakTier}
                        season={{ name: s.name, year: s.year }}
                        size={84}
                        title={t('seasons.emblemTitle', { tier: withMeaning(t, rankTierNamed(t, e.peakTier)), season: seasonNamed(t, s).name })}
                      />
                      <span className="season-past-game">{gameName(t, e.game)}</span>
                      <span className="season-past-tier">{rankTierNamed(t, e.peakTier).name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function groupBySeason(list: SeasonEmblem[]): Array<[string, SeasonEmblem[]]> {
  const map = new Map<string, SeasonEmblem[]>();
  for (const e of list) map.set(e.seasonId, [...(map.get(e.seasonId) ?? []), e]);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/** One tier's reward: its emblem, the frame in its colour (round your own face), and the Gems. */
function RewardRow({ tier, gems, avatarUrl }: { tier: RankTier; gems: number; avatarUrl: string | null }): React.JSX.Element {
  const t = useT();
  const named = rankTierNamed(t, tier);
  const face = useAvatarSrc(avatarUrl);
  return (
    <li className={`season-reward tier-${tier}`}>
      <RankEmblem tier={tier} size={56} title={withMeaning(t, named)} />
      <span className="season-reward-name">
        <span className="season-reward-tier">{named.name}</span>
        {named.meaning && <span className="season-reward-meaning">{named.meaning}</span>}
      </span>
      <span className="season-reward-frame">
        <SeasonFrame tier={tier} size={56} title={t('seasons.frameTitle', { tier: named.name })}>
          {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
        </SeasonFrame>
      </span>
      <span className="season-reward-gems">
        <GemIcon size={15} />
        {t('seasons.gems', { gems })}
      </span>
      {(tier === 'lutke' || tier === 'sterk') && (
        <span className="season-reward-extra">{tier === 'sterk' ? t('seasons.sterkTitle') : t('seasons.animated')}</span>
      )}
    </li>
  );
}

/** What last season handed out, and its frame to wear (or take off). */
function LastReward({
  reward,
  worn,
  onWorn,
}: {
  reward: NonNullable<NonNullable<SeasonOverview['lastSeason']>['reward']>;
  worn: string | null;
  onWorn: (sku: string | null) => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const wearing = reward.frameSku !== null && worn === reward.frameSku;
  const tier = frameTier(reward.frameSku) ?? reward.tier;
  const face = useAvatarSrc(user?.avatarUrl);

  async function wear(on: boolean): Promise<void> {
    setBusy(true);
    const sku = on ? reward.frameSku : null;
    const res = await client.put('/me/cosmetics/frame', { sku });
    setBusy(false);
    if (res.ok) onWorn(sku);
  }

  return (
    <div className={`season-last tier-${tier}`}>
      <SeasonFrame tier={tier} size={72} title={t('seasons.frameTitle', { tier: rankTierNamed(t, tier).name })}>
        {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
      </SeasonFrame>
      <div className="season-last-text">
        <p className="season-last-title">{t('seasons.lastReward', { tier: rankTierNamed(t, reward.tier).name })}</p>
        <p className="season-last-meta">
          <GemIcon size={14} />
          {t('seasons.gems', { gems: reward.gems })}
          {reward.title && <span className="season-last-chip">{reward.title}</span>}
        </p>
      </div>
      {reward.frameSku && (
        <Button variant={wearing ? 'ghost' : 'secondary'} size="sm" disabled={busy} onClick={() => void wear(!wearing)}>
          {wearing ? t('seasons.removeFrame') : t('seasons.wearFrame')}
        </Button>
      )}
    </div>
  );
}

