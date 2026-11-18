import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { CloseButton } from '../components/CloseButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { BlockIcon, CheckIcon, FlagIcon, MoreIcon, RemovePersonIcon, ShareIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { ReportSheet } from '../reports/ReportSheet';
import { useBlock } from '../reports/block';
import { keepInView } from '../reports/keepInView';
import { shareProfileLink } from './share';

type Panel = null | 'menu' | 'report' | 'block';

/**
 * The ⋯ menu about another person. Block cannot be undone from the card, so it takes a deliberate press. Report and
 * Block stay separate, plainly named items one press from the menu wherever a person is shown, as store policies and
 * illegal-content notices require; a sent report offers the block in one tap. On a friends list row
 * (pages/Friends.tsx) `remove` comes first and is confirmed; on a profile `share` leads.
 */
export function UserActions({
  userId,
  name,
  onBlocked,
  onBlockRefused,
  remove,
  share = false,
  className = '',
}: {
  userId: string;
  /** how to name them in the confirmations, so it is clear who this is about */
  name: string;
  /** Called as the block is confirmed, before the server answers (reports/block.ts). */
  onBlocked?: () => void;
  /** The server refused the block: put back what `onBlocked` took away. */
  onBlockRefused?: () => void;
  /** For a friend: the item’s label, its full meaning, and the removal. */
  remove?: { label: string; title: string; onConfirm: () => void | Promise<void> };
  /** on a profile: the menu also sends that profile's address to somebody */
  share?: boolean;
  className?: string;
}): React.JSX.Element {
  const t = useT();
  const sendBlock = useBlock();
  const [panel, setPanel] = useState<Panel>(null);
  // Without a share sheet the link is copied, said briefly in the item before the menu closes.
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // On a phone the ⋯ is at the card’s left, where the right-anchored menu would run off the edge, so it is kept in view.
  useLayoutEffect(() => {
    if ((panel === 'menu' || panel === 'block') && popRef.current) keepInView(popRef.current);
  }, [panel]);

  /** Escape or a click anywhere closes it, so the listeners are on the document rather than the wrapper. */
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
    setPanel(next);
  }

  async function send(): Promise<void> {
    const outcome = await shareProfileLink(userId, name);
    if (outcome !== 'copied') {
      setPanel(null);
      return;
    }
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
      setPanel((p) => (p === 'menu' ? null : p));
    }, 1400);
  }

  function block(): void {
    setPanel(null);
    onBlocked?.();
    void sendBlock(userId, onBlockRefused);
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
          {share && (
            <button type="button" role="menuitem" className="user-menu-item" onClick={() => void send()}>
              {copied ? <CheckIcon size={16} /> : <ShareIcon size={16} />}
              <span aria-live="polite">{copied ? t('share.copied') : t('profile.share')}</span>
            </button>
          )}
          {remove && (
            // pressed once it asks, pressed again it is done (ConfirmButton), and the menu goes with it
            <ConfirmButton
              role="menuitem"
              className="user-menu-item"
              title={remove.title}
              label={
                <>
                  <RemovePersonIcon size={16} /> {remove.label}
                </>
              }
              onConfirm={async () => {
                await remove.onConfirm();
                setPanel(null);
              }}
            />
          )}
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
            <CloseButton className="is-inline" label={t('common.close')} onClick={() => setPanel(null)} />
          </div>
          <p className="user-menu-note">{t('moderation.blockNote')}</p>
          <div className="user-menu-actions">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)}>
              {t('common.cancel')}
            </Button>
            <button type="button" className="btn btn-sm user-menu-danger" onClick={block}>
              {t('friends.block')}
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
        onBlockRefused={onBlockRefused}
      />
    </div>
  );
}
