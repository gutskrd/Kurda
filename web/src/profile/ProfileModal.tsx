import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type {
  ApiResult,
  FavoriteRef,
  FriendStatus,
  LevelInfo,
  MeProfile,
  ProfileBackground,
  ProfileIcon,
  PublicProfile,
} from '../lib/types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Loading, ErrorState } from '../components/states';
import { PersonGlyph } from '../components/icons';
import { CosmeticBackground, LevelBar, PremiumPill, EquippedIcon } from './cosmetic-parts';

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
  const [target, setTarget] = useState<Target | null>(null);
  const openProfile = useCallback((t: Target) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  return (
    <ProfileCtx.Provider value={{ openProfile, closeProfile: close }}>
      {children}
      <Modal open={target !== null} onClose={close} label="Profile">
        {target && <ProfileContent target={target} />}
      </Modal>
    </ProfileCtx.Provider>
  );
}

/**
 * Turn a failed (or unusably-empty) profile response into user-facing copy, and
 * log the technical detail for debugging. Never logs the auth token or any
 * response body — only the transport-level error metadata.
 */
function failureReason(path: string, res: ApiResult<unknown>): string {
  if (res.ok) {
    console.error(`[profile] ${path} returned 200 but no usable profile in the body`);
    return 'We couldn’t read this profile. Please try again.';
  }
  const { kind, status, code, requestId } = res.error;
  console.error(`[profile] ${path} failed`, { kind, status, code, requestId });
  return describeError(res.error);
}

