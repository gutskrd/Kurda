import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { BlockIcon, CloseIcon, FlagIcon, MoreIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { ReportSheet } from '../reports/ReportSheet';
import { keepInView } from '../reports/keepInView';

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
 * Most people want both, so neither is offered as a substitute for the other —
 * and the report sheet, once sent, offers the block in one tap.
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // on a phone the ⋯ sits at the left of the profile card and the menu,
  // anchored to its right, ran under the card's edge: keep all of it in view
  useLayoutEffect(() => {
    if ((panel === 'menu' || panel === 'block') && popRef.current) keepInView(popRef.current);
  }, [panel]);

  /**
   * Escape closes, and so does a click anywhere else.
   *
   * Bound on the document rather than the wrapper: a menu that only closes when
   * you find its own button again is a menu that stays open.
   */
  useEffect(() => {
    // the report sheet is its own dialog, with its own Escape and backdrop
    if (!panel || panel === 'report') return;
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
      setError(describeError(res.error, t));
      return;
    }
    setPanel(null);
    onBlocked?.();
  }

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
        <div className="user-menu" role="menu" ref={popRef}>
          <button type="button" role="menuitem" className="user-menu-item" onClick={() => open('report')}>
            <FlagIcon size={16} /> {t('moderation.report')}
          </button>
          <button type="button" role="menuitem" className="user-menu-item is-danger" onClick={() => open('block')}>
            <BlockIcon size={16} /> {t('friends.block')}
          </button>
        </div>
      )}

      {panel === 'block' && (
        <div className="user-menu user-menu-wide" role="dialog" aria-label={t('friends.blockWho', { name })} ref={popRef}>
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

      {/* the same sheet as everywhere else something can be reported */}
      <ReportSheet
        open={panel === 'report'}
        onClose={() => setPanel(null)}
        target={{ targetType: 'user', targetId: userId }}
        name={name}
        block={{ userId, name }}
        onBlocked={onBlocked}
      />
    </div>
  );
}
