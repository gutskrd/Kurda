import { Link } from 'react-router-dom';
import type { FavoriteRef, ProfileBackground, ProfileIcon } from '../lib/types';
import { flagUrl } from '../lib/countries';
import { CosmeticBackground, IconOverlay } from './cosmetic-parts';
import { PersonGlyph } from '../components/icons';

/** Normalized data a MyKurda profile renders (self or another user). */
export interface FullProfileView {
  name: string;
  username: string;
  avatarUrl?: string | null;
  icon?: ProfileIcon | null;
  background?: ProfileBackground | null;
  premium?: boolean;
  level: number;
  xp: number;
  streakDays: number;
  bio?: string | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  online?: boolean;
  country?: { code: string; name: string } | null;
}

/**
 * Full-bleed, MyKurda profile shell used by both the signed-in user's page
 * and other users' pages. Renders the background, header (avatar + identity +
 * level/featured), showcases (About / favorites) and the info sidebar with the
 * base Level / XP / Streak rows. Callers pass the right-column action(s) and any
 * extra sidebar content (self: Zêr + stacks; other: tier/rating).
 */
export function FullProfile({
  view,
  headerAction,
  sidebarExtra,
}: {
  view: FullProfileView;
  headerAction?: React.ReactNode;
  sidebarExtra?: React.ReactNode;
}): React.JSX.Element {
  const online = view.online ?? false;
  return (
    <div className={`mkp-page${view.background ? ' mkp-has-bg' : ''}`}>
      {view.background && (
        <>
          <CosmeticBackground background={view.background} className="mkp-bg" />
          {/* its own element, not ::after: the scrim has to be pinned to the
              viewport alongside the picture, not to the page box */}
          <div className="mkp-scrim" aria-hidden />
        </>
      )}

      <div className="mkp-wrap">
        <header className="mkp-head">
          <span className="mkp-avatar hero-avatar-wrap">
            {view.avatarUrl ? (
              <img src={view.avatarUrl} alt="" className="mkp-avatar-img" />
            ) : (
              <span className="mkp-avatar-img avatar-fallback" aria-hidden="true"><PersonGlyph size={72} /></span>
            )}
            {view.icon && <IconOverlay icon={view.icon} />}
          </span>

          <div className="mkp-id-text">
            <div className="mkp-name">
              {view.name}
              {view.premium && <span className="mkp-premium">Premium</span>}
            </div>
            <div className="mkp-sub">@{view.username}</div>
            {view.country && (
              <div className="mkp-country">
                <img className="flag" src={flagUrl(view.country.code)} alt="" width={22} height={16} loading="lazy" />
                <span>{view.country.name}</span>
              </div>
            )}
          </div>

          <div className="mkp-level-col">
            <div className="mkp-level-line">Level <span className="mkp-hex">{view.level}</span></div>
            <div className="mkp-featured">
              <span className="mkp-featured-badge">
                {view.icon ? <img src={view.icon.url} alt="" /> : <PersonGlyph size={26} />}
              </span>
              <span className="mkp-featured-text">
                <span className="mkp-featured-title">Level {view.level}</span>
                <span className="mkp-featured-sub">{view.xp.toLocaleString()} XP</span>
              </span>
            </div>
            {headerAction}
          </div>
        </header>

        <div className="mkp-body">
          <main className="mkp-main">
            <div className="mkp-showcase-block">
              <div className="mkp-showcase-label">About</div>
              <div className="mkp-showcase">
                {view.bio ? <p className="mkp-bio">{view.bio}</p> : <p className="mkp-bio muted">No bio yet.</p>}
              </div>
            </div>

            {view.favPoem && (
              <div className="mkp-showcase-block">
                <div className="mkp-showcase-label">Favorite Poem</div>
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
                <div className="mkp-showcase-label">Favorite Story</div>
                <div className="mkp-showcase">
                  <Link to="/stories" className="mkp-fav">
                    <span className="mkp-fav-thumb" aria-hidden="true">📖</span>
                    <span className="mkp-fav-meta"><span className="mkp-fav-title">{view.favStory.title}</span></span>
                  </Link>
                </div>
              </div>
            )}
          </main>

          <aside className="mkp-side">
            <div className="mkp-online">
              <div className={`mkp-online-title${online ? '' : ' is-offline'}`}>{online ? 'Currently Online' : 'Offline'}</div>
              <div className="mkp-online-sub">@{view.username}</div>

              <div className="mkp-info-row"><span className="l">Level</span><span className="n">{view.level}</span></div>
              <div className="mkp-info-row"><span className="l">XP</span><span className="n">{view.xp.toLocaleString()}</span></div>
              <div className="mkp-info-row"><span className="l">Streak</span><span className="n">{view.streakDays}</span></div>

              {sidebarExtra}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
