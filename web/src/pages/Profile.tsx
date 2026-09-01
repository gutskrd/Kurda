import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile, UserSummary, WalletBalances } from '../lib/types';
import { CosmeticBackground, IconOverlay, PremiumPill } from '../profile/cosmetic-parts';
import { Loading, ErrorState } from '../components/states';
import { PersonGlyph } from '../components/icons';

/**
 * Full profile — a read-only, Steam-style showcase of the signed-in user. The
 * equipped profile background fills the card (contained to the profile, never the
 * whole site); the avatar carries its premium-icon overlay. All editing lives on
 * the separate Edit Profile page (reached via the button here).
 */
export function Profile(): React.JSX.Element {
  const { client } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [m, w, f] = await Promise.all([
        client.get<{ user: MeProfile }>('/me'),
        client.get<{ balances: WalletBalances }>('/me/wallet'),
        client.get<{ friends: UserSummary[] }>('/friends'),
      ]);
      if (cancelled) return;
      if (m.ok && m.data?.user?.username) setMe(m.data.user);
      else setError(m.ok ? 'Your profile could not be loaded.' : describeError(m.error));
      if (w.ok) setZer(w.data.balances.zer);
      if (f.ok) setFriendCount(f.data.friends.length);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error || !me) return <ErrorState title="Couldn’t load your profile" message={error ?? 'Unavailable.'} onRetry={() => setReloadKey((n) => n + 1)} />;

  const name = me.displayName || me.username;
  const avatar = me.avatarUrl ?? me.profilePhotoUrl;
  const level = me.level?.level ?? 1;
  const toNext = me.level ? Math.max(0, me.level.nextLevelXp - me.level.xp) : null;
  const favPoem = me.favoritePoem ?? null;
  const favStory = me.favoriteStory ?? null;

  return (
    <div className="container">
      <article className={`steam${me.background ? ' steam-has-bg' : ''}`}>
        {me.background && <CosmeticBackground background={me.background} className="steam-bg" />}

        <div className="steam-inner">
          <header className="steam-head">
            <div className="steam-id">
              <span className="steam-avatar hero-avatar-wrap">
                {avatar ? (
                  <img src={avatar} alt="" className="steam-avatar-img" />
                ) : (
                  <span className="avatar-fallback" aria-hidden="true"><PersonGlyph size={72} /></span>
                )}
                {me.icon && <IconOverlay icon={me.icon} />}
              </span>
              <div className="steam-id-text">
                <div className="steam-name">
                  {name}
                  {me.premium && <PremiumPill />}
                </div>
                <div className="steam-handle">@{me.username}</div>
              </div>
            </div>

            <div className="steam-level-col">
              <div className="steam-level-line">
                Level <span className="steam-level-badge">{level}</span>
              </div>
              {me.level && (
                <div className="steam-featured">
                  <div className="steam-featured-title">{me.level.xp.toLocaleString()} XP</div>
                  <div className="steam-featured-sub">{toNext?.toLocaleString()} XP to level {level + 1}</div>
                </div>
              )}
              <Link to="/app/profile/edit" className="btn btn-secondary btn-sm">Edit Profile</Link>
            </div>
          </header>

          <div className="steam-body">
            <main className="steam-main">
              <section className="steam-showcase">
                <h2 className="steam-showcase-title">About</h2>
                {me.bio ? <p className="steam-bio">{me.bio}</p> : <p className="muted steam-bio">No bio yet.</p>}
              </section>

              {(favPoem || favStory) && (
                <section className="steam-showcase">
                  <h2 className="steam-showcase-title">Favorites</h2>
                  <div className="steam-fav-list">
                    {favPoem && (
                      <Link to={`/poems`} className="steam-fav">
                        <span className="steam-fav-kind">Poem</span>
                        <span className="steam-fav-title">{favPoem.title}</span>
                      </Link>
                    )}
                    {favStory && (
                      <Link to={`/stories`} className="steam-fav">
                        <span className="steam-fav-kind">Story</span>
                        <span className="steam-fav-title">{favStory.title}</span>
                      </Link>
                    )}
                  </div>
                </section>
              )}
            </main>

            <aside className="steam-side">
              <div className="steam-panel">
                <h2 className="steam-panel-title">Currently Online</h2>
                <dl className="steam-stats">
                  <div className="steam-stat"><dt>Level</dt><dd>{level}</dd></div>
                  <div className="steam-stat"><dt>XP</dt><dd>{me.xp.toLocaleString()}</dd></div>
                  <div className="steam-stat"><dt>Streak</dt><dd>{me.streak.current} day{me.streak.current === 1 ? '' : 's'}</dd></div>
                  <div className="steam-stat"><dt>Zêr</dt><dd>{zer === null ? '—' : zer.toLocaleString()}</dd></div>
                </dl>
                <Link className="steam-stat steam-stat-link" to="/app/friends">
                  <dt>Friends</dt>
                  <dd>{friendCount === null ? '—' : friendCount}</dd>
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </article>
    </div>
  );
}
