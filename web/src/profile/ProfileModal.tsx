import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type {
  ApiResult,
  FriendStatus,
  LevelInfo,
  MeProfile,
  ProfileBackground,
  ProfileIcon,
  PublicProfile,
} from '../lib/types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { EmptyState, ErrorState } from '../components/states';
import { ProfileCardSkeleton } from '../components/skeletons';
import { ProfileCard } from '../ui/ProfileCard';
import { UserActions } from './UserActions';
import { ProfileFacts, type ProfileFact } from './FullProfile';
import { ShareProfile } from './ProfileMenu';
import { AddFriendButton } from '../social/FriendTickets';
import { useRail } from '../social/RailProvider';
import { railEdits } from '../social/useSocialRail';
import { useUnfriend } from '../social/unfriend';
import { useOptimisticSend } from '../lib/optimistic';
import { PlayWithButton } from '../play/PlayButtons';
import { countryName } from '../lib/countries';
import { Flag } from '../components/Flag';
import { Fire } from '../components/Fire';
import { ChevronIcon, EditIcon, MedalIcon, SendIcon, TrophyIcon, XpIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { compactCount, fireLevel, toLeagueTier } from '@kurda/shared';
import { leagueName } from '../ranks/names';
import type { MessageKey } from '../i18n/en';

/** What the modal is showing: your own profile, or another user by id. */
type Target = { kind: 'me' } | { kind: 'user'; userId: string; username?: string };

interface Ctx {
  openProfile: (target: Target) => void;
  closeProfile: () => void;
}
const ProfileCtx = createContext<Ctx | null>(null);

export function useProfileModal(): Ctx {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfileModal must be used within ProfileModalProvider');
  return ctx;
}

export function ProfileModalProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const t = useT();
  const { maintenance } = useAuth();
  const [target, setTarget] = useState<Target | null>(null);
  const openProfile = useCallback((t: Target) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  return (
    <ProfileCtx.Provider value={{ openProfile, closeProfile: close }}>
      {children}
      {/* Hidden while Hevalo is offline rather than failing over the offline screen; it reopens and reloads after. */}
      <Modal open={target !== null && !maintenance} onClose={close} label={t('profile.title')}>
        {target && <ProfileContent target={target} />}
      </Modal>
    </ProfileCtx.Provider>
  );
}

/**
 * Turns a failed or empty profile response into user-facing text and logs the transport error details; never the
 * auth token or a response body.
 */
function failureReason(path: string, res: ApiResult<unknown>, t: (key: MessageKey) => string): string {
  if (res.ok) {
    console.error(`[profile] ${path} returned 200 but no usable profile in the body`);
    return t('profile.unreadable');
  }
  const { kind, status, code, requestId } = res.error;
  console.error(`[profile] ${path} failed`, { kind, status, code, requestId });
  return describeError(res.error, t);
}

/**
 * The popup's small profile: banner, face, name, origin, bio, four figures, the main action as a filled button and a
 * link to the full profile. The banner's corner menu offers share, report and block. Fetches /me for the reader's own
 * profile and /users/:id for others.
 */
function ProfileContent({ target }: { target: Target }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const { closeProfile } = useProfileModal();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A suspended or banned account: said calmly, with nothing to try again.
  const [notAvailable, setNotAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0); // bump to retry
  /** Held here because blocking replaces the whole card: afterwards the profile answers 404, so the card says so. */
  const [blocked, setBlocked] = useState(false);
  // what the two of you are to each other: the buttons change it, and the menu in the corner reads it
  const [status, setStatus] = useState<FriendStatus>('none');
  const unfriend = useUnfriend();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotAvailable(false);
    setMe(null);
    setOther(null);

    void (async () => {
      if (target.kind === 'me') {
        const r = await client.get<{ user: MeProfile }>('/me');
        if (cancelled) return;
        // A successful response with no usable user is still a failure, never a blank card.
        if (r.ok && r.data?.user?.username) setMe(r.data.user);
        else setError(failureReason('/me', r, t));
      } else {
        const r = await client.get<PublicProfile>(`/users/${target.userId}`);
        if (cancelled) return;
        if (r.ok && r.data?.username) {
          setOther(r.data);
          setStatus(r.data.friendStatus);
        } else if (!r.ok && r.error.code === 'ACCOUNT_UNAVAILABLE') setNotAvailable(true);
        else setError(failureReason(`/users/${target.userId}`, r, t));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [client, target, attempt]);

  if (loading) return <ProfileCardSkeleton />;
  if (notAvailable) return <EmptyState title={t('account.unavailable')} />;
  if (error) return <ErrorState title={t('profile.loadFailed')} message={error} onRetry={() => setAttempt((n) => n + 1)} />;

  // One normalized view drives a shared card shell for both own + others.
  const number = (n: number): string => n.toLocaleString(locale);
  // Figures are shortened (5230 → 5.2K) so they fit side by side; a screen reader is given the whole number.
  const short = (n: number): string => compactCount(n, locale);
  const whole = (n: number): string | undefined => (short(n) === number(n) ? undefined : number(n));
  const days = (n: number): string => t(n === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: number(n) });
  let id = '';
  let name = '';
  let username = '';
  let photo: string | null = null;
  let bio: string | null = null;
  let background: ProfileBackground | null = null;
  let icon: ProfileIcon | null = null;
  let level: LevelInfo | undefined;
  let premium = false;
  let online: boolean | undefined;
  let country: string | null = null;
  const facts: ProfileFact[] = [];
  let actions: React.JSX.Element | null = null;
  const unavailable = <ErrorState title={t('profile.loadFailed')} message={t('profile.unavailable')} onRetry={() => setAttempt((n) => n + 1)} />;
  const streakFact = (current: number): ProfileFact => ({
    key: 'streak',
    label: t('profile.stat.streak'),
    value: short(current),
    icon: <Fire size={18} level={fireLevel(current)} still />,
    spoken: days(current),
  });

  if (target.kind === 'me') {
    if (!me) return unavailable;
    id = me.id;
    name = me.displayName || me.username;
    username = me.username;
    // The server resolves avatarUrl from the photo or default; older responses only have the photo field.
    photo = me.avatarUrl ?? me.profilePhotoUrl;
    bio = me.bio;
    background = me.background ?? null;
    icon = me.icon ?? null;
    level = me.level;
    premium = me.premium ?? false;
    online = me.online;
    country = me.country ?? null;
    facts.push(streakFact(me.streak.current));
    const xp = me.level?.xp ?? me.xp;
    facts.push({ key: 'xp', label: t('profile.stat.xp'), value: short(xp), spoken: whole(xp), icon: <XpIcon size={15} /> });
    // beside the streak, the number a missed day never takes away
    facts.push({ key: 'longest', label: t('profile.stat.longestStreak'), value: short(me.streak.longest), spoken: days(me.streak.longest) });
    actions = <OwnActions userId={me.id} name={name} onGo={closeProfile} />;
  } else {
    if (!other) return unavailable;
    id = other.userId;
    name = other.displayName || other.username;
    username = other.username;
    photo = other.avatarUrl ?? other.profilePhotoUrl ?? null;
    bio = other.bio ?? null;
    background = other.background ?? null;
    icon = other.icon ?? null;
    level = other.level;
    premium = other.premium ?? false;
    online = other.online;
    country = other.country ?? null;
    if (other.streak !== undefined) facts.push(streakFact(other.streak));
    if (other.level?.xp !== undefined || other.xp !== undefined) {
      const xp = other.level?.xp ?? other.xp ?? 0;
      facts.push({ key: 'xp', label: t('profile.stat.xp'), value: short(xp), spoken: whole(xp), icon: <XpIcon size={15} /> });
    }
    // a league tier key, translated; none for someone not taking part (never a default tier)
    const leagueTier = toLeagueTier(other.league?.tier ?? other.tier ?? null);
    if (leagueTier) facts.push({ key: 'league', label: t('profile.stat.league'), value: leagueName(t, leagueTier), icon: <TrophyIcon size={15} /> });
    if (other.achievements !== undefined) {
      facts.push({ key: 'badges', label: t('profile.badges'), value: short(other.achievements), spoken: whole(other.achievements), icon: <MedalIcon size={15} /> });
    }
    actions = blocked ? (
      <div className="pcard-blocked" role="status">
        <p>{t('profile.blockedNote')}</p>
        <button
          type="button"
          className="link"
          onClick={() => {
            closeProfile();
            navigate('/app/settings');
          }}
        >
          {t('profile.undoInSettings')}
        </button>
      </div>
    ) : status === 'self' ? (
      <OwnActions userId={other.userId} name={name} onGo={closeProfile} />
    ) : (
      <OtherActions
        key={status}
        userId={other.userId}
        name={name}
        status={status}
        onStatus={setStatus}
        onMessage={() => {
          closeProfile();
          navigate(`/app/messages?to=${other.userId}&name=${encodeURIComponent(other.username)}`);
        }}
      />
    );
  }

  /*
   * Block and Report sit in the menu, since Block cannot be undone from the card. The reader's own profile can be
   * opened by id as kind 'user', so `target.kind` alone does not decide whether to offer them.
   */
  const corner =
    other && status !== 'self' && !blocked ? (
      <UserActions
        userId={other.userId}
        name={name}
        share
        remove={
          status === 'friends'
            ? {
                label: t('friends.removeFriend'),
                title: t('friends.removeWho', { name }),
                // no longer friends at once, and friends again if the server refuses
                onConfirm: () => {
                  setStatus('none');
                  void unfriend(other.userId, () => setStatus('friends'));
                },
              }
            : undefined
        }
        onBlocked={() => setBlocked(true)}
        onBlockRefused={() => setBlocked(false)}
      />
    ) : null;
  const place = country ? (countryName(country, locale) ?? country) : null;

  return (
    <article className="pc-modal">
      <ProfileCard
        name={name}
        username={username}
        avatarUrl={photo}
        background={background}
        icon={icon}
        premium={premium}
        online={online}
        seed={id}
        corner={corner}
        frameSku={target.kind === 'me' ? null : (other?.frameSku ?? null)}
        frameUrl={target.kind === 'me' ? null : (other?.frameUrl ?? null)}
        meta={
          <>
            {(level || place) && (
              <ul className="mkp-about">
                {level && <li className="pc-level-chip">{t('profile.levelN', { level: level.level })}</li>}
                {country && place && (
                  <li className="mkp-country">
                    <Flag code={country} />
                    <span>{place}</span>
                  </li>
                )}
              </ul>
            )}
          </>
        }
      >
        {bio && (
          <p className="pc-bio" dir="auto">
            {bio}
          </p>
        )}

        <ProfileFacts facts={facts} />

        {actions && <div className="pc-actions">{actions}</div>}

        {/* the whole of them is one press away, and it is the last thing here: the popup is for the glance */}
        <button
          type="button"
          className="pc-full"
          onClick={() => {
            closeProfile();
            navigate(target.kind === 'me' || status === 'self' ? '/app/profile' : `/app/users/${id}`);
          }}
        >
          {t('profile.viewFull')}
          <ChevronIcon size={16} />
        </button>
      </ProfileCard>
    </article>
  );
}

/** Your own card, opened from your own name somewhere: change the profile, or send it to somebody. */
function OwnActions({ userId, name, onGo }: { userId: string; name: string; onGo: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="pc-acts">
      <Link to="/app/profile/edit" className="btn btn-secondary btn-sm" onClick={onGo}>
        <EditIcon size={16} />
        {t('profile.edit')}
      </Link>
      <ShareProfile userId={userId} name={name} />
    </div>
  );
}

/** Actions for another person, by relationship: the most likely one as the filled button, the rest quieter. */
function OtherActions({
  userId,
  name,
  status,
  onStatus,
  onMessage,
}: {
  userId: string;
  name: string;
  status: FriendStatus;
  onStatus: (next: FriendStatus) => void;
  onMessage: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const { adjust } = useRail();
  const sendShown = useOptimisticSend();
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
    <Button variant={primary ? 'primary' : 'secondary'} size="sm" onClick={onMessage}>
      <SendIcon size={16} />
      {t('profile.message')}
    </Button>
  );

  return (
    <div className="pc-acts">
      {status === 'friends' && message(true)}
      {/* a game with this friend: the invite sheet, with them already chosen */}
      {status === 'friends' && <PlayWithButton userId={userId} name={name} />}
      {/* The same button sends and withdraws a request; a full list or too many pending requests says why (lib/limits.ts). */}
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
