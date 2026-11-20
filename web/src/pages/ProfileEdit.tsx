import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import { failureText, useOptimistic } from '../lib/optimistic';
import type { ApiError, ApiResult, AvatarOption, MeProfile, PublicProfile } from '../lib/types';
import { DEFAULT_AVATAR_KEYS, avatarAssetUrl } from '../lib/cosmetics';
import { useArtOverrides } from '../art/overrides';
import { countriesIn } from '../lib/countries';
import { CosmeticCustomizer } from '../profile/CosmeticCustomizer';
import { RefreshedNoticeLoader } from '../shop/RefreshedItems';
import { ProfilePhotoPicker } from '../profile/ProfilePhotoPicker';
import { FavoritesPicker } from '../profile/FavoritesPicker';
import { SectionToggles } from '../profile/SectionToggles';
import { TagsCard } from '../tags/TagsCard';
import { ErrorState } from '../components/states';
import { CardStackSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { ArrowIcon, LockIcon, PersonGlyph } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { SendError } from '../reports/SendError';
import { HeldBanner } from '../reports/HeldNotice';

/** Edit Profile (/app/profile/edit): all profile customisation, equipping what you own and editing your details; buying is in the Shop. */
export function ProfileEdit(): React.JSX.Element {
  const t = useT();
  const { client, refreshUser } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [own, setOwn] = useState<ApiResult<PublicProfile> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await client.get<{ user: MeProfile }>('/me');
      // Your own profile as visitors see it says what /me does not: the frame worn and the sections shown. Read once here
      // for the cosmetics and the sections both.
      const mine = r.ok && r.data?.user?.id ? await client.get<PublicProfile>(`/users/${encodeURIComponent(r.data.user.id)}`) : null;
      if (cancelled) return;
      if (r.ok && r.data?.user?.username) setMe(r.data.user);
      else setError(r.ok ? t('profile.yoursNotLoaded') : describeError(r.error, t));
      setOwn(mine);
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

  // The heading needs nothing from the account, so it shows from the first frame.
  const header = (
    <div className="page-header">
      {/* The way back, as on every page: a chevron pointing back in the page's direction, then the words. */}
      <Link to="/app/profile" className="back-link">
        <ArrowIcon size={16} />
        {t('edit.back')}
      </Link>
      <span className="eyebrow">{t('edit.eyebrow')}</span>
      <h1 className="page-title">{t('profile.edit')}</h1>
    </div>
  );

  if (loading)
    return (
      <div className="container container-narrow">
        {header}
        <CardStackSkeleton count={4} label="profile.loadingYours" />
      </div>
    );
  if (error || !me) return <ErrorState
          title={t('profile.loadFailedYours')}
          message={error ?? t('profile.unavailable')}
          onRetry={() => setReloadKey((n) => n + 1)}
        />;

  return (
    <div className="container container-narrow">
      {header}

      {/* A held account can change its look but not put up a new picture or published words yet. */}
      <HeldBanner />
      {/* The one-time notice about refreshed backgrounds and icons. */}
      <RefreshedNoticeLoader />
      <ProfilePhotoPicker me={me} onChanged={changed} />
      <ProfileDetailsForm me={me} onSaved={changed} />
      <AvatarPicker me={me} onChanged={changed} />
      <CosmeticCustomizer me={me} frameSku={own?.ok ? (own.data.frameSku ?? null) : null} onChanged={changed} />
      <FavoritesPicker me={me} onChanged={changed} />
      <SectionToggles own={own} />
      <TagsCard />

      <div style={{ marginTop: 24 }}>
        <Link to="/app/settings" className="btn btn-secondary">{t('edit.accountSettings')}</Link>
      </div>
    </div>
  );
}

/** Display name and bio. */
function ProfileDetailsForm({ me, onSaved }: { me: MeProfile; onSaved: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const [displayName, setDisplayName] = useState(me.displayName ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [country, setCountry] = useState(me.country ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // A refusal of the save itself, possibly an account limit (a post mute covers name and bio), said with SendError.
  const [saveErr, setSaveErr] = useState<ApiError | null>(null);

  const dirty = displayName.trim() !== (me.displayName ?? '') || bio !== (me.bio ?? '') || country !== (me.country ?? '');

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setSaveErr(null);
    const body: { displayName?: string; bio?: string; country?: string } = {};
    if (displayName.trim() !== (me.displayName ?? '')) body.displayName = displayName.trim();
    if (bio !== (me.bio ?? '')) body.bio = bio;
    if (country !== (me.country ?? '')) body.country = country; // '' clears it.
    const res = await client.patch('/me', body);
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: t('edit.profileUpdated') });
      onSaved();
    } else {
      setSaveErr(res.error);
    }
  }

  return (
    <form className="card" onSubmit={save} style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.details')}</h2>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}
      <SendError error={saveErr} />
      <div className="field">
        <label className="field-label" htmlFor="displayName">{t('edit.displayName')}</label>
        <input id="displayName" className="input" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} placeholder={me.username} aria-describedby="displayName-hint" />
        <span className="field-hint" id="displayName-hint">{t('edit.displayNameHint')}</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="bio">{t('edit.bio')}</label>
        <textarea id="bio" className="input" style={{ height: 96, padding: '10px 14px', resize: 'vertical' }} value={bio} maxLength={1000} onChange={(e) => setBio(e.target.value)} placeholder={t('edit.bioPlaceholder')} aria-describedby="bio-hint" />
        <span className="field-hint" id="bio-hint">{t('edit.bioHint')} {bio.length}/1000</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="country">{t('edit.country')}</label>
        <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} aria-describedby="country-hint">
          <option value="">{t('edit.noCountry')}</option>
          {countriesIn(locale).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="field-hint" id="country-hint">{t('edit.countryHint')}</span>
      </div>
      <Button type="submit" disabled={busy || !dirty}>{busy ? t('edit.saving') : t('edit.saveChanges')}</Button>
    </form>
  );
}

