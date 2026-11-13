import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton } from './CloseButton';
import { escapeClearsField } from './SearchField';
import { wrapTab } from './Sheet';
import { useT } from '../i18n/I18nProvider';
import { useLeaving } from '../lib/motion';
import { lockPageScroll } from '../lib/scrollLock';

/**
 * Accessible modal dialog: closes on Escape / backdrop click, takes the focus
 * when it opens and keeps it (Tab and Shift+Tab wrap round inside, as they do
 * in a Sheet — a dialog that lets the keyboard walk out into the page under
 * its backdrop has lost its reader), restores focus on close, and locks body
 * scroll while open.
 *
 * It is drawn at the end of the page, as a Sheet is, and not where it is
 * written: a dialog opened from inside a box with its own layer (a chat open
 * full-screen on a phone is one) was otherwise drawn inside that layer, under
 * the site's header, its top and its close button out of reach.
 *
 * Closed, it leaves the way it came (lib/motion.ts `useLeaving`,
 * styles/motion.css): the picture of it stays for a moment and goes, while
 * everything that matters has already happened — the focus is back where it
 * was, the page scrolls again, and what is still drawn is inert, is no longer
 * a dialog to assistive technology, and cannot be pressed. For a reader who
 * asked for less motion it is simply gone.
 */
export function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // The latest onClose, read when it is needed. Most callers pass a fresh
  // arrow on every render, and with it in the effect below, any re-render of
  // the page underneath — a game's state arriving every few seconds — ran the
  // effect again: focus went back to the panel, out of whatever field the
  // reader was typing in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const leaving = useLeaving(open);
  // what it held when it was last open: most callers stop passing it the moment they close it
  const held = useRef(children);
  if (open) held.current = children;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    panelRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent): void => {
      // words in a search field go first; the next Escape closes
      if (e.key === 'Escape') {
        if (!escapeClearsField(e)) closeRef.current();
      } else if (panelRef.current) wrapTab(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open && !leaving) return null;

  return createPortal(
    <div className={`modal-overlay${leaving ? ' is-leaving' : ''}`} onMouseDown={leaving ? undefined : onClose} aria-hidden={leaving || undefined} inert={leaving}>
      <div
        className="modal-panel"
        role={leaving ? undefined : 'dialog'}
        aria-modal={leaving ? undefined : 'true'}
        aria-label={leaving ? undefined : label}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CloseButton className="modal-close" label={t('common.close')} onClick={onClose} />
        {open ? children : held.current}
      </div>
    </div>,
    document.body,
  );
}
