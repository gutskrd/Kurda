import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton } from './CloseButton';
import { escapeClearsField } from './SearchField';
import { wrapTab } from './Sheet';
import { useT } from '../i18n/I18nProvider';
import { useLeaving } from '../lib/motion';
import { originIn } from '../lib/opener';
import { lockPageScroll } from '../lib/scrollLock';

/**
 * Accessible modal dialog: closes on Escape or a backdrop press, traps Tab inside, restores focus on close and locks page
 * scroll. It is portalled to the end of the page so a dialog opened inside a layered box (a full-screen chat on a phone)
 * is not drawn under the header.
 *
 * Its panel grows out of the press that opened it (lib/opener.ts, styles/motion.css `panel-grow`) and shrinks back there
 * on close; a dialog nothing opened rises in the middle. Closing plays its exit (lib/motion.ts `useLeaving`) while focus,
 * scroll and inertness are already restored. Under reduced motion it simply appears and goes.
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
  // Callers pass a fresh arrow each render; keeping it in the effect re-ran it on every re-render and pulled focus out of
  // the field being typed in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const leaving = useLeaving(open);
  // What it held when last open: most callers stop passing it the moment they close it.
  const held = useRef(children);
  if (open) held.current = children;
  // The panel's transform origin; null when nothing opened it.
  const [origin, setOrigin] = useState<string | null>(null);

  // Before the first frame, so the panel never starts from the middle and then moves.
  useLayoutEffect(() => {
    if (open) setOrigin(panelRef.current ? originIn(panelRef.current) : null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    panelRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent): void => {
      // A search field's words are cleared first; the next Escape closes.
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
        className={`modal-panel${origin ? ' is-from-opener' : ''}`}
        style={origin ? { transformOrigin: origin } : undefined}
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
