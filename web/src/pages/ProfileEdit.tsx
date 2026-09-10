import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import type { AvatarOption, MeProfile } from '../lib/types';
import { DEFAULT_AVATAR_KEYS, avatarAssetUrl } from '../lib/cosmetics';
import { COUNTRIES } from '../lib/countries';
import { CosmeticCustomizer } from '../profile/CosmeticCustomizer';
import { ProfilePhotoPicker } from '../profile/ProfilePhotoPicker';
import { FavoritesPicker } from '../profile/FavoritesPicker';
import { SectionToggles } from '../profile/SectionToggles';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { PersonGlyph } from '../components/icons';
import { useT } from '../i18n/I18nProvider';

/**
 * Dedicated Edit Profile page (/app/profile/edit). ALL profile customization
 * lives here — the full profile view itself is read-only. Buying cosmetics is in
 * the Shop; here you equip what you own and edit your details.
 */
export function ProfileEdit(): React.JSX.Element {
  const t = useT();
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
      else setError(r.ok ? t('profile.yoursNotLoaded') : describeError(r.error, t));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey, t]);

  const changed = (): void => {
    setReloadKey((n) => n + 1);
    void refreshUser();
  };

  if (loading) return <Loading label={t('profile.loadingYours')} />;
  if (error || !me) return <ErrorState
          title={t('profile.loadFailedYours')}
          message={error ?? t('profile.unavailable')}
          onRetry={() => setReloadKey((n) => n + 1)}
        />;

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">{t('edit.eyebrow')}</span>
        <h1 className="page-title">{t('profile.edit')}</h1>
        <p className="page-sub"><Link to="/app/profile" className="link">{t('edit.back')}</Link></p>
      </div>

      <ProfilePhotoPicker me={me} onChanged={changed} />
      <ProfileDetailsForm me={me} onSaved={changed} />
      <AvatarPicker me={me} onChanged={changed} />
      <CosmeticCustomizer me={me} onChanged={changed} />
      <FavoritesPicker me={me} onChanged={changed} />
      <SectionToggles me={me} />

      <div style={{ marginTop: 24 }}>
        <Link to="/app/settings" className="btn btn-secondary">{t('edit.accountSettings')}</Link>
      </div>
    </div>
  );
}

/** Display name + bio. */
function ProfileDetailsForm({ me, onSaved }: { me: MeProfile; onSaved: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [displayName, setDisplayName] = useState(me.displayName ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [country, setCountry] = useState(me.country ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty = displayName.trim() !== (me.displayName ?? '') || bio !== (me.bio ?? '') || country !== (me.country ?? '');

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body: { displayName?: string; bio?: string; country?: string } = {};
    if (displayName.trim() !== (me.displayName ?? '')) body.displayName = displayName.trim();
    if (bio !== (me.bio ?? '')) body.bio = bio;
    if (country !== (me.country ?? '')) body.country = country; // '' clears it
    const res = await client.patch('/me', body);
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: t('edit.profileUpdated') });
      onSaved();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  return (
    <form className="card" onSubmit={save} style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.details')}</h2>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      <div className="field">
        <label className="field-label" htmlFor="displayName">{t('edit.displayName')}</label>
        <input id="displayName" className="input" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} placeholder={me.username} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="bio">{t('edit.bio')}</label>
        <textarea id="bio" className="input" style={{ height: 96, padding: '10px 14px', resize: 'vertical' }} value={bio} maxLength={1000} onChange={(e) => setBio(e.target.value)} placeholder={t('edit.bioPlaceholder')} />
        <span className="field-hint">{bio.length}/1000</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="country">{t('edit.country')}</label>
        <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">{t('edit.noCountry')}</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <Button type="submit" disabled={busy || !dirty}>{busy ? t('edit.saving') : t('edit.saveChanges')}</Button>
    </form>
  );
}

/** Pick a default avatar (premium ones locked for non-premium users). */
function AvatarPicker({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [selected, setSelected] = useState<string | null>(me.selectedAvatarKey ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const registry = useApiGet<{ avatars: AvatarOption[] }>('/cosmetics/avatars');
  const avatars: AvatarOption[] =
    registry.data?.avatars && registry.data.avatars.length > 0
      ? registry.data.avatars
      // every built-in avatar is free, so the offline fallback must not lock any
      : DEFAULT_AVATAR_KEYS.map((key) => ({ key, requiresPremium: false }));
  const isPremium = me.premium ?? false;

  async function pick(key: string | null): Promise<void> {
    if (busy) return;
    const prev = selected;
    setBusy(key ?? '__none__');
    setMsg(null);
    setSelected(key);
    // An uploaded photo always wins over a default avatar, so choosing an avatar
    // would otherwise appear to do nothing. Remove the uploaded photo first (from
    // the DB + storage) so the selected avatar actually becomes the picture.
    if (me.profilePhotoUrl) {
      const del = await client.delete('/me/profile-picture');
      if (!del.ok) {
        setBusy(null);
        setSelected(prev);
        setMsg({ kind: 'err', text: describeError(del.error, t) });
        return;
      }
    }
    const res = await client.put<{ avatarKey: string | null }>('/me/cosmetics/avatar', { key });
    setBusy(null);
    if (res.ok) {
      setMsg({ kind: 'ok', text: key ? t('edit.photoUpdated') : t('edit.avatarCleared') });
      onChanged();
    } else {
      setSelected(prev);
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  function onTile(a: AvatarOption, locked: boolean): void {
    if (locked) {
      setMsg({ kind: 'err', text: t('edit.premiumAvatar') });
      return;
    }
    void pick(a.key);
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.avatar')}</h2>
      {me.profilePhotoUrl && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          {t('edit.photoShown')}
        </p>
      )}
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <div className="avatar-grid" role="radiogroup" aria-label={t('edit.chooseAvatar')}>
        <button
          type="button"
          className={`avatar-tile avatar-tile-none${selected === null ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={selected === null}
          aria-label={t('edit.noAvatar')}
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
              aria-label={t('edit.avatarNamed', { name: a.key }) + (locked ? t('edit.premiumLocked') : '')}
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
