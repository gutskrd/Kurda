import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FriendStatus, PublicProfile, UserSummary } from '../lib/types';
import { FullProfile, type FullProfileView } from '../profile/FullProfile';
import { FRIENDS_SHOWN, ProfileFriends } from '../profile/ProfileFriends';
import { UserActions } from '../profile/UserActions';
import { ProfileActivity } from '../profile/ProfileActivity';
import { PlayWithButton } from '../play/PlayButtons';
import { AddFriendButton } from '../social/FriendTickets';
import { useRail } from '../social/RailProvider';
import { railEdits } from '../social/useSocialRail';
import { useUnfriend } from '../social/unfriend';
import { useOptimisticSend } from '../lib/optimistic';
import { countryName } from '../lib/countries';
import { EmptyState, ErrorState } from '../components/states';
import { LockIcon, SendIcon } from '../components/icons';
import { ProfileCard } from '../ui/ProfileCard';
import { FullProfileSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';

/** Another user's full profile (/app/users/:id), privacy-gated. */
export function UserProfile(): React.JSX.Element {
  const { id = '' } = useParams();
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friends, setFriends] = useState<{ friends: UserSummary[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A suspended or banned account: said calmly, with nothing to try again.
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  // What you are to each other: the buttons change it and the corner menu reads it.
  const [status, setStatus] = useState<FriendStatus>('none');
  const unfriend = useUnfriend();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    void (async () => {
      // Their friends with their profile, so the page is drawn once, whole.
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
      } else if (!r.ok && r.error.code === 'ACCOUNT_UNAVAILABLE') setUnavailable(true);
      else setError(r.ok ? t('profile.notLoaded') : describeError(r.error, t));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, id, attempt, t]);

  if (loading) return <FullProfileSkeleton />;
  if (unavailable) return <EmptyState title={t('account.unavailable')} />;
  if (error || !profile) return <ErrorState title={t('profile.loadFailed')} message={error ?? t('profile.unavailable')} onRetry={() => setAttempt((n) => n + 1)} />;

  const name = profile.displayName || profile.username;
  /*
   * The menu about them in the banner's corner (share, unfriend, report, block): the same component as on the profile
   * popup and in the friends list, so blocking and reporting have one set of words and rules.
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
                // No longer friends at once, and friends again if the server refuses.
                onConfirm: () => {
                  setStatus('none');
                  void unfriend(profile.userId, () => setStatus('friends'));
                },
              }
            : undefined
        }
        // Their profile answers you 404 from now on, so staying would show an error where a person was.
        onBlocked={() => navigate('/app')}
      />
    );
  const actions = <FriendActions key={status} userId={profile.userId} username={profile.username} name={name} status={status} onStatus={setStatus} />;

  // Privacy-hidden: who it is still shows, in the same card as anyone's, so you can ask to be friends.
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
    // Their friend count is theirs to show: where the list did not come neither does the number, and "0 friends" is worse
    // than silence (profile/ProfileFriends).
    friends: friends && friends.total > 0 ? friends.total : null,
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
      showcase={{
        tree: profile.tree,
        badges: profile.badges,
        earned: profile.earnedBadges,
        league: profile.league ?? (profile.tier ? { tier: profile.tier } : null),
      }}
      people={<ProfileFriends userId={profile.userId} initial={friends} />}
      activity={<ProfileActivity userId={profile.userId} sections={profile.sections} />}
    />
  );
}

/**
 * What you can do with another person: message and play once friends, ask before that, answer if they asked first. The
 * likeliest action is the filled button. Asking hands over a ticket (social/FriendTickets.tsx) that the same button takes
 * back; ending a friendship or blocking is in the corner menu.
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
  const { adjust } = useRail();
  const sendShown = useOptimisticSend();
  // Why a request or answer failed; a full friend list says so (lib/limits.ts).
  const [err, setErr] = useState<string | null>(null);

  /** Friends at once; a refusal brings the request back with a notice, since this card is drawn afresh for each status. */
  async function accept(): Promise<void> {
    setErr(null);
    onStatus('friends');
    const change = adjust(railEdits.requestAnswered(userId));
    await sendShown(() => client.post(`/friends/requests/${userId}/accept`), {
      keep: change.keep,
      undo: () => {
        change.undo();
        onStatus('pending_in');
      },
    });
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
      {/* A game with this friend: the invite sheet with them chosen. */}
      {status === 'friends' && <PlayWithButton userId={userId} name={name} />}
      {(status === 'none' || status === 'pending_out') && <AddFriendButton userId={userId} name={name} status={status} onError={setErr} />}
      {status === 'pending_in' && (
        <>
          <Button size="sm" onClick={() => void accept()}>
            {t('profile.acceptRequest')}
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
