import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SELECTOR_LENS, TAB_BAR_SCROLL, tabBarScroll } from '@kurda/shared';
import { dropLens, lensSupported, takeLens, type Lens } from '@kurda/shared/src/glass-lens';
import { SelectorLens } from '../lib/selectorLens';
import { useAuth } from '../auth/AuthProvider';
import { UserIcon } from '../components/icons';
import type { NavItem } from '../components/TopNav';
import { useT } from '../i18n/I18nProvider';

/**
 * The phone's bar of places (`useNavLinks`), floating over the bottom of the window like the phone app's
 * (mobile/src/navigation/TabBar.tsx): a pill of neutral glass, each place a filled glyph with its name under it; the page
 * leaves room for it (shell.css).
 *
 * The current place wears the accent on its glyph and name, cross-fading as it changes, over a darker capsule of glass
 * that springs over to it as a lens magnifying the places it passes over, moved by transform alone. Something new
 * waiting (unread messages, a gift or a request) is a small red dot, said in the link's name. While the page scrolls
 * down the bar shrinks out of the way and comes back on a short scroll up (shared tab-bar-scroll.ts). Pressing the
 * current place scrolls to the top. Visitors see their two places and Sign in. It is mirrored in Arabic and Soranî,
 * drawn only on place roots (`isPlaceRoot`), and comes after the page in the document as the `nav` of places.
 */
export function PlacesBar({ links }: { links: readonly NavItem[] }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const { pathname } = useLocation();

  const items: readonly NavItem[] =
    status === 'signedIn' ? links : [...links, { key: 'login', label: t('nav.login'), to: '/login', icon: <UserIcon size={22} /> }];
  // counted from the reading edge; the styles turn it into a place along the bar, in either direction
  const at = items.findIndex((l) => l.owns?.(pathname));

  // One place's width and the row's height, in pixels, for the capsule's transforms (CSS cannot divide one length by
  // another); measured before the first paint, so the capsule is there from the start.
  const row = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ slot: 0, height: 0 });
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = (): void =>
      setBox((had) => {
        const slot = el.clientWidth / Math.max(items.length, 1);
        const height = el.clientHeight;
        return had.slot === slot && had.height === height ? had : { slot, height };
      });
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [items.length]);

  // The capsule and the lens over it move by the shared selector motion (lib/selectorLens.ts): placed on the first draw
  // and after a resize, lifted into the lens and glided on each change of place.
  const parts = {
    group: useRef<HTMLSpanElement>(null),
    start: useRef<HTMLSpanElement>(null),
    end: useRef<HTMLSpanElement>(null),
    span: useRef<HTMLSpanElement>(null),
    lens: useRef<HTMLSpanElement>(null),
  };
  const runner = useRef<SelectorLens | null>(null);
  const placed = useRef<number | null>(null);
  useLayoutEffect(() => {
    const { group, start, end, span, lens } = parts;
    if (!group.current || !start.current || !end.current || !span.current || box.slot <= 0 || at < 0) return;
    const size = { slot: box.slot, height: box.height, width: box.slot * items.length };
    runner.current ??= new SelectorLens({ group: group.current, start: start.current, end: end.current, span: span.current, lens: lens.current }, size);
    if (placed.current === null || placed.current === at) runner.current.place(at, size);
    else runner.current.moveTo(at);
    placed.current = at;
    // Reads the refs as they are; a new runner is made only when the capsule itself is drawn again.
  }, [at, box.slot, box.height, items.length]);
  useEffect(() => () => runner.current?.stop(), []);

  // Where the browser can bend with an SVG filter (Chromium), the lens's rim also bends the magnified places, red split
  // from blue.
  useEffect(() => {
    const el = parts.lens.current;
    if (!el || box.slot <= 0 || !lensSupported()) return;
    const made: Lens = takeLens({ width: box.slot, height: box.height, radius: box.height / 2 }, Math.min(window.devicePixelRatio || 1, 3), true, SELECTOR_LENS.rim);
    if (made.filter) {
      el.style.setProperty('--lens-filter', `url(#${made.filter})`);
      el.dataset.bends = '';
    }
    return () => {
      dropLens(made);
      el.style.removeProperty('--lens-filter');
      delete el.dataset.bends;
    };
    // The lens is cut to one place at rest; its stretch and lift scale it.
  }, [box.slot, box.height]);

  // Small while the page scrolls down; each page starts with the bar full size.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const rule = tabBarScroll();
    const onScroll = () => setCompact(rule.note(window.scrollY));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      setCompact(false);
    };
  }, [pathname]);

  return (
    <nav
      className={`places-bar glass${compact ? ' is-compact' : ''}`}
      aria-label={t('nav.primary')}
      style={{ '--compact': TAB_BAR_SCROLL.compactScale } as React.CSSProperties}
    >
      <div ref={row} className="places-row" style={{ '--places': items.length } as React.CSSProperties}>
        {at >= 0 && (
          // Two round ends and the span between them, so the ends stay round however far it stretches.
          <span className="places-track" aria-hidden="true">
            <span ref={parts.group} className="places-capsule">
              <span ref={parts.start} className="places-cap is-start" />
              <span ref={parts.span} className="places-span" />
              <span ref={parts.end} className="places-cap is-end" />
            </span>
          </span>
        )}
        <ul className="places-list">
          {items.map((l, i) => {
            const active = i === at;
            const badge = l.badge ?? 0;
            // the place's name, with what is waiting in words: the dot itself is only drawn
            const spoken = badge > 0 ? t('nav.tabUnread', { place: l.label, count: badge }) : l.dot ? t('nav.tabWaiting', { place: l.label }) : l.label;
            const face = <PlaceFace item={l} active={active} />;
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
        {/*
         * The lens: clear glass over the places while the choice moves, showing a copy of them magnified about its middle,
         * which slides through it as it goes, on the bar's own ground so the places beneath never show through
         * (lib/selectorLens.ts `LensInside`). The copy is only drawn: hidden from screen readers and out of reach.
         */}
        {at >= 0 && (
          <span className="places-lens-layer" aria-hidden="true" inert>
            <span ref={parts.lens} className="places-lens">
              <span className="places-lens-glass" data-lens-glass="">
                <span className="places-lens-unspread" data-lens-unspread="">
                  <span className="places-lens-tint" data-lens-tint="" />
                  <ul className="places-list places-lens-copy" data-lens-copy="">
                    {items.map((l, i) => (
                      <li key={l.key ?? l.to}>
                        <span className={`places-link${i === at ? ' active' : ''}`}>
                          <PlaceFace item={l} active={i === at} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </span>
              </span>
              <span className="places-lens-rim" data-lens-rim="" />
            </span>
          </span>
        )}
      </div>
    </nav>
  );
}

/** A place's filled glyph, as the reference bars draw them, with its dot, over its name, which the link already says. */
function PlaceFace({ item, active }: { item: NavItem; active: boolean }): React.JSX.Element {
  const badge = item.badge ?? 0;
  return (
    <>
      <span className="places-glyph" aria-hidden="true">
        {item.key === 'profile' ? (active && item.activeIcon ? item.activeIcon : item.icon) : (item.activeIcon ?? item.icon)}
        {badge > 0 || item.dot ? <span className="nav-dot" /> : null}
      </span>
      <span className="places-name" aria-hidden="true">
        {item.label}
      </span>
    </>
  );
}
