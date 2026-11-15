import { useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';

/**
 * What a sheet of letter paper asks of the screen it lies on, and the hook
 * that gives it (LettersScreen and LetterThreadScreen, whose page scrolls).
 *
 * A finger drawing on the sheet must not move the page, so while the pen is
 * in hand the page is held still (`lock`), and two fingers on the sheet move
 * it instead (`by`), as they would a real sheet on a table. And whatever is
 * being typed is kept above the keyboard (`reveal`): the end of the letter as
 * it grows line by line, or a note's field. The keyboard takes its room by
 * shrinking the page (a keyboard-avoiding view on iOS, the window itself on
 * Android), so what was asked for is looked for again each time the page
 * grows shorter.
 */
export interface PaperHost {
  /** hold the page still while the pen is in hand (true), or let it scroll again */
  lock: (still: boolean) => void;
  /** move the page by `dy` points, as two fingers on the sheet do while drawing */
  by: (dy: number) => void;
  /**
   * Keep `view` in sight: all of it, or only its last `tail` points, with
   * `room` points to spare under it — until it is asked again, or forgotten
   * with null; or `once`, brought into sight now and not looked for again.
   */
  reveal: (view: View | null, options?: { tail?: number; room?: number; once?: boolean }) => void;
}

/** The room left under what is being typed, so the line after it shows too. */
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
  // where the page is, how tall the part of it in sight is, and how tall it is in all: read as they change
  const at = useRef({ y: 0, seen: 0, content: 0 });
  const wanted = useRef<Ask | null>(null);

  const { host, look } = useMemo(() => {
    const scrollTo = (y: number): void => {
      const most = Math.max(0, at.current.content - at.current.seen);
      const to = Math.max(0, most > 0 ? Math.min(most, y) : y);
      at.current.y = to;
      ref.current?.scrollTo({ y: to, animated: false });
    };
    /** Where `ask` is against the part of the page in sight, and the page moved just enough to show it. */
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
          // down far enough for its foot to show, but never so far that its head goes out of sight above
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
        // the keyboard has come up and taken its room: what is being typed is looked for again
        if (shrank) look();
      },
      onContentSizeChange: (_w, h) => {
        at.current.content = h;
      },
    },
    host,
  };
}
