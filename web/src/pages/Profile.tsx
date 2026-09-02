import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { InventoryItem, MeProfile, UserSummary, WalletBalances } from '../lib/types';
import { SteamProfile, type SteamProfileView } from '../profile/SteamProfile';
import { AvatarStack } from '../components/AvatarStack';
import { Loading, ErrorState } from '../components/states';

/**
 * The signed-in user's own full profile — a read-only, Steam-style showcase. All
 * editing lives on /app/profile/edit (reached from the Edit Profile button). The
 * sidebar adds private-to-you rows: Zêr, an owned-icon stack, and a friend stack.
 */
export function Profile(): React.JSX.Element {
  const { client } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [friends, setFriends] = useState<UserSummary[]>([]);
  const [icons, setIcons] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [m, w, f, inv] = await Promise.all([
        client.get<{ user: MeProfile }>('/me'),
        client.get<{ balances: WalletBalances }>('/me/wallet'),
        client.get<{ friends: UserSummary[] }>('/friends'),
        client.get<{ items: InventoryItem[] }>('/me/inventory'),
      ]);
      if (cancelled) return;
      if (m.ok && m.data?.user?.username) setMe(m.data.user);
      else setError(m.ok ? 'Your profile could not be loaded.' : describeError(m.error));
      if (w.ok) setZer(w.data.balances.zer);
      if (f.ok) setFriends(f.data.friends ?? []);
      if (inv.ok) setIcons((inv.data.items ?? []).filter((i) => i.category === 'icon'));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error || !me) return <ErrorState title="Couldn’t load your profile" message={error ?? 'Unavailable.'} onRetry={() => setReloadKey((n) => n + 1)} />;

  const view: SteamProfileView = {
    name: me.displayName || me.username,
    username: me.username,
    avatarUrl: me.avatarUrl ?? me.profilePhotoUrl,
    icon: me.icon ?? null,
    background: me.background ?? null,
    premium: me.premium,
    level: me.level?.level ?? 1,
    xp: me.level?.xp ?? me.xp,
    streakDays: me.streak.current,
    bio: me.bio,
    favPoem: me.favoritePoem ?? null,
    favStory: me.favoriteStory ?? null,
    online: true, // viewing your own profile → you're online
  };

  return (
    <SteamProfile
      view={view}
      headerAction={<Link to="/app/profile/edit" className="steam-edit">Edit Profile</Link>}
      sidebarExtra={
        <>
          <div className="steam-info-row"><span className="l">Zêr</span><span className="n">{zer === null ? '—' : zer.toLocaleString()}</span></div>

          {icons.length > 0 && (
            <div className="steam-collection">
              <div className="steam-collection-head"><span className="l">Icons</span><span className="n">{icons.length}</span></div>
              <AvatarStack urls={icons.map((i) => i.assetUrl)} total={icons.length} square emptyGlyph={false} />
            </div>
          )}

          <Link className="steam-collection steam-collection-link" to="/app/friends">
            <div className="steam-collection-head"><span className="l">Friends</span><span className="n">{friends.length}</span></div>
            {friends.length > 0 && <AvatarStack urls={friends.map((f) => f.avatarUrl)} total={friends.length} />}
          </Link>
        </>
      }
    />
  );
}
