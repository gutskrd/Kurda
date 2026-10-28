import { useEffect, useRef } from 'react';
import { lockPageScroll } from '../lib/scrollLock';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The composer's window: a centred panel on a wide screen, the whole screen on
 * a phone.
 *
 * Not the shared Modal, for two reasons. Closing has to ask first when there
 * is something written (the Modal closed on Escape or a stray click on the
 * backdrop and threw the words away), so every way out goes through
 * `onRequestClose`. And the Post button lives in the header, at the top, where
 * a phone's keyboard can never cover it — so the panel has a header of its own
 * instead of the Modal's corner ×.
 *
 * Focus moves in when it opens (to `initialFocus`, the text box), stays inside
 * while it is open (Tab and Shift+Tab wrap), and goes back to whatever opened
 * it when it closes. The page behind does not scroll.
 */
export function ComposerDialog({
  labelledBy,
  onRequestClose,
  initialFocus,
  children,
}: {
  labelledBy: string;
  /** Escape, or a click on the backdrop: the composer decides whether to ask */
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
    // once per opening: the composer is mounted fresh each time
    // (initialFocus is a ref, read when it opens)
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
