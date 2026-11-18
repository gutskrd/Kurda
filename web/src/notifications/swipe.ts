import { useMemo, useRef, useState } from 'react';

/** Swiping a notification row aside (NotificationList.tsx). */

/** How far a row slides open (px), and the share of its width a swipe must cross to remove it. */
const SWIPE = { open: 168, away: 0.62 } as const;

/**
 * A row swiped toward its start: it follows the finger, opens if released past halfway, closes if short, and is
 * removed when swiped most of the way. A vertical start is left to scrolling, and a tap on an open row closes it
 * instead of following its link.
 */
export function useSwipe(
  open: boolean,
  onOpen: (open: boolean) => void,
  onRemove: () => void,
  row: React.RefObject<HTMLLIElement | null>,
): { slide: React.CSSProperties; dragging: boolean; handlers: React.HTMLAttributes<HTMLDivElement> } {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; from: number; dir: number; decided: 'x' | 'y' | null; id: number } | null>(null);
  const moved = useRef(false);
  const offset = drag ?? (open ? -SWIPE.open : 0);

  const handlers = useMemo<React.HTMLAttributes<HTMLDivElement>>(
    () => ({
      onPointerDown: (e) => {
        if (e.pointerType !== 'touch') return;
        const dir = getComputedStyle(e.currentTarget).direction === 'rtl' ? -1 : 1;
        start.current = { x: e.clientX, y: e.clientY, from: open ? -SWIPE.open : 0, dir, decided: null, id: e.pointerId };
        moved.current = false;
      },
      onPointerMove: (e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const dx = (e.clientX - s.x) * s.dir;
        const across = Math.abs(dx);
        const down = Math.abs(e.clientY - s.y);
        if (s.decided === null) {
          // The first few pixels decide between a swipe and scrolling.
          if (down > 10 && down > across) {
            s.decided = 'y';
            return;
          }
          if (across >= 8) s.decided = 'x';
          else return;
          // Capture the pointer from here; one the browser no longer tracks is simply not captured.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* Nothing to capture. */
          }
        }
        if (s.decided !== 'x') return;
        moved.current = true;
        const width = row.current?.offsetWidth ?? 360;
        const raw = s.from + dx;
        // Past its stops it gives a little, like a spring.
        const next = raw > 0 ? raw * 0.2 : raw < -SWIPE.open ? -SWIPE.open + (raw + SWIPE.open) * 0.8 : raw;
        setDrag(Math.max(next, -width));
      },
      onPointerUp: (e) => {
        const s = start.current;
        start.current = null;
        if (!s || s.decided !== 'x' || drag === null) {
          setDrag(null);
          return;
        }
        const width = row.current?.offsetWidth ?? 360;
        if (-drag > width * SWIPE.away) onRemove();
        else onOpen(-drag > SWIPE.open / 2);
        setDrag(null);
        void e;
      },
      onPointerCancel: () => {
        start.current = null;
        setDrag(null);
      },
      onClickCapture: (e) => {
        // A swipe is not a tap, and a tap on an open row closes it rather than following it.
        if (moved.current || open) {
          e.preventDefault();
          e.stopPropagation();
          moved.current = false;
          if (open && !(e.target as HTMLElement).closest('.note-tool')) onOpen(false);
        }
      },
    }),
    [open, drag, onOpen, onRemove, row],
  );

  const dir = typeof document !== 'undefined' && document.dir === 'rtl' ? -1 : 1;
  return { slide: offset === 0 ? {} : { transform: `translateX(${offset * dir}px)` }, dragging: drag !== null, handlers };
}
