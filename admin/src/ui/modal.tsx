/**
 * What every layer over the page shares — a dialog, a drawer, the phone's
 * menu: it takes the keyboard's focus when it opens and gives it back when it
 * closes, keeps Tab inside itself, closes on Escape, and makes the page behind
 * it unreachable (inert) and still, so a screen reader cannot wander off into a
 * page the eye cannot see.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[inert]'));
}

/** How many layers are open, so the page is let go only when the last one closes. */
let openLayers = 0;

function appRoot(): HTMLElement | null {
  return document.getElementById('root');
}

export function useModal(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  // the latest onClose, without re-running the effect (and refocusing) on every render
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = ref.current;
    if (!layer) return;

    // the first field that asks for it, else the first thing that can take focus, else the layer itself
    const first = layer.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(layer)[0] ?? layer;
    first.focus();

    openLayers += 1;
    const root = appRoot();
    if (openLayers === 1) {
      root?.setAttribute('inert', '');
      document.body.classList.add('has-layer');
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(layer);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    layer.addEventListener('keydown', onKey);
    return () => {
      layer.removeEventListener('keydown', onKey);
      openLayers -= 1;
      if (openLayers === 0) {
        root?.removeAttribute('inert');
        document.body.classList.remove('has-layer');
      }
      // back to where the person was, if that is still on the page
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, ref]);
}

/** Layers render at the end of <body>, outside the app root that goes inert behind them. */
export function Layer({ children }: { children: ReactNode }): React.JSX.Element {
  return createPortal(children, document.body);
}
