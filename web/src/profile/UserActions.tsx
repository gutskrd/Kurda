import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { BlockIcon, CloseIcon, FlagIcon, MoreIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** What a reporter says the problem is. Matches the server's enum exactly. */
const CATEGORIES: Array<{ key: string; labelKey: MessageKey }> = [
  { key: 'harassment', labelKey: 'moderation.category.harassment' },
  { key: 'spam', labelKey: 'moderation.category.spam' },
  { key: 'impersonation', labelKey: 'moderation.category.impersonation' },
  { key: 'hate', labelKey: 'moderation.category.hate' },
  { key: 'self_harm', labelKey: 'moderation.category.selfHarm' },
  { key: 'other', labelKey: 'moderation.category.other' },
];

/** The server refuses anything shorter; saying so up front beats a rejection. */
const MIN_REASON = 10;
const MAX_REASON = 1000;

type Panel = null | 'menu' | 'report' | 'block';

/**
 * What you can do about another person, tucked behind a ⋯.
 *
 * Block used to be a button sitting in the open on the profile card. It is the
 * one action there that cannot be undone from that screen — the moment it lands
 * the profile answers 404 to you — and it sat one thumb-width from "Message".
 * Behind a menu it takes an extra, deliberate press.
 *
 * Reporting lives here too, because the two are what you reach for at the same
 * moment and they do different halves of the job: a block ends it for you and
 * tells nobody; a report tells a moderator and changes nothing you can see.
 * Most people want both, so neither is offered as a substitute for the other.
 */
export function UserActions({
  userId,
  name,
  onBlocked,
  className = '',
}: {
  userId: string;
  /** how to name them in the confirmations, so it is clear who this is about */
  name: string;
  /** called once the block has actually landed */
  onBlocked?: () => void;
  className?: string;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('harassment');
  const [reason, setReason] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  /**
   * Escape closes, and so does a click anywhere else.
   *
   * Bound on the document rather than the wrapper: a menu that only closes when
   * you find its own button again is a menu that stays open.
   */
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPanel(null);
        menuRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [panel]);

  function open(next: Panel): void {
    setError(null);
    setPanel(next);
  }

  async function block(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post(`/friends/${userId}/block`);
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error));
      return;
    }
    setPanel(null);
    onBlocked?.();
  }

  async function report(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (reason.trim().length < MIN_REASON) return;
    setBusy(true);
    setError(null);
    const res = await client.post(`/users/${userId}/report`, { category, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error));
      return;
    }
    setPanel(null);
    setReason('');
    // the server tells nobody anything either way, so this note is the only
    // acknowledgement there is — and it must not promise an outcome
    setDone(t('moderation.reportThanks'));
  }

  const short = reason.trim().length < MIN_REASON;

  return (
    <div className={`user-actions${className ? ` ${className}` : ''}`} ref={wrapRef}>
      <button
        ref={menuRef}
        type="button"
        className="user-actions-btn"
        aria-haspopup="menu"
        aria-expanded={panel !== null}
        aria-label={t('moderation.moreAbout', { name })}
        title={t('moderation.more')}
        onClick={() => setPanel(panel ? null : 'menu')}
      >
        <MoreIcon size={18} />
      </button>

      {panel === 'menu' && (
        <div className="user-menu" role="menu">
          <button type="button" role="menuitem" className="user-menu-item" onClick={() => open('report')}>
            <FlagIcon size={16} /> {t('moderation.report')}
          </button>
          <button type="button" role="menuitem" className="user-menu-item is-danger" onClick={() => open('block')}>
            <BlockIcon size={16} /> {t('friends.block')}
          </button>
        </div>
      )}

      {panel === 'block' && (
        <div className="user-menu user-menu-wide" role="dialog" aria-label={t('friends.blockWho', { name })}>
          <div className="user-menu-head">
            <strong>{t('moderation.blockWhoTitle', { name })}</strong>
            <button type="button" className="user-menu-x" onClick={() => setPanel(null)} aria-label={t('common.close')}>
              <CloseIcon size={15} />
            </button>
          </div>
          <p className="user-menu-note">{t('moderation.blockNote')}</p>
          {error && <div className="msg msg-error">{error}</div>}
          <div className="user-menu-actions">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <button type="button" className="btn btn-sm user-menu-danger" onClick={() => void block()} disabled={busy}>
              {busy ? t('moderation.blocking') : t('friends.block')}
            </button>
          </div>
        </div>
      )}

      {panel === 'report' && (
        <form className="user-menu user-menu-wide" onSubmit={report} aria-label={t('moderation.reportWho', { name })}>
          <div className="user-menu-head">
            <strong>{t('moderation.reportWho', { name })}</strong>
            <button type="button" className="user-menu-x" onClick={() => setPanel(null)} aria-label={t('common.close')}>
              <CloseIcon size={15} />
            </button>
          </div>

          <label className="user-menu-label" htmlFor="report-category">
            {t('moderation.whatIsHappening')}
          </label>
          <select
            id="report-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>

          <label className="user-menu-label" htmlFor="report-reason">
            {t('moderation.whatShouldModKnow')}
          </label>
          {/*
            Required, unlike reporting a post. There is no post attached to a
            report about a person, so what is written here is the entire case —
            without it there is nothing for a moderator to act on.
          */}
          <textarea
            id="report-reason"
            className="input"
            rows={3}
            value={reason}
            maxLength={MAX_REASON}
            required
            placeholder={t('moderation.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="user-menu-note">
            {short
              ? t('moderation.reasonTooShort', { min: MIN_REASON })
              : t('moderation.charactersLeft', { count: MAX_REASON - reason.trim().length })}
          </p>

          {error && <div className="msg msg-error">{error}</div>}
          <div className="user-menu-actions">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" type="submit" disabled={busy || short}>
              {busy ? t('profile.sending') : t('moderation.sendReport')}
            </Button>
          </div>
        </form>
      )}

      {done && (
        <p className="user-actions-done" role="status">
          {done}
        </p>
      )}
    </div>
  );
}
