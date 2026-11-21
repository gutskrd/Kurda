import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { UserIcon } from '../components/icons';
import { countLabel, type NavItem } from '../components/TopNav';
import { useT } from '../i18n/I18nProvider';
import { useGlass } from '../glass/useGlass';

/** How far the words may shrink together on a narrow phone before the longest is cut short instead. */
const WORD_MIN_FIT = 0.6;

/**
 * The share of the text size every place's word is drawn at: 1 where the longest, in its heavier chosen weight, fits its
 * share of the bar, and less, for all of them together, where it does not. Measured on a canvas, so nothing on the page
 * is laid out twice; without one the words keep their size and the longest is cut short.
 */
function useWordFit(words: readonly string[]): [React.RefObject<HTMLUListElement | null>, number] {
  const list = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState(1);
  const key = words.join('\n');
  useLayoutEffect(() => {
    const el = list.current;
    const pen = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
    if (!el || !pen) return;
    const measure = () => {
      // A place's own type, at the full text size the words are shrunk from.
      const style = getComputedStyle(el.querySelector('.places-link') ?? el);
      pen.font = `600 ${style.fontSize} ${style.fontFamily}`;
      const widest = Math.max(...key.split('\n').map((w) => pen.measureText(w).width));
      // Each place's share, less the word's own padding.
      const room = el.clientWidth / Math.max(1, words.length) - 4;
      if (widest > 0 && room > 0) setFit(Math.max(WORD_MIN_FIT, Math.min(1, room / widest)));
    };
    measure();
    void document.fonts?.ready.then(measure);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [key, words.length]);
  return [list, fit];
}

/**
 * The phone's bar of places (`useNavLinks`), floating and solid over the bottom of the window like the phone app's
 * (mobile/src/navigation/TabBar.tsx), each place an icon with its label; the page leaves room for it (shell.css).
 *
 * The current place shows a solid glyph, a heavier label and a capsule that slides to it (still under Reduce Motion).
 * Messages shows an unread count (1–9, then "9+") and Profile a dot, both also in the link's name. Pressing the
 * current place scrolls to the top. Visitors see their two places and Sign in. It is mirrored in Arabic and Soranî,
 * drawn only on place roots (`isPlaceRoot`), and comes after the page in the document as the `nav` of places.
 */
export function PlacesBar({ links }: { links: readonly NavItem[] }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const { pathname } = useLocation();
  const glass = useGlass<HTMLElement>();

  const items: readonly NavItem[] =
    status === 'signedIn' ? links : [...links, { key: 'login', label: t('nav.login'), to: '/login', icon: <UserIcon size={22} /> }];
  // counted from the reading edge; the styles turn it into a place along the bar, in either direction
  const at = items.findIndex((l) => l.owns?.(pathname));
  const [list, fit] = useWordFit(items.map((l) => l.label));

  return (
    <nav ref={glass} className="places-bar glass" aria-label={t('nav.primary')}>
      <div className="places-row" style={{ '--places': items.length, '--at': Math.max(at, 0), '--word-fit': fit } as React.CSSProperties}>
        {at >= 0 && <span className="places-capsule" aria-hidden="true" />}
        <ul ref={list} className="places-list">
          {items.map((l, i) => {
            const active = i === at;
            const badge = l.badge ?? 0;
            // what is waiting, in words: the badge and the dot themselves are only drawn
            const spoken = badge > 0 ? t('nav.tabUnread', { place: l.label, count: badge }) : l.dot ? t('nav.tabWaiting', { place: l.label }) : undefined;
            const face = (
              <>
                <span className="places-glyph" aria-hidden="true">
                  {active && l.activeIcon ? l.activeIcon : l.icon}
                  {badge > 0 ? <span className="nav-badge">{countLabel(badge)}</span> : l.dot ? <span className="nav-dot" /> : null}
                </span>
                <span className="places-word" dir="auto">
                  {l.label}
                </span>
              </>
            );
            return (
              <li key={l.key ?? l.to}>
                {l.external ? (
                  <a href={l.to} className="places-link" aria-label={spoken}>
                    {face}
                  </a>
                ) : (
                  <Link
                    to={l.to}
                    className={`places-link${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    aria-label={spoken}
                    onClick={active ? () => window.scrollTo({ top: 0 }) : undefined}
                  >
                    {face}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
