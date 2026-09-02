import { Link } from 'react-router-dom';
import type { FavoriteRef, ProfileBackground, ProfileIcon } from '../lib/types';
import { flagUrl } from '../lib/countries';
import { CosmeticBackground, IconOverlay } from './cosmetic-parts';
import { PersonGlyph } from '../components/icons';

/** Normalized data a Steam-style profile renders (self or another user). */
export interface SteamProfileView {
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
 * Full-bleed, Steam-style profile shell used by both the signed-in user's page
 * and other users' pages. Renders the background, header (avatar + identity +
 * level/featured), showcases (About / favorites) and the info sidebar with the
 * base Level / XP / Streak rows. Callers pass the right-column action(s) and any
 * extra sidebar content (self: Zêr + stacks; other: tier/rating).
 */
export function SteamProfile({
  view,
  headerAction,
  sidebarExtra,
}: {
  view: SteamProfileView;
  headerAction?: React.ReactNode;
  sidebarExtra?: React.ReactNode;
}): React.JSX.Element {
  const online = view.online ?? false;
  return (
    <div className={`steam-page${view.background ? ' steam-has-bg' : ''}`}>
      {view.background && <CosmeticBackground background={view.background} className="steam-bg" />}

      <div className="steam-wrap">
        <header className="steam-head">
          <span className="steam-avatar hero-avatar-wrap">
            {view.avatarUrl ? (
              <img src={view.avatarUrl} alt="" className="steam-avatar-img" />
            ) : (
              <span className="steam-avatar-img avatar-fallback" aria-hidden="true"><PersonGlyph size={72} /></span>
            )}
            {view.icon && <IconOverlay icon={view.icon} />}
          </span>

          <div className="steam-id-text">
            <div className="steam-name">
              {view.name}
              {view.premium && <span className="steam-premium">Premium</span>}
            </div>
            <div className="steam-sub">@{view.username}</div>
            {view.country && (
              <div className="steam-country">
                <img className="flag" src={flagUrl(view.country.code)} alt="" width={22} height={16} loading="lazy" />
                <span>{view.country.name}</span>
              </div>
            )}
          </div>

          <div className="steam-level-col">
            <div className="steam-level-line">Level <span className="steam-hex">{view.level}</span></div>
            <div className="steam-featured">
              <span className="steam-featured-badge">
                {view.icon ? <img src={view.icon.url} alt="" /> : <PersonGlyph size={26} />}
              </span>
              <span className="steam-featured-text">
                <span className="steam-featured-title">Level {view.level}</span>
                <span className="steam-featured-sub">{view.xp.toLocaleString()} XP</span>
              </span>
            </div>
            {headerAction}
          </div>
        </header>

        <div className="steam-body">
          <main className="steam-main">
            <div className="steam-showcase-block">
              <div className="steam-showcase-label">About</div>
              <div className="steam-showcase">
                {view.bio ? <p className="steam-bio">{view.bio}</p> : <p className="steam-bio muted">No bio yet.</p>}
              </div>
            </div>

            {view.favPoem && (
              <div className="steam-showcase-block">
                <div className="steam-showcase-label">Favorite Poem</div>
                <div className="steam-showcase">
                  <Link to="/poems" className="steam-fav">
                    <span className="steam-fav-thumb" aria-hidden="true">✒️</span>
                    <span className="steam-fav-meta"><span className="steam-fav-title">{view.favPoem.title}</span></span>
                  </Link>
                </div>
              </div>
            )}

            {view.favStory && (
              <div className="steam-showcase-block">
                <div className="steam-showcase-label">Favorite Story</div>
                <div className="steam-showcase">
                  <Link to="/stories" className="steam-fav">
                    <span className="steam-fav-thumb" aria-hidden="true">📖</span>
                    <span className="steam-fav-meta"><span className="steam-fav-title">{view.favStory.title}</span></span>
                  </Link>
                </div>
              </div>
            )}
          </main>

          <aside className="steam-side">
            <div className="steam-online">
              <div className={`steam-online-title${online ? '' : ' is-offline'}`}>{online ? 'Currently Online' : 'Offline'}</div>
              <div className="steam-online-sub">@{view.username}</div>

              <div className="steam-info-row"><span className="l">Level</span><span className="n">{view.level}</span></div>
              <div className="steam-info-row"><span className="l">XP</span><span className="n">{view.xp.toLocaleString()}</span></div>
              <div className="steam-info-row"><span className="l">Streak</span><span className="n">{view.streakDays}</span></div>

              {sidebarExtra}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
