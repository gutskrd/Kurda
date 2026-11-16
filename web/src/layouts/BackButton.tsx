import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronIcon } from '../components/icons';
import type { NavItem } from '../components/TopNav';
import { useT } from '../i18n/I18nProvider';
import { rootAbove } from './roots';
import { stepsBack } from './trail';

/** What the page on screen has asked to be told, in place of being left. */
let asksFirst: (() => void) | null = null;

/**
 * For a page with something to lose by leaving: a game on one phone, whose
 * cards and points live only on the page. Such a page asks before its own
 * way back lets go, and the way back in a phone's top bar is one more way
 * out of it, in the corner a thumb goes to first. While `ask` is given, that
 * way back calls it and goes nowhere, and the page asks as it would have.
 * Null while there is nothing to lose.
 */
export function useAsksBeforeLeaving(ask: (() => void) | null): void {
  // the page's newest answer, without the bar being told again on every draw
  const latest = useRef(ask);
  latest.current = ask;
  const asks = ask !== null;
  useEffect(() => {
    if (!asks) return;
    const mine = (): void => latest.current?.();
    asksFirst = mine;
    return () => {
      if (asksFirst === mine) asksFirst = null;
    };
  }, [asks]);
}

/**
 * Where the way back leads when nothing behind the page is worth going back
 * to: the root it stands under, or else the root of the place that owns it
 * (as the bar of places gives it), or else Home, which everybody has.
 */
export function rootFor(pathname: string, links: readonly NavItem[]): string {
  return rootAbove(pathname) ?? links.find((l) => l.owns?.(pathname))?.to ?? '/app';
}

/**
 * The way back from a page you went into, on a phone: a disc at the reading
 * edge of the top bar, where a place's root has the brand.
 *
 * It is the same shape in the same place on every deeper page, as it is in
 * the phone app (mobile/src/navigation/BackButton.tsx): the first thing at
 * the top, a whole fingertip across, floating a little off the page like the
 * actions opposite it, so leaving a page never has to be looked for. A
 * chevron and no word: a "Back" beside it costs the bar's room in every
 * language, and more in German and Soranî than in English.
 *
 * It goes back the way you came when you came from inside the site, through
 * the browser's own history, passing over a lesson on the way (trail.ts says
 * why). A page opened cold has nothing of ours behind it, so there it leads
 * to the root the page belongs under, and takes the page's place in the
 * history: having gone back, the browser's own Back should not walk forward
 * into it again. A page with something to lose is asked first
 * (`useAsksBeforeLeaving`).
 *
 * In Arabic and Soranî the bar is mirrored, so the disc is on the right, and
 * its chevron points right, which is the direction "back" is for a reader of
 * those scripts (`.back-chevron`, shell.css).
 */
export function BackButton({ links }: { links: readonly NavItem[] }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const back = (): void => {
    if (asksFirst) {
      asksFirst();
      return;
    }
    const steps = stepsBack(pathname + search);
    if (steps !== null) navigate(steps);
    else navigate(rootFor(pathname, links), { replace: true });
  };

  return (
    <button type="button" className="nav-back" aria-label={t('report.back')} onClick={back}>
      <ChevronIcon size={22} className="back-chevron" />
    </button>
  );
}
