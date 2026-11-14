import { useMemo, useRef, useState } from 'react';

/**
 * A notification row pulled aside by a finger (NotificationList.tsx).
 */

/** How far a row slides open to show what can be done with it, and how far across it has to be pulled to be taken away at once. */
export const SWIPE = { open: 168, away: 0.62 } as const;

/**
 * A row pulled sideways by a finger: it follows the finger, opens on what is
 * under it when let go past halfway, closes when let go short of it, and is
 * taken away when pulled most of the way across. A pull that starts up or
 * down is the list scrolling, and is left to it; a row pulled open keeps a
 * tap from following its link, which closes it instead. Whichever way the
 * language runs, the row is pulled toward its start.
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
          // the first few pixels say which it is: a pull aside, or the list scrolling
          if (down > 10 && down > across) {
            s.decided = 'y';
            return;
          }
          if (across >= 8) s.decided = 'x';
          else return;
          // held to the row from here, wherever the finger goes; a pointer the browser no longer tracks is simply not held
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* nothing to hold */
          }
        }
        if (s.decided !== 'x') return;
        moved.current = true;
        const width = row.current?.offsetWidth ?? 360;
        const raw = s.from + dx;
        // past its stops it gives a little, as a thing held by a spring
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
        // a pull is not a tap, and a tap on a row pulled open closes it rather than following it
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
