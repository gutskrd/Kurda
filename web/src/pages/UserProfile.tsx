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
import { LockIcon, SendIcon } from '../components/icons';
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
  // what the two of you are to each other: the buttons under their words change it, and the menu in the corner reads it
  const [status, setStatus] = useState<FriendStatus>('none');
  const navigate = useNavigate();

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
      if (r.ok && r.data?.username) {
        setProfile(r.data);
        setStatus(r.data.friendStatus);
      } else setError(r.ok ? t('profile.notLoaded') : describeError(r.error, t));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, attempt, t]);

  if (loading) return <FullProfileSkeleton />;
  if (error || !profile) return <ErrorState title={t('profile.loadFailed')} message={error ?? t('profile.unavailable')} onRetry={() => setAttempt((n) => n + 1)} />;

  const name = profile.displayName || profile.username;
  /*
   * The menu about them, in the banner's far corner: send their profile to
   * somebody, stop being friends where you are, report them, block them. It is
   * the same component as on the profile popup and in the friends list, so
   * blocking and reporting have one set of words and one set of rules about
   * what happens next.
   */
  const corner =
    status === 'self' ? null : (
      <UserActions
        userId={profile.userId}
        name={name}
        share
        remove={
          status === 'friends'
            ? {
                label: t('friends.removeFriend'),
                title: t('friends.removeWho', { name }),
                onConfirm: async () => {
                  const res = await client.delete(`/friends/${profile.userId}`);
                  if (res.ok) setStatus('none');
                },
              }
            : undefined
        }
        // their profile answers 404 to you from here on, so staying on it would show an error where a person used to be
        onBlocked={() => navigate('/app')}
      />
    );
  const actions = <FriendActions key={status} userId={profile.userId} username={profile.username} name={name} status={status} onStatus={setStatus} />;

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
            seed={profile.userId}
            corner={corner}
            aside={actions}
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
    id: profile.userId,
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
      corner={corner}
      headerAction={actions}
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
 * What you can do with another person, under their words: write to them and
 * play with them once you are friends, ask to be friends before that, answer
 * them when they asked first. The one thing most people came to do is the
 * filled button; the rest stand beside it, quieter.
 *
 * Asking them is handing over a ticket (social/FriendTickets.tsx), and the
 * same button takes the request back. What ends something — a friendship, or
 * their place in your Hevalo altogether — is not here: it is in the menu in
 * the banner's corner.
 */
function FriendActions({
  userId,
  username,
  name,
  status,
  onStatus,
}: {
  userId: string;
  username: string;
  name: string;
  status: FriendStatus;
  onStatus: (next: FriendStatus) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // why a request or an answer did not go through — a full friend list says so (lib/limits.ts)
  const [err, setErr] = useState<string | null>(null);

  async function accept(): Promise<void> {
    setBusy(true);
    setErr(null);
    const res = await client.post(`/friends/requests/${userId}/accept`);
    setBusy(false);
    if (res.ok) onStatus('friends');
    else setErr(describeError(res.error, t));
  }

  const message = (primary: boolean): React.JSX.Element => (
    <Button variant={primary ? 'primary' : 'secondary'} size="sm" onClick={() => navigate(`/app/messages?to=${userId}&name=${encodeURIComponent(username)}`)}>
      <SendIcon size={16} />
      {t('profile.message')}
    </Button>
  );

  return (
    <div className="pc-acts">
      {status === 'self' && (
        <Link to="/app/profile" className="btn btn-secondary btn-sm">
          {t('profile.yours')}
        </Link>
      )}
      {status === 'friends' && message(true)}
      {/* a game with this friend: the invite sheet, with them already chosen */}
      {status === 'friends' && <PlayWithButton userId={userId} name={name} />}
      {(status === 'none' || status === 'pending_out') && <AddFriendButton userId={userId} name={name} status={status} onError={setErr} />}
      {status === 'pending_in' && (
        <>
          <Button size="sm" onClick={() => void accept()} disabled={busy}>
            {busy ? t('profile.accepting') : t('profile.acceptRequest')}
          </Button>
          {message(false)}
        </>
      )}
      {err && (
        <div className="msg msg-error" role="alert">
          {err}
        </div>
      )}
    </div>
  );
}
