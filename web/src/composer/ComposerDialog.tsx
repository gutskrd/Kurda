import { useEffect, useRef } from 'react';
import { lockPageScroll } from '../lib/scrollLock';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The composer's window: a centred panel on a wide screen, full screen on a phone. Not the shared Modal, since every
 * way out must go through `onRequestClose` to ask about unsaved words, and Post sits in a header above the phone
 * keyboard. Focus moves to `initialFocus` on open, wraps inside, and returns on close; the page behind does not scroll.
 */
export function ComposerDialog({
  labelledBy,
  onRequestClose,
  initialFocus,
  children,
}: {
  labelledBy: string;
  /** Escape or a backdrop click; the composer decides whether to ask. */
  onRequestClose: () => void;
  initialFocus?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    (initialFocus?.current ?? panelRef.current)?.focus({ preventScroll: true });
    return () => {
      unlock();
      restore?.focus?.({ preventScroll: true });
    };
    // Once per opening, since the composer mounts fresh each time and `initialFocus` is a ref read on open.
  }, [initialFocus]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      closeRef.current();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="cmp-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        className="cmp-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
