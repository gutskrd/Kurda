import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronIcon } from '../components/icons';
import type { NavItem } from '../components/TopNav';
import { useGlass } from '../glass/useGlass';
import { useT } from '../i18n/I18nProvider';
import { rootAbove } from './roots';
import { stepsBack } from './trail';

/** What the page on screen has asked to be told, in place of being left. */
let asksFirst: (() => void) | null = null;

/**
 * For a page with something to lose by leaving, such as a game on one phone: while `ask` is set, the top bar's back
 * button calls it instead of leaving. Null when there is nothing to lose.
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

/** Where back leads when nothing behind is worth returning to: the root above, the owning place’s root, or Home. */
export function rootFor(pathname: string, links: readonly NavItem[]): string {
  return rootAbove(pathname) ?? links.find((l) => l.owns?.(pathname))?.to ?? '/app';
}

/**
 * The phone back button on deeper pages: a chevron disc at the top bar's start, where roots show the brand, matching
 * the phone app (mobile/src/navigation/BackButton.tsx). It steps back through history when the visit came from inside
 * the site, skipping lessons (trail.ts); a page opened cold replaces itself with its root instead. Pages with
 * something to lose are asked first (`useAsksBeforeLeaving`). In Arabic and Soranî the bar and chevron are mirrored.
 */
export function BackButton({ links }: { links: readonly NavItem[] }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const glass = useGlass<HTMLButtonElement>();

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
    <button ref={glass} type="button" className="nav-back glass" aria-label={t('report.back')} onClick={back}>
      <ChevronIcon size={22} className="back-chevron" />
    </button>
  );
}
