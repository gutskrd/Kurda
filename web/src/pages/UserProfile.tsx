import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FriendStatus, PublicProfile, UserSummary } from '../lib/types';
import { FullProfile, type FullProfileView } from '../profile/FullProfile';
import { FRIENDS_SHOWN, ProfileFriends } from '../profile/ProfileFriends';
import { UserActions } from '../profile/UserActions';
import { ProfileActivity } from '../profile/ProfileActivity';
import { ProfileProgress } from '../profile/ProfileProgress';
import { ProfileTree } from '../tree/ProfileTree';
import { PlayWithButton } from '../play/PlayButtons';
import { AddFriendButton } from '../social/FriendTickets';
import { countryName } from '../lib/countries';
import { ErrorState } from '../components/states';
import { LockIcon } from '../components/icons';
import { ProfileCard } from '../ui/ProfileCard';
import { FullProfileSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';

/** Another user's full Hevalo profile (/app/users/:id), privacy-gated. */
export function UserProfile(): React.JSX.Element {
  const { id = '' } = useParams();
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friends, setFriends] = useState<{ friends: UserSummary[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      // their friends with their profile, so the page is drawn once, whole
      const [r, f] = await Promise.all([
        client.get<PublicProfile>(`/users/${id}`),
        client.get<{ friends: UserSummary[]; total?: number }>(`/users/${id}/friends?limit=${FRIENDS_SHOWN}`),
      ]);
      if (cancelled) return;
      const list = f.ok ? (f.data.friends ?? []) : [];
      setFriends(f.ok ? { friends: list, total: f.data.total ?? list.length } : null);
      if (r.ok && r.data?.username) setProfile(r.data);
      else setError(r.ok ? t('profile.notLoaded') : describeError(r.error, t));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, attempt, t]);

  if (loading) return <FullProfileSkeleton />;
  if (error || !profile) return <ErrorState title={t('profile.loadFailed')} message={error ?? t('profile.unavailable')} onRetry={() => setAttempt((n) => n + 1)} />;

  const name = profile.displayName || profile.username;

  // privacy-hidden: who it is is still shown, in the same card as anybody's, so that you can ask to be friends
  if (profile.private) {
    return (
      <div className="mkp-page">
        <div className="mkp-wrap">
          <ProfileCard
            wide
            name={name}
            username={profile.username}
            avatarUrl={profile.avatarUrl ?? profile.profilePhotoUrl}
            aside={<FriendActions userId={profile.userId} username={profile.username} status={profile.friendStatus} />}
            meta={
              <p className="mkp-private">
                <LockIcon size={15} />
                {t('profile.private')}
              </p>
            }
          />
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
    levelInfo: profile.level,
    xp: profile.level?.xp ?? profile.xp ?? 0,
    streakDays: profile.streak ?? 0,
    // how many they know is theirs to show or not: where the list did not come, neither does the number; and
    // "0 friends" on somebody's profile is a worse thing to publish than silence (profile/ProfileFriends)
    friends: friends && friends.total > 0 ? friends.total : null,
    badges: profile.achievements ?? null,
    bio: profile.bio,
    favPoem: profile.favoritePoem ?? null,
    favStory: profile.favoriteStory ?? null,
    online: profile.online ?? false,
    country: profile.country ? { code: profile.country, name: countryName(profile.country, locale) ?? profile.country } : null,
    frameSku: profile.frameSku ?? null,
    frameUrl: profile.frameUrl ?? null,
  };

  return (
    <FullProfile
      view={view}
      headerAction={<FriendActions userId={profile.userId} username={profile.username} status={profile.friendStatus} />}
      progress={
        <>
          <ProfileTree tree={profile.tree} />
          <ProfileProgress ranks={profile.ranks} badges={profile.badges} league={profile.league ?? (profile.tier ? { tier: profile.tier } : null)} />
        </>
      }
      people={<ProfileFriends userId={profile.userId} initial={friends} />}
      activity={<ProfileActivity userId={profile.userId} sections={profile.sections} />}
    />
  );
}

/**
 * Message + friend-request controls for another user (drives off friendStatus).
 * Asking them is handing over a ticket (social/FriendTickets.tsx), and the
 * same button takes the request back.
 */
function FriendActions({ userId, username, status }: { userId: string; username: string; status: FriendStatus }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [state, setState] = useState<FriendStatus>(status);
  const [busy, setBusy] = useState(false);
  // why a request or an answer did not go through — a full friend list says so (lib/limits.ts)
  const [err, setErr] = useState<string | null>(null);

  async function accept(): Promise<void> {
    setBusy(true);
    setErr(null);
    const res = await client.post(`/friends/requests/${userId}/accept`);
    setBusy(false);
    if (res.ok) setState('friends');
    else setErr(describeError(res.error, t));
  }

  const message = (
    <Button variant="secondary" size="sm" onClick={() => navigate(`/app/messages?to=${userId}&name=${encodeURIComponent(username)}`)}>
      {t('profile.message')}
    </Button>
  );

  return (
    <div className="mkp-actions">
      {state === 'self' && <Link to="/app/profile" className="btn btn-secondary btn-sm">{t('profile.yours')}</Link>}
      {state === 'friends' && message}
      {/* a game with this friend: the invite sheet, with them already chosen */}
      {state === 'friends' && <PlayWithButton userId={userId} name={username} />}
      {(state === 'none' || state === 'pending_out') && (
        <AddFriendButton userId={userId} name={username} status={state} onStatus={setState} onError={setErr} />
      )}
      {state === 'pending_in' && (
        <>
          <Button size="sm" onClick={() => void accept()} disabled={busy}>{busy ? t('profile.accepting') : t('profile.acceptRequest')}</Button>
          {message}
        </>
      )}
      {err && (
        <div className="msg msg-error" role="alert">
          {err}
        </div>
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
