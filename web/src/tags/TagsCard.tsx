import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useOptimistic } from '../lib/optimistic';
import type { ApiError } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import {
  claimableCatalog,
  purchasableTags,
  tagLabel,
  type ClaimedTag,
  type ProfileTags,
  type TagRow,
} from '@kurda/shared';
import { claimTag, myClaimedTags, myTags, setTagDisplayed, tagCatalog, unclaimTag } from './api';

/**
 * The profile's tags: the main tag (derived by the server from roles and shop entitlements, so read-only), the
 * claimed tags, which can be shown, hidden or given up, and the tags left to claim, where sensitive ones need
 * explicit consent.
 */
export function TagsCard(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();

  const [profile, setProfile] = useState<ProfileTags | null>(null);
  const [claimed, setClaimed] = useState<ClaimedTag[]>([]);
  const [catalog, setCatalog] = useState<TagRow[] | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  /* The claim form: which tag, the optional value, and whether consent was given. */
  const [claiming, setClaiming] = useState<TagRow | null>(null);
  const [value, setValue] = useState('');
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    const [mine, claimedRes, cat] = await Promise.all([
      myTags(client),
      myClaimedTags(client),
      tagCatalog(client),
    ]);
    if (!mine.ok || !claimedRes.ok || !cat.ok) {
      setFailure((!mine.ok && mine.error) || (!claimedRes.ok && claimedRes.error) || (!cat.ok ? cat.error : null));
      return;
    }
    /* Defaulted, not trusted: an absent list means no tags, and must not take the Edit Profile page down. */
    setProfile({ main: mine.data.main ?? null, claimable: mine.data.claimable ?? [] });
    setClaimed(claimedRes.data.tags ?? []);
    setCatalog(cat.data.tags ?? []);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const startClaim = (tag: TagRow): void => {
    setClaiming(tag);
    setValue('');
    setConsent(false);
  };

  const submitClaim = useCallback(async () => {
    if (!claiming || busy) return;
    setBusy(true);
    setFailure(null);
    const res = await claimTag(client, {
      key: claiming.key,
      value: value.trim() || undefined,
      // Only sent for a tag that needs it; the server decides whether it does.
      consent: claiming.sensitive ? true : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setFailure(res.error);
      return;
    }
    setClaiming(null);
    await load();
  }, [claiming, busy, client, value, load]);

  /* Confirmation goes through `ConfirmButton`, like every destructive control, never the browser's `confirm()`. */
  const revoke = useCallback(
    async (tag: ClaimedTag) => {
      const res = await unclaimTag(client, tag.key);
      if (!res.ok) setFailure(res.error);
      await load();
    },
    [client, load],
  );

  const toClaim = catalog ? claimableCatalog(catalog, claimed) : [];
  const toBuy = catalog && profile ? purchasableTags(catalog, profile.main ?? null) : [];

  return (
    // The inventory's Tags tab links an owned tag here (profile/CosmeticCustomizer).
    <section id="tags" className="card tags-card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('tags.title')}</h2>

      {failure && <div className="msg msg-error" role="status">{describeError(failure, t)}</div>}

      {catalog === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <>
          <h3 className="friend-heading" style={{ fontSize: 'var(--text)' }}>{t('tags.main')}</h3>
          {profile?.main ? (
            <span className="badge badge-gold">{profile.main.label}</span>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>{t('tags.noMain')}</p>
          )}

          <h3 className="friend-heading" style={{ fontSize: 'var(--text)' }}>{t('tags.yours')}</h3>
          {claimed.length === 0 ? (
            <p className="muted" style={{ marginTop: 0 }}>{t('tags.none')}</p>
          ) : (
            <ul className="section-toggles">
              {claimed.map((tag) => (
                <ClaimedTagRow key={tag.key} tag={tag} busy={busy} onFailed={setFailure} onRevoke={() => revoke(tag)} />
              ))}
            </ul>
          )}

          {/* Automatic tags are shown with no controls, since nothing the reader does earns or removes them. */}
          {(profile?.claimable ?? []).some((c) => c.auto) && (
            <p className="field-hint" style={{ marginTop: 8 }}>
              {t('tags.automatic')}:{' '}
              {(profile?.claimable ?? [])
                .filter((c) => c.auto)
                .map((c) => tagLabel(c))
                .join(' · ')}
            </p>
          )}

          {toClaim.length > 0 && (
            <>
              <h3 className="friend-heading" style={{ fontSize: 'var(--text)' }}>{t('tags.add')}</h3>
              <div className="toolbar" style={{ flexWrap: 'wrap' }}>
                {toClaim.map((tag) => (
                  <button key={tag.key} type="button" className="chip" disabled={busy} onClick={() => startClaim(tag)}>
                    {tag.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {claiming && (
            <div style={{ marginTop: 12 }}>
              <h3 className="friend-heading" style={{ fontSize: 'var(--text)' }}>
                {t('tags.addTitle', { tag: claiming.label })}
              </h3>
              <input
                className="input"
                value={value}
                disabled={busy}
                placeholder={t('tags.valuePlaceholder', { tag: claiming.label })}
                aria-label={t('tags.valuePlaceholder', { tag: claiming.label })}
                onChange={(e) => setValue(e.target.value)}
              />

              {/* A sensitive tag needs consent ticked first; the server refuses the claim otherwise. */}
              {claiming.sensitive && (
                <label className="section-toggle">
                  <input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
                  <span className="section-toggle-text">
                    <span className="section-toggle-label">{t('tags.sensitiveConsent')}</span>
                    <span className="section-toggle-hint">{t('tags.consentHelp')}</span>
                  </span>
                </label>
              )}

              <div className="toolbar" style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  disabled={busy || (claiming.sensitive && !consent)}
                  onClick={() => void submitClaim()}
                >
                  {busy ? t('tags.adding') : t('tags.claim')}
                </Button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setClaiming(null)}>
                  {t('common.cancel')}
                </button>
              </div>
              {claiming.sensitive && !consent && (
                <p className="field-hint" style={{ marginBottom: 0 }}>{t('tags.consentNeeded')}</p>
              )}
            </div>
          )}

          {/* Bought in the Shop, not claimed. */}
          {toBuy.length > 0 && (
            <p className="field-hint" style={{ marginTop: 12, marginBottom: 0 }}>
              {toBuy.map((tag) => (
                <Link key={tag.key} to="/app/shop" style={{ marginInlineEnd: 10 }}>
                  {t('tags.getTag', { tag: tag.label })}
                </Link>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One claimed tag: shown or hidden on the profile at once (lib/optimistic.ts), quick presses ending in the last and a
 * refusal putting the box back with the reason; and the way to give it up.
 */
function ClaimedTagRow({
  tag,
  busy,
  onFailed,
  onRevoke,
}: {
  tag: ClaimedTag;
  /** A claim is being sent, which holds giving any tag up. */
  busy: boolean;
  onFailed: (error: ApiError) => void;
  onRevoke: () => Promise<void>;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [displayed, want] = useOptimistic(tag.displayed, (on) => setTagDisplayed(client, tag.key, on), { onFailed });
  return (
    <li>
      <div className="section-toggle" style={{ cursor: 'default' }}>
        <span className="section-toggle-text">
          <span className="section-toggle-label">{tagLabel(tag)}</span>
          <span className="section-toggle-hint">
            {tag.sensitive ? `${t('tags.sensitive')} · ` : ''}
            {displayed ? t('tags.shownOnProfile') : t('tags.hiddenStatus')}
          </span>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={displayed} onChange={(e) => want(e.target.checked)} />
          <span className="field-hint" style={{ margin: 0 }}>
            {t('tags.showOnProfile', { tag: tag.label })}
          </span>
        </label>
        <ConfirmButton
          className="btn btn-ghost btn-sm"
          label={t('tags.remove')}
          title={t('tags.removeTag', { tag: tag.label })}
          disabled={busy}
          onConfirm={onRevoke}
        />
      </div>
    </li>
  );
}
