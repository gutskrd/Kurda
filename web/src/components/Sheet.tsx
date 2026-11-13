import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton } from './CloseButton';
import { escapeClearsField } from './SearchField';
import { useT } from '../i18n/I18nProvider';
import { useLeaving } from '../lib/motion';
import { lockPageScroll } from '../lib/scrollLock';

/**
 * A dialog that rises from the bottom on a phone and sits in the middle on a
 * wider screen — the report sheet and the gift picker.
 *
 * `Modal` is a centred box, which on a phone puts the first choice of a long
 * list half a screen away from the thumb that has to make it. A sheet starts
 * where the hand is. It also keeps focus inside itself while it is open
 * (Tab and Shift+Tab wrap), which a report form in particular needs: tabbing
 * out of it into the conversation it is about is a way to lose your place in
 * something that was hard to start.
 *
 * Escape and the backdrop close it; focus returns to whatever opened it.
 *
 * It is drawn at the end of <body>, not where it is used: a sheet opened from
 * inside a glass panel (a profile card is one) would otherwise be positioned
 * inside that panel, because a backdrop filter makes its own containing block
 * for anything fixed. And its Escape is caught before anything under it hears
 * it, so closing the sheet does not also close the profile it was opened from.
 *
 * Closed, it leaves the way it came — down off the bottom edge on a phone —
 * as a Modal does (lib/motion.ts `useLeaving`): only its picture stays for
 * that moment, inert and no longer a dialog, with the focus already back
 * where it was. There is no grip at its top: a grip says "drag me", and this
 * sheet is closed by its ✕, by Escape and by a press beside it, so the grip
 * that used to be drawn there promised something that did not happen.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab and Shift+Tab inside `box`: past its last control to its first,
 * and back. For a dialog that is not a Sheet but must hold focus the same way
 * (the stage a rare or legendary gift opens on).
 */
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
  /** the dialog's accessible name */
  label: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element | null {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // the latest onClose without re-running the effect (and refocusing) on every render
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
      if (e.key === 'Escape') {
        // words in a search field go first; the next Escape closes
        if (escapeClearsField(e)) return;
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (panelRef.current) wrapTab(e, panelRef.current);
    };
    // the capture phase at the window runs before any other keydown listener
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
