import { useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';

/**
 * What a sheet of letter paper needs from the scrolling page it lies on (LettersScreen, LetterThreadScreen). While
 * drawing, the page is held still (`lock`) and two fingers move it instead (`by`). Whatever is being typed stays
 * above the keyboard (`reveal`); since the keyboard shrinks the page, the target is re-checked each time it does.
 */
export interface PaperHost {
  /** Holds the page still while drawing (true), or lets it scroll again. */
  lock: (still: boolean) => void;
  /** Scrolls the page by `dy` points, as a two-finger drag on the sheet does. */
  by: (dy: number) => void;
  /**
   * Keeps `view` in sight, whole or only its last `tail` points with `room` to spare below, until asked again or
   * cleared with null; with `once`, scrolls it into sight now only.
   */
  reveal: (view: View | null, options?: { tail?: number; room?: number; once?: boolean }) => void;
}

/** Room kept under what is being typed, so the next line shows too. */
const ROOM = 24;

interface Ask {
  view: View;
  tail?: number;
  room?: number;
}

export function usePaperScroll(): {
  scroll: {
    ref: React.RefObject<ScrollView | null>;
    scrollEnabled: boolean;
    scrollEventThrottle: number;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (e: LayoutChangeEvent) => void;
    onContentSizeChange: (w: number, h: number) => void;
  };
  host: PaperHost;
} {
  const ref = useRef<ScrollView | null>(null);
  const [locked, setLocked] = useState(false);
  // Scroll offset, visible height and content height, tracked as they change.
  const at = useRef({ y: 0, seen: 0, content: 0 });
  const wanted = useRef<Ask | null>(null);

  const { host, look } = useMemo(() => {
    const scrollTo = (y: number): void => {
      const most = Math.max(0, at.current.content - at.current.seen);
      const to = Math.max(0, most > 0 ? Math.min(most, y) : y);
      at.current.y = to;
      ref.current?.scrollTo({ y: to, animated: false });
    };
    /** Scrolls just enough to bring `ask` into sight. */
    const show = (ask: Ask): void => {
      const page = ref.current as unknown as View | null;
      if (!page || typeof ask.view.measureInWindow !== 'function' || typeof page.measureInWindow !== 'function') return;
      page.measureInWindow((_px, pageTop, _pw, pageHeight) => {
        ask.view.measureInWindow((_x, top, _w, height) => {
          if (!pageHeight || !height) return;
          const room = ask.room ?? ROOM;
          const from = ask.tail !== undefined ? top + Math.max(0, height - ask.tail) : top;
          const to = top + height + room;
          const bottom = pageTop + pageHeight;
          // Far enough down for its foot to show, never so far its head goes above the top.
          if (to > bottom) scrollTo(at.current.y + Math.min(to - bottom, Math.max(0, from - pageTop)));
          else if (from < pageTop) scrollTo(at.current.y - (pageTop - from) - room);
        });
      });
    };
    const paperHost: PaperHost = {
      lock: (still) => setLocked(still),
      by: (dy) => scrollTo(at.current.y + dy),
      reveal: (view, options) => {
        const ask = view ? { view, tail: options?.tail, room: options?.room } : null;
        wanted.current = options?.once ? null : ask;
        if (ask) show(ask);
      },
    };
    return {
      host: paperHost,
      look: () => {
        if (wanted.current) show(wanted.current);
      },
    };
  }, []);

  return {
    scroll: {
      ref,
      scrollEnabled: !locked,
      scrollEventThrottle: 32,
      onScroll: (e) => {
        at.current.y = e.nativeEvent.contentOffset.y;
      },
      onLayout: (e) => {
        const seen = e.nativeEvent.layout.height;
        const shrank = seen < at.current.seen;
        at.current.seen = seen;
        // The keyboard came up and shrank the page, so look again.
        if (shrank) look();
      },
      onContentSizeChange: (_w, h) => {
        at.current.content = h;
      },
    },
    host,
  };
}
