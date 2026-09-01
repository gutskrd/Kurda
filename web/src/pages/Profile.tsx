import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile, UserSummary, WalletBalances } from '../lib/types';
import { CosmeticBackground, IconOverlay } from '../profile/cosmetic-parts';
import { Loading, ErrorState } from '../components/states';
import { PersonGlyph } from '../components/icons';

/**
 * Full profile — a read-only, Steam-style showcase of the signed-in user: a
 * full-bleed equipped background (contained to the profile, never the whole
 * site), a framed avatar with its premium-icon overlay, a hexagon Level badge +
 * featured box, showcase boxes on the left, and a "Currently Online" info panel
 * on the right. All editing lives on the separate Edit Profile page.
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
  const xp = me.level?.xp ?? me.xp;
  const favPoem = me.favoritePoem ?? null;
  const favStory = me.favoriteStory ?? null;

  return (
    <div className={`steam-page${me.background ? ' steam-has-bg' : ''}`}>
      {me.background && <CosmeticBackground background={me.background} className="steam-bg" />}

      <div className="steam-wrap">
        {/* header: avatar | identity | level column */}
        <header className="steam-head">
          <span className="steam-avatar hero-avatar-wrap">
            {avatar ? (
              <img src={avatar} alt="" className="steam-avatar-img" />
            ) : (
              <span className="steam-avatar-img avatar-fallback" aria-hidden="true"><PersonGlyph size={72} /></span>
            )}
            {me.icon && <IconOverlay icon={me.icon} />}
          </span>

          <div className="steam-id-text">
            <div className="steam-name">
              {name}
              {me.premium && <span className="steam-premium">Premium</span>}
            </div>
            <div className="steam-sub">@{me.username}</div>
          </div>

          <div className="steam-level-col">
            <div className="steam-level-line">Level <span className="steam-hex">{level}</span></div>
            <div className="steam-featured">
              <span className="steam-featured-badge">
                {me.icon ? <img src={me.icon.url} alt="" /> : <PersonGlyph size={26} />}
              </span>
              <span className="steam-featured-text">
                <span className="steam-featured-title">Level {level}</span>
                <span className="steam-featured-sub">{xp.toLocaleString()} XP</span>
              </span>
            </div>
            <Link to="/app/profile/edit" className="steam-edit">Edit Profile</Link>
          </div>
        </header>

        {/* body: showcases | info sidebar */}
        <div className="steam-body">
          <main className="steam-main">
            <div className="steam-showcase-block">
              <div className="steam-showcase-label">About</div>
              <div className="steam-showcase">
                {me.bio ? <p className="steam-bio">{me.bio}</p> : <p className="steam-bio muted">No bio yet.</p>}
              </div>
            </div>

            {favPoem && (
              <div className="steam-showcase-block">
                <div className="steam-showcase-label">Favorite Poem</div>
                <div className="steam-showcase">
                  <Link to="/poems" className="steam-fav">
                    <span className="steam-fav-thumb" aria-hidden="true">✒️</span>
                    <span className="steam-fav-meta"><span className="steam-fav-title">{favPoem.title}</span></span>
                  </Link>
                </div>
              </div>
            )}

            {favStory && (
              <div className="steam-showcase-block">
                <div className="steam-showcase-label">Favorite Story</div>
                <div className="steam-showcase">
                  <Link to="/stories" className="steam-fav">
                    <span className="steam-fav-thumb" aria-hidden="true">📖</span>
                    <span className="steam-fav-meta"><span className="steam-fav-title">{favStory.title}</span></span>
                  </Link>
                </div>
              </div>
            )}
          </main>

          <aside className="steam-side">
            <div className="steam-online">
              <div className="steam-online-title">Currently Online</div>
              <div className="steam-online-sub">@{me.username}</div>
              <div className="steam-info-row"><span className="l">Level</span><span className="n">{level}</span></div>
              <div className="steam-info-row"><span className="l">XP</span><span className="n">{xp.toLocaleString()}</span></div>
              <div className="steam-info-row"><span className="l">Streak</span><span className="n">{me.streak.current}</span></div>
              <div className="steam-info-row"><span className="l">Zêr</span><span className="n">{zer === null ? '—' : zer.toLocaleString()}</span></div>
              <Link className="steam-info-row steam-info-link" to="/app/friends">
                <span className="l">Friends</span><span className="n">{friendCount === null ? '—' : friendCount}</span>
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
