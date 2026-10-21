import { useEffect, useRef } from 'react';
import { CloseIcon } from './icons';
import { escapeClearsField } from './SearchField';
import { wrapTab } from './Sheet';
import { useT } from '../i18n/I18nProvider';

/**
 * Accessible modal dialog: closes on Escape / backdrop click, takes the focus
 * when it opens and keeps it (Tab and Shift+Tab wrap round inside, as they do
 * in a Sheet — a dialog that lets the keyboard walk out into the page under
 * its backdrop has lost its reader), restores focus on close, and locks body
 * scroll while open.
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

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      // words in a search field go first; the next Escape closes
      if (e.key === 'Escape') {
        if (!escapeClearsField(e)) closeRef.current();
      } else if (panelRef.current) wrapTab(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label={t('common.close')} onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
