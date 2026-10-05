import { Link } from 'react-router-dom';
import type { FavoriteRef, LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { flagUrl } from '../lib/countries';
import { GiftedNote } from './cosmetic-parts';
import { ProfileCard } from '../ui/ProfileCard';
import { useT } from '../i18n/I18nProvider';

/** Normalized data a Hevalo profile renders (self or another user). */
export interface FullProfileView {
  name: string;
  username: string;
  avatarUrl?: string | null;
  icon?: ProfileIcon | null;
  background?: ProfileBackground | null;
  premium?: boolean;
  level: number;
  /** the whole level, for the bar toward the next one; absent on older responses */
  levelInfo?: LevelInfo;
  xp: number;
  streakDays: number;
  bio?: string | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  online?: boolean;
  country?: { code: string; name: string } | null;
}

/**
 * Full-bleed, Hevalo profile shell used by both the signed-in user's page
 * and other users' pages. Renders the background, header (avatar + identity +
 * level/featured), showcases (About / favorites) and the info sidebar with the
 * base Level / XP / Streak rows. Callers pass the right-column action(s) and any
 * extra sidebar content (self: Zêr + stacks; other: tier/rating).
 */
export function FullProfile({
  view,
  headerAction,
  sidebarExtra,
  activity,
}: {
  view: FullProfileView;
  headerAction?: React.ReactNode;
  sidebarExtra?: React.ReactNode;
  /** what they have posted and played — below the showcases, above the fold on mobile */
  activity?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const online = view.online ?? false;
  return (
    <div className="mkp-page">
      <div className="mkp-wrap">
        {/*
          The same card as the profile popup and the front page's picture of
          one, only wider. The background used to fill the whole page behind
          a header of its own; it is the banner now, where it reads as theirs
          and the text below it stays on the app's own black.
        */}
        <ProfileCard
          wide
          name={view.name}
          username={view.username}
          avatarUrl={view.avatarUrl}
          background={view.background}
          icon={view.icon}
          premium={view.premium}
          online={online}
          level={view.levelInfo}
          aside={headerAction}
          meta={
            <>
              {view.country && (
                <div className="mkp-country">
                  <img className="flag" src={flagUrl(view.country.code)} alt="" width={22} height={16} loading="lazy" />
                  <span>{view.country.name}</span>
                </div>
              )}
              <GiftedNote background={view.background} icon={view.icon} />
            </>
          }
        />

        <div className="mkp-body">
          <main className="mkp-main">
            <div className="mkp-showcase-block">
              <div className="mkp-showcase-label">{t('profile.about')}</div>
              <div className="mkp-showcase">
                {view.bio ? <p className="mkp-bio">{view.bio}</p> : <p className="mkp-bio muted">{t('profile.noBio')}</p>}
              </div>
            </div>

            {view.favPoem && (
              <div className="mkp-showcase-block">
                <div className="mkp-showcase-label">{t('profile.favoritePoem')}</div>
                <div className="mkp-showcase">
                  <Link to="/poems" className="mkp-fav">
                    <span className="mkp-fav-thumb" aria-hidden="true">✒️</span>
                    <span className="mkp-fav-meta"><span className="mkp-fav-title">{view.favPoem.title}</span></span>
                  </Link>
                </div>
              </div>
            )}

            {view.favStory && (
              <div className="mkp-showcase-block">
                <div className="mkp-showcase-label">{t('profile.favoriteStory')}</div>
                <div className="mkp-showcase">
                  <Link to="/stories" className="mkp-fav">
                    <span className="mkp-fav-thumb" aria-hidden="true">📖</span>
                    <span className="mkp-fav-meta"><span className="mkp-fav-title">{view.favStory.title}</span></span>
                  </Link>
                </div>
              </div>
            )}
            {activity}
          </main>

          <aside className="mkp-side">
            <div className="mkp-online">
              <div className={`mkp-online-title${online ? '' : ' is-offline'}`}>{online ? t('profile.currentlyOnline') : t('profile.offline')}</div>
              <div className="mkp-online-sub">@{view.username}</div>

              <div className="mkp-info-row"><span className="l">{t('profile.stat.level')}</span><span className="n">{view.level}</span></div>
              <div className="mkp-info-row"><span className="l">XP</span><span className="n">{view.xp.toLocaleString()}</span></div>
              <div className="mkp-info-row"><span className="l">{t('profile.stat.streak')}</span><span className="n">{view.streakDays}</span></div>

              {sidebarExtra}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
