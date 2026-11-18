import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scrolls to the top on a move to a new page, or to the section of a hash link (`/#learn`); Back and Forward (`POP`)
 * and query-only changes keep the position. The jump is instant, overriding the site's smooth scrolling
 * (styles/base.css). A hash that does not decode is looked up as written rather than throwing.
 */
function usePageTop(): void {
  const { pathname, hash } = useLocation();
  const navigation = useNavigationType();
  // The last page seen, so only a move to another page counts; the navigation type also changes on a page's first
  // filter after a direct load, which is not a new page.
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
 * `usePageTop` as the first thing a shell draws (layouts/MarketingLayout.tsx, layouts/AppLayout.tsx). A shell's own
 * effect would run after the page's and undo a page's own scroll position, so this runs before the page.
 */
export function PageTop(): null {
  usePageTop();
  return null;
}
