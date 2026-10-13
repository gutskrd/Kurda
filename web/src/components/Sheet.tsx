import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';
import { useT } from '../i18n/I18nProvider';

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
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // the capture phase at the window runs before any other keydown listener
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-overlay" onMouseDown={onClose}>
      <div
        className={`sheet-panel${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="sheet-grip" aria-hidden />
        <button type="button" className="sheet-close" aria-label={t('common.close')} onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
