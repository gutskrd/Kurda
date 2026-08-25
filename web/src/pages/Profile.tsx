import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile, UserSummary, WalletBalances } from '../lib/types';
import { DEFAULT_AVATAR_KEYS, avatarAssetUrl } from '../lib/cosmetics';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { PersonGlyph } from '../components/icons';

export function Profile(): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [m, w, f] = await Promise.all([
        client.get<{ user: MeProfile }>('/me'),
        client.get<{ balances: WalletBalances }>('/me/wallet'),
        client.get<{ friends: UserSummary[] }>('/friends'),
      ]);
      if (cancelled) return;
      if (m.ok && m.data?.user?.username) setMe(m.data.user);
      else setError(m.ok ? 'Your profile could not be loaded.' : describeError(m.error));
      if (w.ok) setZer(w.data.balances.zer);
      if (f.ok) setFriendCount(f.data.friends.length);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error || !me) return <ErrorState title="Couldn’t load your profile" message={error ?? 'Unavailable.'} onRetry={() => setReloadKey((n) => n + 1)} />;

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">Profîl · Your profile</span>
        <h1 className="page-title">{me.displayName || me.username}</h1>
        <p className="page-sub">@{me.username}</p>
      </div>

      <ProfileHeader me={me} onAvatarChanged={() => { setReloadKey((n) => n + 1); void refreshUser(); }} />

      <div className="stat-row" style={{ marginTop: 20 }}>
        <div className="stat"><div className="k">XP</div><div className="v">{me.xp.toLocaleString()}</div></div>
        <div className="stat"><div className="k">Streak</div><div className="v">{me.streak.current}</div></div>
        <div className="stat"><div className="k">Zêr</div><div className="v">{zer === null ? '—' : zer.toLocaleString()}</div></div>
        <Link className="stat stat-link" to="/app/friends">
          <div className="k">Friends</div>
          <div className="v">{friendCount === null ? '—' : friendCount}</div>
        </Link>
      </div>

      <EditProfile
        me={me}
        onSaved={() => { setReloadKey((n) => n + 1); void refreshUser(); }}
      />

      <Customize
        me={me}
        onChanged={() => { setReloadKey((n) => n + 1); void refreshUser(); }}
      />

      <div style={{ marginTop: 24 }}>
        <Link to="/app/settings" className="btn btn-secondary">Account settings</Link>
      </div>
    </div>
  );
}

function ProfileHeader({ me, onAvatarChanged }: { me: MeProfile; onAvatarChanged: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg('Please choose an image file.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await client.uploadBytes<{ profilePhotoUrl: string }>('/me/profile-picture', file);
    setBusy(false);
    if (res.ok) onAvatarChanged();
    else if (res.error.code === 'MEDIA_UNAVAILABLE') setMsg('Photo storage isn’t configured yet — try again once it’s enabled.');
    else setMsg(describeError(res.error));
  }

  return (
    <div className="profile-hero">
      <div className="profile-hero-avatar">
        {me.profilePhotoUrl ? (
          <img src={me.profilePhotoUrl} alt="" className="pcard-avatar" />
        ) : (
          <span className="avatar-fallback" aria-hidden="true"><PersonGlyph size={64} /></span>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Change photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} aria-label="Upload profile photo" />
      </div>
      <div className="profile-hero-body">
        {me.bio ? <p className="profile-bio">{me.bio}</p> : <p className="muted profile-bio">No bio yet.</p>}
        {msg && <div className="msg" role="status" style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  );
}

/**
 * Avatar customizer: pick one of the free default avatars (or clear it). The
 * server validates the key and stores only a reference. An uploaded photo always
 * takes priority on the profile, so we note that when one is set. Backgrounds and
 * icons are equipped from the shop (a later phase) since they need owned/premium
 * catalog items.
 */
function Customize({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const [selected, setSelected] = useState<string | null>(me.selectedAvatarKey ?? null);
  const [busy, setBusy] = useState<string | null>(null); // key currently being applied
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function pick(key: string | null): Promise<void> {
    if (busy) return;
    const prev = selected;
    setBusy(key ?? '__none__');
    setMsg(null);
    // optimistic: reflect the choice immediately, roll back on failure
    setSelected(key);
    const res = await client.put<{ avatarKey: string | null }>('/me/cosmetics/avatar', { key });
    setBusy(null);
    if (res.ok) {
      setMsg({ kind: 'ok', text: key ? 'Avatar updated.' : 'Avatar cleared.' });
      onChanged();
    } else {
      setSelected(prev);
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Avatar</h2>
      {me.profilePhotoUrl && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          Your uploaded photo is shown on your profile. Remove it to display a default avatar.
        </p>
      )}
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <div className="avatar-grid" role="radiogroup" aria-label="Choose a default avatar">
        <button
          type="button"
          className={`avatar-tile avatar-tile-none${selected === null ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={selected === null}
          aria-label="No avatar"
          disabled={busy !== null}
          onClick={() => void pick(null)}
        >
          <PersonGlyph size={30} />
        </button>
        {DEFAULT_AVATAR_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`avatar-tile${selected === key ? ' is-selected' : ''}`}
            role="radio"
            aria-checked={selected === key}
            aria-label={`Avatar ${key}`}
            disabled={busy !== null}
            onClick={() => void pick(key)}
          >
            <img src={avatarAssetUrl(key)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </section>
  );
}

function EditProfile({ me, onSaved }: { me: MeProfile; onSaved: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const [displayName, setDisplayName] = useState(me.displayName ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty = displayName.trim() !== (me.displayName ?? '') || bio !== (me.bio ?? '');

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body: { displayName?: string; bio?: string } = {};
    if (displayName.trim() !== (me.displayName ?? '')) body.displayName = displayName.trim();
    if (bio !== (me.bio ?? '')) body.bio = bio;
    const res = await client.patch('/me', body);
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: 'Profile updated.' });
      onSaved();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
  }

  return (
    <form className="card" onSubmit={save} style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Edit profile</h2>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      <div className="field">
        <label className="field-label" htmlFor="displayName">Display name</label>
        <input id="displayName" className="input" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} placeholder={me.username} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="bio">Bio</label>
        <textarea id="bio" className="input" style={{ height: 96, padding: '10px 14px', resize: 'vertical' }} value={bio} maxLength={1000} onChange={(e) => setBio(e.target.value)} placeholder="Tell others a little about you…" />
        <span className="field-hint">{bio.length}/1000</span>
      </div>
      <Button type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</Button>
    </form>
  );
}