/** Card body: fetches /me for your own profile, /users/:id for others. */
function ProfileContent({ target }: { target: Target }): React.JSX.Element {
  const { client } = useAuth();
  const { closeProfile } = useProfileModal();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0); // bump to retry

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMe(null);
    setOther(null);

    void (async () => {
      if (target.kind === 'me') {
        const r = await client.get<{ user: MeProfile }>('/me');
        if (cancelled) return;
        // A successful response with no usable user is still a failure — never
        // fall through to a blank card. (Guards a shape mismatch / empty body.)
        if (r.ok && r.data?.user?.username) setMe(r.data.user);
        else setError(failureReason('/me', r));
      } else {
        const r = await client.get<PublicProfile>(`/users/${target.userId}`);
        if (cancelled) return;
        if (r.ok && r.data?.username) setOther(r.data);
        else setError(failureReason(`/users/${target.userId}`, r));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [client, target, attempt]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error) return <ErrorState title="Couldn’t load this profile" message={error} onRetry={() => setAttempt((n) => n + 1)} />;

  // One normalized view drives a shared card shell for both own + others.
  let name = '';
  let username = '';
  let photo: string | null = null;
  let bio: string | null = null;
  let background: ProfileBackground | null = null;
  let icon: ProfileIcon | null = null;
  let level: LevelInfo | undefined;
  let premium = false;
  let favPoem: FavoriteRef | null = null;
  let favStory: FavoriteRef | null = null;
  const stats: Array<{ label: string; value: string; cap?: boolean }> = [];
  let actions: React.JSX.Element | null = null;
  const unavailable = <ErrorState title="Couldn’t load this profile" message="Profile unavailable." onRetry={() => setAttempt((n) => n + 1)} />;

  if (target.kind === 'me') {
    if (!me) return unavailable;
    name = me.displayName || me.username;
    username = me.username;
    // avatarUrl already resolves photo → default avatar server-side; fall back to
    // the legacy photo field for older responses.
    photo = me.avatarUrl ?? me.profilePhotoUrl;
    bio = me.bio;
    background = me.background ?? null;
    icon = me.icon ?? null;
    level = me.level;
    premium = me.premium ?? false;
    favPoem = me.favoritePoem ?? null;
    favStory = me.favoriteStory ?? null;
    stats.push({ label: 'XP', value: me.xp.toLocaleString() });
    stats.push({ label: 'Streak', value: `${me.streak.current} day${me.streak.current === 1 ? '' : 's'}` });
  } else {
    if (!other) return unavailable;
    name = other.displayName || other.username;
    username = other.username;
    photo = other.avatarUrl ?? other.profilePhotoUrl ?? null;
    bio = other.bio ?? null;
    background = other.background ?? null;
    icon = other.icon ?? null;
    level = other.level;
    premium = other.premium ?? false;
    favPoem = other.favoritePoem ?? null;
    favStory = other.favoriteStory ?? null;
    if (other.xp !== undefined) stats.push({ label: 'XP', value: other.xp.toLocaleString() });
    if (other.streak !== undefined) stats.push({ label: 'Streak', value: `${other.streak} day${other.streak === 1 ? '' : 's'}` });
    if (other.tier) stats.push({ label: 'League', value: other.tier, cap: true });
    if (other.rating !== undefined) stats.push({ label: 'Rating', value: `${other.rating}` });
    if (other.achievements !== undefined) stats.push({ label: 'Achievements', value: `${other.achievements}` });
    actions = (
      <OtherActions
        userId={other.userId}
        status={other.friendStatus}
        onMessage={() => {
          closeProfile();
          navigate(`/app/messages?to=${other.userId}&name=${encodeURIComponent(other.username)}`);
        }}
      />
    );
  }

  return (
    <article className={`pcard pcard-modal${background ? ' pcard-has-bg' : ''}`}>
      {/* equipped background sits behind everything (owned/premium-gated server-side) */}
      {background && <CosmeticBackground background={background} />}

      {/* full photo (or silhouette), like the reference — not a small circle */}
      <div className="pcard-photo">
        {photo ? (
          <img className="pcard-photo-img" src={photo} alt="" />
        ) : (
          <PersonGlyph className="pcard-photo-glyph" size={92} />
        )}
      </div>

      <div className="pcard-plate">
        <div className="pcard-name-row">
          <div className="pcard-name">{name}</div>
          {icon && <EquippedIcon icon={icon} />}
          {premium && <PremiumPill />}
        </div>
        <div className="pcard-handle">@{username}</div>

        {level && <LevelBar level={level} />}

        {bio && <p className="pcard-bio">{bio}</p>}

        {stats.length > 0 && (
          <dl className="pcard-rows">
            {stats.map((s) => (
              <div className="pcard-row" key={s.label}>
                <dt>{s.label}</dt>
                <dd style={s.cap ? { textTransform: 'capitalize' } : undefined}>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(favPoem || favStory) && (
          <dl className="pcard-rows pcard-favorites">
            {favPoem && (
              <div className="pcard-row" key="fav-poem">
                <dt>Favorite poem</dt>
                <dd>{favPoem.title}</dd>
              </div>
            )}
            {favStory && (
              <div className="pcard-row" key="fav-story">
                <dt>Favorite story</dt>
                <dd>{favStory.title}</dd>
              </div>
            )}
          </dl>
        )}

        {actions && <div style={{ marginTop: 14 }}>{actions}</div>}
      </div>

      <div className="pcard-foot">
        <span className="pcard-label">{target.kind === 'me' ? 'Profile' : name}</span>
        <span className="pcard-logo">
          <img src="/logo.png" alt="" aria-hidden="true" />
          MyKurda
        </span>
      </div>

      {target.kind === 'me' && (
        <div className="profile-actions" style={{ marginTop: 16 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              closeProfile();
              navigate('/app/profile');
            }}
          >
            View full profile
          </Button>
        </div>
      )}
    </article>
  );
}

/** Friend + message actions for another user, driven by the friend status. */
function OtherActions({
  userId,
  status,
  onMessage,
}: {
  userId: string;
  status: FriendStatus;
  onMessage: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const [state, setState] = useState<FriendStatus>(status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function addFriend(): Promise<void> {
    setBusy(true);
    setErr(false);
    const res = await client.post('/friends/requests', { userId });
    setBusy(false);
    if (res.ok) setState('pending_out');
    else setErr(true);
  }
  async function accept(): Promise<void> {
    setBusy(true);
    setErr(false);
    const res = await client.post(`/friends/requests/${userId}/accept`);
    setBusy(false);
    if (res.ok) setState('friends');
    else setErr(true);
  }

  const message = (
    <Button variant="secondary" size="sm" block onClick={onMessage}>
      Message
    </Button>
  );

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {state === 'friends' && message}
      {state === 'none' && (
        <Button size="sm" block onClick={addFriend} disabled={busy}>
          {busy ? 'Sending…' : 'Add friend'}
        </Button>
      )}
      {state === 'pending_out' && (
        <Button size="sm" block disabled>
          Request sent
        </Button>
      )}
      {state === 'pending_in' && (
        <>
          <Button size="sm" block onClick={accept} disabled={busy}>
            {busy ? 'Accepting…' : 'Accept request'}
          </Button>
          {message}
        </>
      )}
      {err && <div className="msg msg-error" style={{ marginTop: 4 }}>Something went wrong. Please try again.</div>}
    </div>
  );
}
