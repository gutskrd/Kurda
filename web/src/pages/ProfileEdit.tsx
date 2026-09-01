import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import type { AvatarOption, MeProfile } from '../lib/types';
import { DEFAULT_AVATAR_KEYS, avatarAssetUrl } from '../lib/cosmetics';
import { CosmeticCustomizer } from '../profile/CosmeticCustomizer';
import { FavoritesPicker } from '../profile/FavoritesPicker';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { PersonGlyph } from '../components/icons';

/**
 * Dedicated Edit Profile page (/app/profile/edit). ALL profile customization
 * lives here — the full profile view itself is read-only. Buying cosmetics is in
 * the Shop; here you equip what you own and edit your details.
 */
export function ProfileEdit(): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await client.get<{ user: MeProfile }>('/me');
      if (cancelled) return;
      if (r.ok && r.data?.user?.username) setMe(r.data.user);
      else setError(r.ok ? 'Your profile could not be loaded.' : describeError(r.error));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey]);

  const changed = (): void => {
    setReloadKey((n) => n + 1);
    void refreshUser();
  };

  if (loading) return <Loading label="Loading…" />;
  if (error || !me) return <ErrorState title="Couldn’t load your profile" message={error ?? 'Unavailable.'} onRetry={() => setReloadKey((n) => n + 1)} />;

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">Profîl · Edit profile</span>
        <h1 className="page-title">Edit Profile</h1>
        <p className="page-sub"><Link to="/app/profile" className="link">← Back to your profile</Link></p>
      </div>

      <PhotoControls me={me} onChanged={changed} />
      <ProfileDetailsForm me={me} onSaved={changed} />
      <AvatarPicker me={me} onChanged={changed} />
      <CosmeticCustomizer me={me} onChanged={changed} />
      <FavoritesPicker me={me} onChanged={changed} />

      <div style={{ marginTop: 24 }}>
        <Link to="/app/settings" className="btn btn-secondary">Account settings</Link>
      </div>
    </div>
  );
}

/** Upload or remove the custom profile photo. */
function PhotoControls({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | 'upload' | 'remove'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const avatar = me.avatarUrl ?? me.profilePhotoUrl;
  const hasPhoto = Boolean(me.profilePhotoUrl);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg('Please choose an image file.');
      return;
    }
    setBusy('upload');
    setMsg(null);
    const res = await client.uploadBytes<{ profilePhotoUrl: string }>('/me/profile-picture', file);
    setBusy(null);
    if (res.ok) onChanged();
    else if (res.error.code === 'MEDIA_UNAVAILABLE') setMsg('Photo storage isn’t configured yet — try again once it’s enabled.');
    else setMsg(describeError(res.error));
  }

  async function removePhoto(): Promise<void> {
    setBusy('remove');
    setMsg(null);
    const res = await client.delete('/me/profile-picture');
    setBusy(null);
    if (res.ok) onChanged();
    else setMsg(describeError(res.error));
  }

  return (
    <section className="card">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Profile picture</h2>
      <div className="edit-photo-row">
        <span className="hero-avatar-wrap">
          {avatar ? (
            <img src={avatar} alt="" className="pcard-avatar" />
          ) : (
            <span className="avatar-fallback" aria-hidden="true"><PersonGlyph size={48} /></span>
          )}
        </span>
        <div className="edit-photo-actions">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            {busy === 'upload' ? 'Uploading…' : 'Upload your own'}
          </Button>
          {hasPhoto && (
            <Button variant="ghost" size="sm" onClick={() => void removePhoto()} disabled={busy !== null}>
              {busy === 'remove' ? 'Removing…' : 'Remove'}
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} aria-label="Upload profile photo" />
        </div>
      </div>
      {msg && <div className="msg" role="status" style={{ marginTop: 12 }}>{msg}</div>}
    </section>
  );
}

/** Display name + bio. */
function ProfileDetailsForm({ me, onSaved }: { me: MeProfile; onSaved: () => void }): React.JSX.Element {
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
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Details</h2>
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

/** Pick a default avatar (premium ones locked for non-premium users). */
function AvatarPicker({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const [selected, setSelected] = useState<string | null>(me.selectedAvatarKey ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const registry = useApiGet<{ avatars: AvatarOption[] }>('/cosmetics/avatars');
  const avatars: AvatarOption[] =
    registry.data?.avatars && registry.data.avatars.length > 0
      ? registry.data.avatars
      : DEFAULT_AVATAR_KEYS.map((key) => ({ key, requiresPremium: key !== 'default-01' }));
  const isPremium = me.premium ?? false;

  async function pick(key: string | null): Promise<void> {
    if (busy) return;
    const prev = selected;
    setBusy(key ?? '__none__');
    setMsg(null);
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

  function onTile(a: AvatarOption, locked: boolean): void {
    if (locked) {
      setMsg({ kind: 'err', text: 'This avatar is a Premium feature — upgrade to Premium to use it.' });
      return;
    }
    void pick(a.key);
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
        {avatars.map((a) => {
          const locked = a.requiresPremium && !isPremium;
          return (
            <button
              key={a.key}
              type="button"
              className={`avatar-tile${selected === a.key ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
              role="radio"
              aria-checked={selected === a.key}
              aria-disabled={locked}
              aria-label={`Avatar ${a.key}${locked ? ' (Premium — locked)' : ''}`}
              disabled={busy !== null}
              onClick={() => onTile(a, locked)}
            >
              <img src={avatarAssetUrl(a.key)} alt="" loading="lazy" />
              {locked && <span className="avatar-lock" aria-hidden="true">🔒</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
