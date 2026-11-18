import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmButton } from '../components/ConfirmButton';
import { FlagIcon, MoreIcon, TrashIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { FeedItem } from '../lib/types';
import { keepInView } from '../reports/keepInView';
import { ReportSheet } from '../reports/ReportSheet';

/**
 * The ⋯ menu in a post's header: Report for somebody else's post, Delete for your own, kept out of the everyday
 * action row. Delete confirms in place (components/ConfirmButton). Guests get no menu.
 */
export function PostMenu({ item, onDelete }: { item: FeedItem; onDelete: () => Promise<void> }): React.JSX.Element | null {
  const t = useT();
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);

  // The ⋯ sits at the edge of a phone screen, so the open menu is nudged back inside the window.
  useLayoutEffect(() => {
    if (open && listRef.current) keepInView(listRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (status !== 'signedIn') return null;
  // Only the author may delete it; the server checks again, this only decides what to offer.
  const mine = user?.id === item.author.id;

  return (
    <span className={`msg-menu fcard-menu${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="msg-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('report.aboutPost')}
        title={t('report.aboutPost')}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon size={24} weight="bold" />
      </button>
      {open && (
        <span className="msg-menu-list" role="menu" ref={listRef} aria-label={t('report.aboutPost')}>
          {mine ? (
            <ConfirmButton
              role="menuitem"
              className="user-menu-item is-danger fcard-delete"
              title={t('feed.delete')}
              label={
                <>
                  <TrashIcon size={18} /> {t('feed.deleteShort')}
                </>
              }
              confirmLabel={t('feed.deleteConfirm')}
              busyLabel="…"
              onConfirm={onDelete}
            />
          ) : (
            <button
              type="button"
              role="menuitem"
              className="user-menu-item"
              onClick={() => {
                // Focus the ⋯ first, so the report sheet returns focus there; this menu item will be gone.
                buttonRef.current?.focus();
                setOpen(false);
                setReporting(true);
              }}
            >
              <FlagIcon size={18} /> {t('moderation.report')}
            </button>
          )}
        </span>
      )}
      {!mine && (
        <ReportSheet
          open={reporting}
          onClose={() => setReporting(false)}
          target={{ targetType: item.targetType === 'image' ? 'image_post' : 'library_post', targetId: item.id }}
          block={{ userId: item.author.id, name: item.author.username }}
        />
      )}
    </span>
  );
}
