import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton } from './CloseButton';
import { escapeClearsField } from './SearchField';
import { useT } from '../i18n/I18nProvider';
import { useLeaving } from '../lib/motion';
import { lockPageScroll } from '../lib/scrollLock';

/**
 * A dialog that rises from the bottom on a phone, where the hand is, and sits in the middle on a wider screen (the report
 * sheet, the gift picker). Escape and the backdrop close it, Tab is trapped inside, and focus returns to the opener.
 *
 * It is portalled to the end of <body>, because a backdrop filter on an ancestor (a profile card) would make it the
 * containing block for fixed positioning. Its Escape is caught in the capture phase so closing it does not also close the
 * profile underneath. Closing plays its exit as Modal does (lib/motion.ts `useLeaving`). It has no grip, since it cannot
 * be dragged.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `box`, for dialogs other than Sheet that must hold focus (a rare gift's stage). */
export function wrapTab(e: KeyboardEvent, box: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  );
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === box || !box.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !box.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

export function Sheet({
  open,
  onClose,
  label,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element | null {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // The latest onClose, without re-running the effect (and refocusing) on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const leaving = useLeaving(open);
  // What it held when last open: most callers stop passing it the moment they close it.
  const held = useRef(children);
  if (open) held.current = children;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    panelRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // A search field's words are cleared first; the next Escape closes.
        if (escapeClearsField(e)) return;
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (panelRef.current) wrapTab(e, panelRef.current);
    };
    // Capture phase at the window, before any other keydown listener.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlock();
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open && !leaving) return null;

  return createPortal(
    <div className={`sheet-overlay${leaving ? ' is-leaving' : ''}`} onMouseDown={leaving ? undefined : onClose} aria-hidden={leaving || undefined} inert={leaving}>
      <div
        className={`sheet-panel${className ? ` ${className}` : ''}`}
        role={leaving ? undefined : 'dialog'}
        aria-modal={leaving ? undefined : 'true'}
        aria-label={leaving ? undefined : label}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CloseButton className="sheet-close" label={t('common.close')} onClick={onClose} />
        {open ? children : held.current}
      </div>
    </div>,
    document.body,
  );
}
