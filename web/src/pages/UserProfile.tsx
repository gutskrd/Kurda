import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FriendStatus, PublicProfile } from '../lib/types';
import { SteamProfile, type SteamProfileView } from '../profile/SteamProfile';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';

/** Another user's full Steam-style profile (/app/users/:id), privacy-gated. */
export function UserProfile(): React.JSX.Element {
  const { id = '' } = useParams();
  const { client } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await client.get<PublicProfile>(`/users/${id}`);
      if (cancelled) return;
      if (r.ok && r.data?.username) setProfile(r.data);
      else setError(r.ok ? 'This profile could not be loaded.' : describeError(r.error));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, attempt]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error || !profile) return <ErrorState title="Couldn’t load this profile" message={error ?? 'Unavailable.'} onRetry={() => setAttempt((n) => n + 1)} />;

  const name = profile.displayName || profile.username;

  // privacy-hidden: identity is still shown so you can send a friend request
  if (profile.private) {
    return (
      <div className="container container-narrow">
        <div className="card" style={{ marginTop: 24, textAlign: 'center' }}>
          <h1 className="page-title" style={{ marginTop: 0 }}>{name}</h1>
          <p className="page-sub" style={{ margin: '8px auto 18px' }}>This profile is private.</p>
          <FriendActions userId={profile.userId} username={profile.username} status={profile.friendStatus} />
        </div>
      </div>
    );
  }

  const view: SteamProfileView = {
    name,
    username: profile.username,
    avatarUrl: profile.avatarUrl ?? profile.profilePhotoUrl,
    icon: profile.icon ?? null,
    background: profile.background ?? null,
    premium: profile.premium,
    level: profile.level?.level ?? 1,
    xp: profile.level?.xp ?? profile.xp ?? 0,
    streakDays: profile.streak ?? 0,
    bio: profile.bio,
    favPoem: profile.favoritePoem ?? null,
    favStory: profile.favoriteStory ?? null,
    online: profile.online ?? false,
  };

  return (
    <SteamProfile
      view={view}
      headerAction={<FriendActions userId={profile.userId} username={profile.username} status={profile.friendStatus} />}
      sidebarExtra={
        <>
          {profile.tier && <div className="steam-info-row"><span className="l">League</span><span className="n" style={{ textTransform: 'capitalize', fontSize: '1rem' }}>{profile.tier}</span></div>}
          {profile.rating !== undefined && <div className="steam-info-row"><span className="l">Rating</span><span className="n">{profile.rating}</span></div>}
          {profile.achievements !== undefined && <div className="steam-info-row"><span className="l">Achievements</span><span className="n">{profile.achievements}</span></div>}
        </>
      }
    />
  );
}

/** Message + friend-request controls for another user (drives off friendStatus). */
function FriendActions({ userId, username, status }: { userId: string; username: string; status: FriendStatus }): React.JSX.Element {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<FriendStatus>(status);
  const [busy, setBusy] = useState(false);

  async function add(): Promise<void> {
    setBusy(true);
    const res = await client.post('/friends/requests', { userId });
    setBusy(false);
    if (res.ok) setState('pending_out');
  }
  async function accept(): Promise<void> {
    setBusy(true);
    const res = await client.post(`/friends/requests/${userId}/accept`);
    setBusy(false);
    if (res.ok) setState('friends');
  }

  const message = (
    <Button variant="secondary" size="sm" onClick={() => navigate(`/app/messages?to=${userId}&name=${encodeURIComponent(username)}`)}>
      Message
    </Button>
  );

  return (
    <div className="steam-actions">
      {state === 'self' && <Link to="/app/profile" className="steam-edit">Your profile</Link>}
      {state === 'friends' && message}
      {state === 'none' && <Button size="sm" onClick={() => void add()} disabled={busy}>{busy ? 'Sending…' : 'Add friend'}</Button>}
      {state === 'pending_out' && <Button size="sm" disabled>Request sent</Button>}
      {state === 'pending_in' && (
        <>
          <Button size="sm" onClick={() => void accept()} disabled={busy}>{busy ? 'Accepting…' : 'Accept request'}</Button>
          {message}
        </>
      )}
    </div>
  );
}
