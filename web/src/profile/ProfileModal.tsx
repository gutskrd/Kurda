import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiResult, MeProfile, PublicProfile } from '../lib/types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Loading, ErrorState } from '../components/states';
import { PersonGlyph } from '../components/icons';

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

  const isMe = target.kind === 'me';
  const p = isMe ? me : other;
  if (!p) return <ErrorState message="Profile unavailable." />;

  const name = p.displayName || p.username;
  const photo = isMe ? me?.profilePhotoUrl : null;
  // /me returns streak as an object ({current,longest,…}); /users/:id as a number.
  const streakDays = target.kind === 'me' ? (me?.streak.current ?? 0) : (other?.streak ?? 0);

  return (
    <article className="pcard pcard-modal">
      {photo ? (
        <img className="pcard-avatar" src={photo} alt="" />
      ) : (
        <PersonGlyph className="pcard-figure" size={112} />
      )}

      <div className="pcard-plate">
        <div className="pcard-name">{name}</div>
        <div className="pcard-handle">@{p.username}</div>

        <dl className="pcard-rows">
          {isMe && me && (
            <div className="pcard-row">
              <dt>Email</dt>
              <dd>{me.email}</dd>
            </div>
          )}
          <div className="pcard-row">
            <dt>XP</dt>
            <dd>{p.xp.toLocaleString()}</dd>
          </div>
          <div className="pcard-row">
            <dt>Streak</dt>
            <dd>{streakDays} day{streakDays === 1 ? '' : 's'}</dd>
          </div>
          {!isMe && other && (
            <>
              <div className="pcard-row">
                <dt>League</dt>
                <dd style={{ textTransform: 'capitalize' }}>{other.tier}</dd>
              </div>
              <div className="pcard-row">
                <dt>Rating</dt>
                <dd>{other.rating}</dd>
              </div>
              <div className="pcard-row">
                <dt>Achievements</dt>
                <dd>{other.achievements}</dd>
              </div>
            </>
          )}
        </dl>

        {!isMe && target.kind === 'user' && (
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <AddFriend userId={target.userId} />
            <Button
              variant="secondary"
              size="sm"
              block
              onClick={() => {
                closeProfile();
                navigate(`/app/messages?to=${target.userId}&name=${encodeURIComponent(p.username)}`);
              }}
            >
              Message
            </Button>
          </div>
        )}
      </div>

      <div className="pcard-foot">
        <span className="pcard-label">{isMe ? 'Profile' : name}</span>
        <span className="pcard-logo">
          <img src="/logo.png" alt="" aria-hidden="true" />
          MyKurda
        </span>
      </div>

      {isMe && (
        <div className="profile-actions" style={{ marginTop: 18 }}>
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

function AddFriend({ userId }: { userId: string }): React.JSX.Element {
  const { client } = useAuth();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function send(): Promise<void> {
    setState('sending');
    const res = await client.post('/friends/requests', { userId });
    setState(res.ok ? 'sent' : 'error');
  }

  if (state === 'sent') return <div className="msg msg-success">Friend request sent.</div>;
  return (
    <>
      <Button size="sm" block onClick={send} disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Add friend'}
      </Button>
      {state === 'error' && <div className="msg msg-error" style={{ marginTop: 8 }}>Couldn’t send the request.</div>}
    </>
  );
}