/** Picks a default avatar (premium ones locked for non-premium users). */
function AvatarPicker({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // The uploaded photo is removed once, by the first choice that goes through.
  const photoGone = useRef(false);
  // Chosen at once; quick choices end in the last one, and a refusal puts back the one the server has (lib/optimistic.ts).
  const [selected, want] = useOptimistic<string | null>(
    me.selectedAvatarKey ?? null,
    async (key) => {
      // An uploaded photo always wins over a default avatar, so remove it first (database and storage) or choosing would
      // appear to do nothing.
      if (me.profilePhotoUrl && !photoGone.current) {
        const del = await client.delete('/me/profile-picture');
        if (!del.ok) return del;
        photoGone.current = true;
      }
      return client.put<{ avatarKey: string | null }>('/me/cosmetics/avatar', { key });
    },
    {
      onSaved: (_, key) => {
        setMsg({ kind: 'ok', text: key ? t('edit.photoUpdated') : t('edit.avatarCleared') });
        onChanged();
      },
      onFailed: (error) => setMsg({ kind: 'err', text: failureText(error, t) }),
    },
  );

  const registry = useApiGet<{ avatars: AvatarOption[] }>('/cosmetics/avatars');
  // A default an admin has replaced is offered as its new picture.
  const overrides = useArtOverrides();
  const avatars: AvatarOption[] =
    registry.data?.avatars && registry.data.avatars.length > 0
      ? registry.data.avatars
      // Every built-in avatar is free, so the offline fallback must not lock any.
      : DEFAULT_AVATAR_KEYS.map((key) => ({ key, requiresPremium: false }));
  const isPremium = me.premium ?? false;

  function pick(key: string | null): void {
    setMsg(null);
    want(key);
  }

  function onTile(a: AvatarOption, locked: boolean): void {
    if (locked) {
      setMsg({ kind: 'err', text: t('edit.premiumAvatar') });
      return;
    }
    pick(a.key);
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.avatar')}</h2>
      {me.profilePhotoUrl && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          {t('edit.photoShown')}
        </p>
      )}
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status">{msg.text}</div>}

      <div className="avatar-grid" role="radiogroup" aria-label={t('edit.chooseAvatar')}>
        <button
          type="button"
          className={`avatar-tile avatar-tile-none${selected === null ? ' is-selected' : ''}`}
          role="radio"
          aria-checked={selected === null}
          aria-label={t('edit.noAvatar')}
          onClick={() => pick(null)}
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
              onClick={() => onTile(a, locked)}
            >
              <img src={avatarAssetUrl(a.key, overrides)} alt="" loading="lazy" decoding="async" />
              {locked && (
                <span className="avatar-lock" aria-hidden="true">
                  <LockIcon size={12} weight="fill" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
