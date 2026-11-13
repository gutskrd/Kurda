import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * A new page starts at its top; Back and Forward land where the reader was.
 *
 * A router does not scroll. Going to /about from halfway down the front page
 * left you halfway down About, and inside the app opening a post from far down
 * the wall opened the post far down too. So a move to another page — a link
 * followed, a place chosen in the bar — puts the window at the top, and a
 * section link (`/#learn`) lands on its section.
 *
 * Only a new page, though: Back and Forward (`POP`) are the browser's to
 * restore, and it puts you back where you were. And only another page: a
 * filter, a tab or a conversation chosen changes what follows the `?`, not the
 * page, and the reader stays where they are. The jump is instant because the
 * site scrolls smoothly (styles/base.css), and a page that glides up from
 * where the last one left off reads as the old page moving, not a new one.
 *
 * The anchor is decoded so an id written in Kurdish letters still matches,
 * but an address somebody typed or cut short (`#%E0%A4%A`) does not decode,
 * and `decodeURIComponent` throws. Nothing above a layout would catch that,
 * so the whole page went blank; such an anchor is looked up as it was
 * written, finds nothing, and the page stays.
 *
 * One hook for every shell that scrolls with the window: the public pages
 * (layouts/MarketingLayout.tsx) and the app (layouts/AppLayout.tsx), each
 * through `PageTop` below.
 */
export function usePageTop(): void {
  const { pathname, hash } = useLocation();
  const navigation = useNavigationType();
  // the page last seen to, so only a move to another one counts: how the reader got here (`navigation`) also
  // changes with the first filter chosen on a page that was loaded directly, and that is not a new page
  const seen = useRef<string | null>(null);
  useLayoutEffect(() => {
    const here = `${pathname}${hash}`;
    if (seen.current === here) return;
    seen.current = here;
    if (hash) {
      let id = hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* not percent-encoding after all: look it up as written */
      }
      document.getElementById(id)?.scrollIntoView();
      return;
    }
    if (navigation !== 'POP' && window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash, navigation]);
}

/**
 * `usePageTop`, as the first thing a shell draws.
 *
 * Where it is drawn is the point. A page may put the reader somewhere of its
 * own as it opens — a course's path opens on the skill to do now — and an
 * effect of the shell itself runs after every effect of the page inside it, so
 * the shell's "start at the top" would undo the page's own place. Drawn before
 * the page, this runs first: the window is at the top by the time the page
 * decides where it wants to be.
 */
export function PageTop(): null {
  usePageTop();
  return null;
}
