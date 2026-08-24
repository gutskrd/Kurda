import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile, PublicProfile } from '../lib/types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Loading, ErrorState } from '../components/states';
import { PersonGlyph } from '../components/icons';

/** What the modal is showing: your own profile, or another user by id. */
type Target = { kind: 'me' } | { kind: 'user'; userId: string; username?: string };

interface Ctx {
  openProfile: (target: Target) => void;
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
    <ProfileCtx.Provider value={{ openProfile }}>
      {children}
      <Modal open={target !== null} onClose={close} label="Profile">
        {target && <ProfileContent target={target} />}
      </Modal>
    </ProfileCtx.Provider>
  );
}

/** Card body: fetches /me for your own profile, /users/:id for others. */
function ProfileContent({ target }: { target: Target }): React.JSX.Element {
  const { client } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMe(null);
    setOther(null);
    const req =
      target.kind === 'me'
        ? client.get<{ user: MeProfile }>('/me').then((r) => (r.ok ? setMe(r.data.user) : setError(describeError(r.error))))
        : client
            .get<PublicProfile>(`/users/${target.userId}`)
            .then((r) => (r.ok ? setOther(r.data) : setError(describeError(r.error))));
    void req.finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, target]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error) return <ErrorState message={error} />;

  const isMe = target.kind === 'me';
  const p = isMe ? me : other;
  if (!p) return <ErrorState message="Profile unavailable." />;

  const name = p.displayName || p.username;
  const photo = isMe ? me?.profilePhotoUrl : null;

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
            <dd>{p.streak} day{p.streak === 1 ? '' : 's'}</dd>
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
          <div style={{ marginTop: 16 }}>
            <AddFriend userId={target.userId} />
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
