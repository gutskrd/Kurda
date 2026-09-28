import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
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
 * Tags & badges (KUR-286/287), which the browser had none of.
 *
 * Three things in one pane, because they are three views of one question —
 * what this profile says about its owner:
 *
 *  - the **main tag**, which is not stored anywhere: the server derives it from
 *    roles and shop entitlements every time, so a refund drops it. Read-only
 *    here by nature, not by choice.
 *  - the tags you have claimed, each of which you can show, hide, or give up.
 *  - what is left to add, and the sensitive ones among them, which need consent
 *    said out loud before they are claimed (#109).
 */
export function TagsCard(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();

  const [profile, setProfile] = useState<ProfileTags | null>(null);
  const [claimed, setClaimed] = useState<ClaimedTag[]>([]);
  const [catalog, setCatalog] = useState<TagRow[] | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  /* claim form: which tag, the optional value, and whether consent was given */
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
    /*
     * Defaulted, not trusted. A 200 whose body is missing `tags` used to put
     * `undefined` into a list and take the whole Edit Profile page down with it
     * on the next render — this card sits below four others that were working
     * fine. An absent list means no tags, which is a thing this pane can say.
     */
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
      // only sent for a tag that needs it; the server decides whether it does
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

  /**
   * Showing and hiding, optimistically.
   *
   * A switch that waits for the round trip reads as one that did not register.
   * A rejection re-reads everything rather than guessing which way to put it
   * back: the server is the only thing that knows what is stored.
   */
  const toggleDisplay = useCallback(
    async (tag: ClaimedTag, displayed: boolean) => {
      setClaimed((prev) => prev.map((c) => (c.key === tag.key ? { ...c, displayed } : c)));
      const res = await setTagDisplayed(client, tag.key, displayed);
      if (!res.ok) {
        setFailure(res.error);
        await load();
      }
    },
    [client, load],
  );

  /*
   * The asking belongs to `ConfirmButton`, not to `confirm()`. That component
   * exists specifically in place of the browser dialog and says why in its own
   * docstring: a dialog the app cannot style, which lands outside the page for a
   * screen reader and is blocked outright in some embedded browsers, leaving the
   * action silently impossible. Every other destructive control in the browser —
   * removing a friend, a favourite, a block, a comment — goes through it.
   */
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
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('tags.title')}</h2>

      {failure && <div className="msg msg-error" role="status">{describeError(failure, t)}</div>}

      {catalog === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <>
          <h3 className="friend-heading" style={{ fontSize: '0.95rem' }}>{t('tags.main')}</h3>
          {profile?.main ? (
            <span className="badge badge-gold">{profile.main.label}</span>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>{t('tags.noMain')}</p>
          )}

          <h3 className="friend-heading" style={{ fontSize: '0.95rem' }}>{t('tags.yours')}</h3>
          {claimed.length === 0 ? (
            <p className="muted" style={{ marginTop: 0 }}>{t('tags.none')}</p>
          ) : (
            <ul className="section-toggles">
              {claimed.map((tag) => (
                <li key={tag.key}>
                  <div className="section-toggle" style={{ cursor: 'default' }}>
                    <span className="section-toggle-text">
                      <span className="section-toggle-label">{tagLabel(tag)}</span>
                      <span className="section-toggle-hint">
                        {tag.sensitive ? `${t('tags.sensitive')} · ` : ''}
                        {tag.displayed ? t('tags.shownOnProfile') : t('tags.hiddenStatus')}
                      </span>
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={tag.displayed}
                        disabled={busy}
                        onChange={(e) => void toggleDisplay(tag, e.target.checked)}
                      />
                      <span className="field-hint" style={{ margin: 0 }}>
                        {t('tags.showOnProfile', { tag: tag.label })}
                      </span>
                    </label>
                    <ConfirmButton
                      className="btn btn-ghost btn-sm"
                      label={t('tags.remove')}
                      title={t('tags.removeTag', { tag: tag.label })}
                      disabled={busy}
                      onConfirm={() => revoke(tag)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* auto-granted tags are shown so they are not a mystery, and carry no
              controls: nothing the reader does earns or removes them */}
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
              <h3 className="friend-heading" style={{ fontSize: '0.95rem' }}>{t('tags.add')}</h3>
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
              <h3 className="friend-heading" style={{ fontSize: '0.95rem' }}>
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

              {/*
                A sensitive tag is claimed only once consent has been ticked, and
                the button stays disabled until it is — the server refuses the
                claim otherwise, and a refusal after the fact reads as a bug
                rather than as the question it is.
              */}
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

          {/* bought, not claimed — the Shop is where these come from */}
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
