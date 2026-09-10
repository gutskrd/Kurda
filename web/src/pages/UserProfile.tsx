import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FriendStatus, PublicProfile } from '../lib/types';
import { FullProfile, type FullProfileView } from '../profile/FullProfile';
import { ProfileFriends } from '../profile/ProfileFriends';
import { UserActions } from '../profile/UserActions';
import { ProfileActivity } from '../profile/ProfileActivity';
import { countryName } from '../lib/countries';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

/** Another user's full MyKurda profile (/app/users/:id), privacy-gated. */
export function UserProfile(): React.JSX.Element {
  const { id = '' } = useParams();
  const { client } = useAuth();
  const t = useT();
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
      else setError(r.ok ? t('profile.notLoaded') : describeError(r.error));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, attempt, t]);

  if (loading) return <Loading label={t('profile.loading')} />;
  if (error || !profile) return <ErrorState title={t('profile.loadFailed')} message={error ?? t('profile.unavailable')} onRetry={() => setAttempt((n) => n + 1)} />;

  const name = profile.displayName || profile.username;

  // privacy-hidden: identity is still shown so you can send a friend request
  if (profile.private) {
    return (
      <div className="container container-narrow">
        <div className="card" style={{ marginTop: 24, textAlign: 'center' }}>
          <h1 className="page-title" style={{ marginTop: 0 }}>{name}</h1>
          <p className="page-sub" style={{ margin: '8px auto 18px' }}>{t('profile.private')}</p>
          <FriendActions userId={profile.userId} username={profile.username} status={profile.friendStatus} />
        </div>
      </div>
    );
  }

  const view: FullProfileView = {
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
    country: profile.country ? { code: profile.country, name: countryName(profile.country) ?? profile.country } : null,
  };

  return (
    <FullProfile
      view={view}
      headerAction={<FriendActions userId={profile.userId} username={profile.username} status={profile.friendStatus} />}
      activity={
        <>
          <ProfileFriends userId={profile.userId} />
          <ProfileActivity userId={profile.userId} sections={profile.sections} />
        </>
      }
      sidebarExtra={
        <>
          {profile.tier && <div className="mkp-info-row"><span className="l">{t('profile.stat.league')}</span><span className="n" style={{ textTransform: 'capitalize', fontSize: '1rem' }}>{profile.tier}</span></div>}
          {profile.rating !== undefined && <div className="mkp-info-row"><span className="l">{t('profile.stat.rating')}</span><span className="n">{profile.rating}</span></div>}
          {/* only once they have actually played ranked — a place beside a
              default rating would read as a standing they have not earned */}
          {profile.rank != null && (
            <div className="mkp-info-row">
              <span className="l">{t('profile.stat.rank')}</span>
              <span className="n">#{profile.rank.toLocaleString()}</span>
            </div>
          )}
          {profile.achievements !== undefined && <div className="mkp-info-row"><span className="l">{t('profile.stat.achievements')}</span><span className="n">{profile.achievements}</span></div>}
        </>
      }
    />
  );
}

/** Message + friend-request controls for another user (drives off friendStatus). */
function FriendActions({ userId, username, status }: { userId: string; username: string; status: FriendStatus }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
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
      {t('profile.message')}
    </Button>
  );

  return (
    <div className="mkp-actions">
      {state === 'self' && <Link to="/app/profile" className="mkp-edit">{t('profile.yours')}</Link>}
      {state === 'friends' && message}
      {state === 'none' && <Button size="sm" onClick={() => void add()} disabled={busy}>{busy ? t('profile.sending') : t('profile.addFriend')}</Button>}
      {state === 'pending_out' && <Button size="sm" disabled>{t('profile.requestSent')}</Button>}
      {state === 'pending_in' && (
        <>
          <Button size="sm" onClick={() => void accept()} disabled={busy}>{busy ? t('profile.accepting') : t('profile.acceptRequest')}</Button>
          {message}
        </>
      )}
      {/*
        The same menu as the profile card, for the same reasons — and it has to
        be the same component, or blocking and reporting would end up with two
        sets of wording and two sets of rules about what happens next.
      */}
      {state !== 'self' && (
        <UserActions
          userId={userId}
          name={username}
          onBlocked={() => {
            // their profile answers 404 to you from here on, so staying on it
            // would show an error where a person used to be
            navigate('/app');
          }}
        />
      )}
    </div>
  );
}
